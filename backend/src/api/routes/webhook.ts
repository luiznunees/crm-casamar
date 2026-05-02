import { Router, Request, Response } from 'express';
import { processIncomingMessage } from '../../services/messageService';
import { MessageType } from '@prisma/client';
import { log } from '../../utils/logger';

const router = Router();

const INSTANCE_1 = process.env.EVOLUTION_INSTANCE_1 || 'imobiliaria-numero1';
const INSTANCE_2 = process.env.EVOLUTION_INSTANCE_2 || 'imobiliaria-numero2';

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

  return null; // reações e outros ignorados
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

      await processIncomingMessage({
        phone,
        content: extracted.content,
        type: extracted.type,
        instanceNumber,
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
