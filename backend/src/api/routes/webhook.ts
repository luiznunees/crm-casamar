import { Router, Request, Response } from 'express';
import { processIncomingMessage } from '../../services/messageService';
import { MessageType } from '@prisma/client';
import prisma from '../../prisma/client';
import { log } from '../../utils/logger';
import { inboxEvents } from './inbox';
import { config } from '../../config';

const router = Router();

const INSTANCE_1 = config.evolutionInstance1;
const INSTANCE_2 = config.evolutionInstance2;


function getInstanceNumber(instanceName: string): number {
  if (instanceName === INSTANCE_1) return 1;
  if (instanceName === INSTANCE_2) return 2;
  return 1;
}

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/@.*$/, '').replace(/\D/g, '');
  if (cleaned.startsWith('55') && cleaned.length >= 12) return cleaned.slice(2);
  return cleaned;
}

function extractMessageContent(msg: any): { content: string; type: MessageType } | null {
  const m = msg?.message;
  if (!m) return null;

  if (m.conversation)
    return { content: m.conversation, type: 'TEXT' };
  if (m.extendedTextMessage?.text)
    return { content: m.extendedTextMessage.text, type: 'TEXT' };
  if (m.imageMessage)
    return { content: m.imageMessage.caption || '[Imagem recebida]', type: 'IMAGE' };
  if (m.audioMessage || m.pttMessage)
    return { content: '[Áudio recebido]', type: 'AUDIO' };
  if (m.videoMessage)
    return { content: m.videoMessage.caption || '[Vídeo recebido]', type: 'TEXT' };
  if (m.documentMessage)
    return { content: `[Documento: ${m.documentMessage.fileName || 'arquivo'}]`, type: 'TEXT' };
  if (m.stickerMessage)
    return { content: '[Sticker]', type: 'TEXT' };
  // Voto de enquete — pollUpdateMessage ou pollVoteMessage
  if (m.pollUpdateMessage) {
    const vote = m.pollUpdateMessage;
    // selectedOptions é array de strings com as opções votadas
    const selected: string[] = vote?.vote?.selectedOptions || [];
    if (selected.length > 0) {
      return { content: `[Voto] ${selected[0]}`, type: 'TEXT' };
    }
    // Se selectedOptions está vazio = pessoa desmarcou o voto
    return { content: '[Voto] [desmarcado]', type: 'TEXT' };
  }

  return null;
}

/**
 * Processa voto de enquete de campanha.
 * Se o lead tem tag "poll-pending:<tagName>", verifica se votou na opção positiva
 * e aplica a tag configurada.
 */
async function processPollVote(phone: string, voteContent: string): Promise<void> {
  // Busca o lead
  const variants = [phone, `55${phone}`];
  let lead = null;
  for (const v of variants) {
    lead = await prisma.lead.findUnique({ where: { phone: v } });
    if (lead) break;
  }
  if (!lead) return;

  // Verifica se tem enquete pendente
  const pendingTag = lead.tags.find(t => t.startsWith('poll-pending:'));
  if (!pendingTag) return;

  const tagToApply = pendingTag.replace('poll-pending:', '');
  const cleanedTags = lead.tags.filter(t => t !== pendingTag);

  // Remove o prefixo "[Voto] " para comparar
  const votedOption = voteContent.replace('[Voto] ', '').toLowerCase();

  // Detecta se é voto positivo (não contém "não", "agora não", "no")
  const isNegative = votedOption.includes('não') || votedOption.includes('nao') ||
                     votedOption.includes('agora') || votedOption.includes('no,') ||
                     votedOption === 'no';

  if (!isNegative && tagToApply) {
    // Voto positivo — aplica a tag e avança para WARMING
    const newTags = [...new Set([...cleanedTags, tagToApply])];
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        tags: newTags,
        stage: lead.stage === 'COLD' ? 'WARMING' : lead.stage,
        updatedAt: new Date(),
      },
    });
    log.ok(`🗳️  Voto SIM: ${lead.name || lead.phone} → tag "${tagToApply}" aplicada`);
  } else {
    // Voto negativo — remove o pending, adiciona opt-out
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        tags: [...cleanedTags, 'opt-out'],
        updatedAt: new Date(),
      },
    });
    log.lead(`🗳️  Voto NÃO: ${lead.name || lead.phone} → opt-out`);
  }
}

// POST /webhook/evolution
router.post('/evolution', async (req: Request, res: Response) => {
  try {
    const { event, instance, data } = req.body;

    if (!event) {
      log.warn(`Webhook sem campo "event": ${JSON.stringify(req.body).slice(0, 100)}`);
      return res.status(200).json({ ok: true });
    }

    // Loga evento recebido
    log.webhook(`Evento "${event}" | instance="${instance}"`);

    if (!['messages.upsert', 'messages.update', 'message'].includes(event)) {
      return res.status(200).json({ ok: true });
    }

    // Normaliza payload — Evolution API v1/v2 têm formatos diferentes
    let rawMessages: any[] = [];
    if (Array.isArray(data))              rawMessages = data;
    else if (Array.isArray(data?.messages)) rawMessages = data.messages;
    else if (data?.key)                   rawMessages = [data];
    else {
      log.warn(`Webhook formato desconhecido (event: ${event}): ${JSON.stringify(data).slice(0, 150)}`);
      return res.status(200).json({ ok: true });
    }

    const instanceNumber = getInstanceNumber(instance);

    for (const msg of rawMessages) {
      if (msg?.key?.fromMe === true) continue; // mensagem enviada por nós

      // Log de debug para pollUpdateMessage — ajuda a confirmar o formato real
      if (msg?.message?.pollUpdateMessage) {
        log.ok(`🗳️  POLL RAW: ${JSON.stringify(msg.message.pollUpdateMessage).slice(0, 300)}`);
      }

      const rawJid = msg?.key?.remoteJid || msg?.remoteJid || '';

      // Ignora grupos e broadcasts
      if (rawJid.includes('@g.us')) continue;
      if (rawJid.includes('@broadcast')) continue;

      // Se for @lid, usa senderPn como número real
      let phone: string;
      if (rawJid.includes('@lid')) {
        const senderPn = msg?.key?.senderPn || msg?.senderPn || '';
        phone = normalizePhone(senderPn);
      } else {
        phone = normalizePhone(rawJid);
      }

      if (!phone || phone.length < 8 || phone.length > 15) continue;

      const extracted = extractMessageContent(msg);
      if (!extracted) continue;

      log.webhook(`Evento "${event}" | chip ${instanceNumber} | de: ${phone}`);

      // Voto de enquete — processa separadamente antes do fluxo normal
      if (extracted.content.startsWith('[Voto] ')) {
        log.ok(`🗳️  Voto recebido de ${phone}: "${extracted.content}"`);
        await processPollVote(phone, extracted.content).catch(err =>
          log.error('Erro ao processar voto de enquete', err)
        );
        // Ainda passa pelo processIncomingMessage para salvar no histórico
      }

      await processIncomingMessage({
        phone,
        content: extracted.content,
        type: extracted.type,
        instanceNumber,
      });

      // Notifica clientes SSE do Inbox em tempo real
      inboxEvents.emit('inbox', {
        type: 'new_message',
        data: { phone, content: extracted.content, type: extracted.type, instanceNumber, ts: Date.now() },
      });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    log.error('Erro no webhook', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /webhook/evolution — health check
router.get('/evolution', (_req, res) => {
  res.json({ status: 'webhook ativo', timestamp: new Date().toISOString() });
});

export default router;
