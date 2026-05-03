import prisma from '../prisma/client';
import { MessageDirection, MessageType } from '@prisma/client';
import {
  sendTextMessage,
  sendTyping,
  sendAudioMessage,
  sendImageMessage,
  sendVideoMessage,
  sendDocumentMessage,
  sendPollMessage,
} from '../whatsapp/evolutionApi';
import { generateCampaignMessage } from '../ai/messageGenerator';
import { qualifyLead, detectBuyingIntent } from '../ai/leadQualifier';
import { getLeadById } from './leadService';
import { getAIConfig } from './aiConfigService';
import { stopLeadFollowUp } from './followUpService';
import { sendAutoReplyIfNeeded } from './autoReplyService';
import { tryCollectName, advanceFromCold } from './warmingFlowService';
import { injectUnicodeNoise, addAudioNoise, addImageNoise, shortHash } from '../utils/fingerprintEvasion';
import type { CampaignStep, TextStep, ImageStep, AudioStep, VideoStep, DocumentStep, PollStep } from '../types/campaignStep';
import { log } from '../utils/logger';

// ── Persistência ──────────────────────────────────────────────────────────────

export async function saveMessage(data: {
  leadId: string;
  direction: MessageDirection;
  content: string;
  type?: MessageType;
  fromNumber?: number;
}) {
  return prisma.message.create({
    data: {
      leadId: data.leadId,
      direction: data.direction,
      content: data.content,
      type: data.type || 'TEXT',
      fromNumber: data.fromNumber,
    },
  });
}

export async function getMessagesByLead(leadId: string, limit = 50) {
  return prisma.message.findMany({
    where: { leadId },
    orderBy: { sentAt: 'asc' },
    take: limit,
  });
}

/**
 * Recalcula o engagementScore de um lead contando as mensagens recebidas diretamente
 * no banco — evita dessincronias causadas por incrementos parciais.
 */
export async function recalculateEngagementScore(leadId: string): Promise<number> {
  const count = await prisma.message.count({
    where: { leadId, direction: 'RECEIVED' },
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: { engagementScore: count },
  });

  return count;
}

/**
 * Recalcula o engagementScore para todos os leads do banco.
 * Chamado pelo endpoint admin GET /api/admin/recalculate-scores.
 */
export async function recalculateAllEngagementScores(): Promise<{ updated: number }> {
  const leads = await prisma.lead.findMany({ select: { id: true } });

  for (const lead of leads) {
    await recalculateEngagementScore(lead.id);
  }

  log.ok(`[admin] engagementScore recalculado para ${leads.length} leads`);
  return { updated: leads.length };
}


// ── Helpers de envio ──────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendBlocks(
  lead: Awaited<ReturnType<typeof getLeadById>> & object,
  blocks: string[]
): Promise<void> {
  const config = await getAIConfig();
  const delayMs = (config.blockDelaySeconds ?? 3) * 1000;

  for (let i = 0; i < blocks.length; i++) {
    if (i > 0) await sleep(delayMs);

    const rawBlock = blocks[i];

    // ── Unicode noise: cada bloco tem caracteres invisíveis únicos ──────────
    const block = injectUnicodeNoise(rawBlock, (lead as any).id + i);

    await sendTyping(lead as any, block.length);
    await sendTextMessage(lead as any, block);

    // Salva o texto limpo (sem os invisíveis) para o histórico
    await saveMessage({
      leadId: lead!.id,
      direction: 'SENT',
      content: rawBlock,
      type: 'TEXT',
      fromNumber: lead!.assignedNumber,
    });

    log.msgSent(
      `[chip ${lead!.assignedNumber}] → ${(lead as any).phone} | bloco ${i + 1}/${blocks.length}: "${rawBlock.slice(0, 60)}${rawBlock.length > 60 ? '…' : ''}"`
    );
  }

  await prisma.lead.update({
    where: { id: lead!.id },
    data: { lastMessageAt: new Date() },
  });
}

export interface MediaAttachment {
  type: 'audio' | 'image' | 'video' | 'document';
  /** @deprecated Utilize mediaUrl em vez de base64 */
  base64?: string;
  mediaUrl?: string;
  mimetype: string;
  caption?: string;
  fileName?: string;
}

async function sendMediaAttachments(
  lead: Awaited<ReturnType<typeof getLeadById>> & object,
  attachments: MediaAttachment[]
): Promise<void> {
  const config = await getAIConfig();
  const delayMs = (config.blockDelaySeconds ?? 3) * 1000;

  for (const att of attachments) {
    await sleep(delayMs);

    // ── Fingerprint evasion: hash único por lead em cada mídia ──────────────
    let noisyBase64 = att.base64;
    const originalHash = shortHash(att.base64);

    if (att.type === 'audio') {
      noisyBase64 = addAudioNoise(att.base64, att.mimetype);
    } else if (att.type === 'image' || att.type === 'video') {
      noisyBase64 = addImageNoise(att.base64, att.mimetype);
    }

    const noisyHash = shortHash(noisyBase64);
    log.ok(`[fingerprint] ${att.type} | original: ${originalHash} → noisy: ${noisyHash}`);

    switch (att.type) {
      case 'audio':
        await sendAudioMessage(lead as any, noisyBase64, att.mimetype);
        break;
      case 'image':
        await sendImageMessage(lead as any, noisyBase64, att.caption || '', att.mimetype);
        break;
      case 'video':
        await sendVideoMessage(lead as any, noisyBase64, att.caption || '', att.mimetype);
        break;
      case 'document':
        // Documentos não recebem ruído — alteração pode corromper o arquivo
        await sendDocumentMessage(lead as any, att.base64, att.fileName || 'arquivo', att.mimetype);
        break;
    }

    const contentMap: Record<string, string> = {
      audio: '[Áudio enviado]',
      image: att.caption ? `[Imagem] ${att.caption}` : '[Imagem enviada]',
      video: att.caption ? `[Vídeo] ${att.caption}` : '[Vídeo enviado]',
      document: `[Documento] ${att.fileName || 'arquivo'}`,
    };

    await saveMessage({
      leadId: lead!.id,
      direction: 'SENT',
      content: contentMap[att.type],
      type: att.type === 'audio' ? 'AUDIO' : att.type === 'image' || att.type === 'video' ? 'IMAGE' : 'TEXT',
      fromNumber: lead!.assignedNumber,
    });

    log.msgSent(`[chip ${lead!.assignedNumber}] → ${(lead as any).phone} | ${att.type}`);
  }
}

// ── Envio de campanha ─────────────────────────────────────────────────────────

export interface CampaignPoll {
  question: string;
  optionYes: string;
  optionNo: string;
  tagOnYes: string; // tag a aplicar em quem vota sim
}

export async function sendCampaignMessageToLead(
  leadId: string,
  campaignTemplate: string,
  mediaAttachments: MediaAttachment[] = [],
  poll?: CampaignPoll
): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
  const lead = await getLeadById(leadId);
  if (!lead) return { success: false, reason: 'Lead não encontrado' };

  try {
    const config = await getAIConfig();
    const delayMs = (config.blockDelaySeconds ?? 3) * 1000;

    // 1. Envia mídias primeiro (foto, vídeo, etc.)
    if (mediaAttachments.length > 0) {
      await sendMediaAttachments(lead, mediaAttachments);
      await sleep(delayMs);
    }

    // 2. Envia a mensagem de texto (variada pela IA)
    log.ai(`Gerando mensagem de campanha para ${lead.name || lead.phone}`);
    const blocks = await generateCampaignMessage(lead, campaignTemplate);
    await sendBlocks(lead, blocks);

    // 3. Envia enquete (se configurada)
    if (poll?.question) {
      // Delay maior antes da enquete — evita o "aguardando mensagem" da Evolution API
      const pollDelay = Math.max(delayMs, 5000) + 3000; // mínimo 8s após o último bloco
      await sleep(pollDelay);

      // Mostra "digitando..." antes da enquete para parecer humano
      await sendTyping(lead as any, poll.question.length);

      await sendPollMessage(lead, poll.question, [poll.optionYes, poll.optionNo], 1);

      // Marca que este lead tem uma enquete pendente com a tag configurada
      if (poll.tagOnYes) {
        const pendingTag = `poll-pending:${poll.tagOnYes}`;
        if (!lead.tags.includes(pendingTag)) {
          await prisma.lead.update({
            where: { id: leadId },
            data: { tags: { push: pendingTag }, updatedAt: new Date() },
          });
        }
      }

      await saveMessage({
        leadId: lead.id,
        direction: 'SENT',
        content: `[Enquete] ${poll.question}`,
        type: 'TEXT',
        fromNumber: lead.assignedNumber,
      });

      log.ok(`Enquete enviada para ${lead.name || lead.phone}: "${poll.question}"`);
    }

    if (!lead.firstMessageSent) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { firstMessageSent: true },
      });
    }

    log.ok(`Campanha enviada para ${lead.name || lead.phone} — ${blocks.length} bloco(s)${poll?.question ? ' + enquete' : ''}`);
    return { success: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Erro desconhecido';
    log.error(`Falha ao enviar para ${lead.name || lead.phone}`, err);
    return { success: false, reason };
  }
}

// ── Processamento de mensagem recebida ────────────────────────────────────────

export async function processIncomingMessage(data: {
  phone: string;
  content: string;
  type: MessageType;
  instanceNumber: number;
}): Promise<void> {
  const { phone, content, type, instanceNumber } = data;

  // Busca o lead tentando variantes do número
  const variants = buildPhoneVariants(phone);
  let lead = null;
  for (const variant of variants) {
    lead = await prisma.lead.findUnique({
      where: { phone: variant },
      include: { messages: { orderBy: { sentAt: 'desc' }, take: 20 } },
    });
    if (lead) break;
  }

  if (!lead) {
    log.warn(`Número não encontrado no banco: ${phone} | variantes: ${variants.join(', ')}`);
    return;
  }

  // Salva a mensagem recebida
  await saveMessage({
    leadId: lead.id,
    direction: 'RECEIVED',
    content,
    type,
    fromNumber: instanceNumber,
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      unreadCount: { increment: 1 },
      lastMessageAt: new Date(),
      engagementScore: { increment: 1 }, // cada resposta aumenta o score — leads engajados vão na frente nas campanhas
    },
  });

  log.msgRecv(
    `[chip ${instanceNumber}] ← ${lead.name || lead.phone}: "${content.slice(0, 80)}${content.length > 80 ? '…' : ''}"`
  );

  // Para follow-ups automáticos — lead respondeu
  await stopLeadFollowUp(lead.id);

  // Auto-reply fora do horário de atendimento
  await sendAutoReplyIfNeeded(lead);

  // ── Coleta passiva de nome ────────────────────────────────────────────────
  if (!lead.nameCollected && type === 'TEXT') {
    await tryCollectName(lead, content);
  }

  // ── Avança de COLD para WARMING ───────────────────────────────────────────
  await advanceFromCold(lead);

  // ── Detecção de intenção de compra (rápida, sem IA) ───────────────────────
  const allMessages = [
    ...(lead.messages || []),
    {
      id: 'new',
      leadId: lead.id,
      direction: 'RECEIVED' as MessageDirection,
      content,
      type,
      fromNumber: instanceNumber,
      sentAt: new Date(),
    },
  ];

  const intent = detectBuyingIntent(allMessages as any);
  if (intent.detected) {
    log.lead(`🎯 Intenção: ${intent.type} | "${intent.keyword}" | ${lead.name || lead.phone}`);

    const stageMap: Record<string, string> = {
      ready_to_buy: 'INTERESTED',
      price_inquiry: 'WARM',
      visit_request: 'HOT',
      financing: 'WARM',
      urgency: 'HOT',
    };
    const stageOrder = ['COLD', 'WARMING', 'WARM', 'HOT', 'INTERESTED'];
    const newStage = stageMap[intent.type || ''];

    if (newStage && stageOrder.indexOf(newStage) > stageOrder.indexOf(lead.stage)) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { stage: newStage as any, updatedAt: new Date() },
      });
      log.lead(`Stage: ${lead.stage} → ${newStage} (${lead.name || lead.phone})`);
    }
  }

  // ── Qualificação completa com IA ──────────────────────────────────────────
  // Conta mensagens recebidas no banco (não só as carregadas em memória)
  // para evitar o bug de contar apenas as últimas 20.
  const totalReceived = await prisma.message.count({
    where: { leadId: lead.id, direction: 'RECEIVED' },
  });

  // Roda a cada 3 mensagens recebidas (1ª, 4ª, 7ª, ...)
  if (totalReceived % 3 === 1) {
    setImmediate(async () => {
      try {
        const freshLead = await prisma.lead.findUnique({
          where: { id: lead.id },
          include: { messages: { orderBy: { sentAt: 'desc' }, take: 15 } },
        });
        if (!freshLead) return;

        const qualification = await qualifyLead(freshLead as any);
        if (qualification.suggestedStage && qualification.confidence >= 70) {
          const stageOrder = ['COLD', 'WARMING', 'WARM', 'HOT', 'INTERESTED'];
          const updates: any = {};

          if (
            stageOrder.indexOf(qualification.suggestedStage) >
            stageOrder.indexOf(freshLead.stage)
          ) {
            updates.stage = qualification.suggestedStage;
          }

          if (qualification.extractedTags.length > 0) {
            updates.tags = [...new Set([...freshLead.tags, ...qualification.extractedTags])];
          }

          if (Object.keys(updates).length > 0) {
            await prisma.lead.update({
              where: { id: lead.id },
              data: { ...updates, updatedAt: new Date() },
            });
            log.lead(
              `IA qualificou ${freshLead.name || freshLead.phone}: ${qualification.suggestedStage} (${qualification.confidence}%) | tags: ${qualification.extractedTags.join(', ') || 'nenhuma'}`
            );
          }
        }
      } catch (err) {
        log.error('Erro na qualificação IA', err);
      }
    });
  }
}

// ── Utilitários de telefone ───────────────────────────────────────────────────

function buildPhoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, '');
  const variants = new Set<string>();

  variants.add(digits);

  if (digits.startsWith('55') && digits.length >= 12) {
    const withoutDDI = digits.slice(2);
    variants.add(withoutDDI);
    if (withoutDDI.length === 11) {
      const ddd = withoutDDI.slice(0, 2);
      const num = withoutDDI.slice(2);
      if (num.startsWith('9')) variants.add(ddd + num.slice(1));
    }
  }

  if (!digits.startsWith('55')) {
    variants.add('55' + digits);
    if (digits.length === 10) {
      const ddd = digits.slice(0, 2);
      const num = digits.slice(2);
      variants.add(ddd + '9' + num);
      variants.add('55' + ddd + '9' + num);
    }
  }

  return Array.from(variants);
}
