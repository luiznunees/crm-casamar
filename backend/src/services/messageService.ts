import prisma from '../prisma/client';
import { MessageDirection, MessageType } from '@prisma/client';
import { sendTextMessage, sendTyping, sendAudioMessage, sendImageMessage, sendVideoMessage, sendDocumentMessage } from '../whatsapp/evolutionApi';
import { generateNameRequestMessage, generateCampaignMessage } from '../ai/messageGenerator';
import { qualifyLead, detectBuyingIntent } from '../ai/leadQualifier';
import { getLeadById } from './leadService';
import { getAIConfig } from './aiConfigService';
import { stopLeadFollowUp } from './followUpService';
import { sendAutoReplyIfNeeded } from './autoReplyService';
import { processWarmingResponse } from './warmingFlowService';
import { log } from '../utils/logger';

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
    // Delay entre blocos (não antes do primeiro)
    if (i > 0) await sleep(delayMs);

    const block = blocks[i];

    // Mostra "digitando..." proporcional ao tamanho do bloco
    await sendTyping(lead as any, block.length);

    // Envia a mensagem
    await sendTextMessage(lead as any, block);

    await saveMessage({
      leadId: lead!.id,
      direction: 'SENT',
      content: block,
      type: 'TEXT',
      fromNumber: lead!.assignedNumber,
    });

    log.msgSent(`[chip ${lead!.assignedNumber}] → ${lead!.phone} | bloco ${i + 1}/${blocks.length}: "${block.slice(0, 60)}${block.length > 60 ? '…' : ''}"`);
  }

  await prisma.lead.update({
    where: { id: lead!.id },
    data: { lastMessageAt: new Date() },
  });
}

export async function sendNameRequestMessage(leadId: string): Promise<void> {
  const lead = await getLeadById(leadId);
  if (!lead) throw new Error(`Lead ${leadId} não encontrado`);

  if (lead.firstMessageSent) {
    log.skip(`Lead ${lead.name || lead.phone} já recebeu mensagem de coleta de nome`);
    return;
  }

  if (lead.name && lead.nameCollected) {
    log.skip(`Lead ${lead.name} já tem nome coletado`);
    return;
  }

  log.ai(`Gerando mensagem de coleta de nome para ${lead.phone}`);
  const blocks = await generateNameRequestMessage(lead);
  await sendBlocks(lead, blocks);

  await prisma.lead.update({
    where: { id: leadId },
    data: { firstMessageSent: true },
  });

  log.ok(`Coleta de nome enviada para ${lead.phone} (${blocks.length} bloco(s))`);
}

export interface MediaAttachment {
  type: 'audio' | 'image' | 'video' | 'document';
  base64: string;
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

    switch (att.type) {
      case 'audio':
        await sendAudioMessage(lead as any, att.base64, att.mimetype);
        break;
      case 'image':
        await sendImageMessage(lead as any, att.base64, att.caption || '', att.mimetype);
        break;
      case 'video':
        await sendVideoMessage(lead as any, att.base64, att.caption || '', att.mimetype);
        break;
      case 'document':
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

export async function sendCampaignMessageToLead(
  leadId: string,
  campaignTemplate: string,
  mediaAttachments: MediaAttachment[] = []
): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
  const lead = await getLeadById(leadId);
  if (!lead) return { success: false, reason: 'Lead não encontrado' };

  try {
    // Gera mensagem — se não tem nome, a IA gera sem usar o nome
    log.ai(`Gerando mensagem de campanha para ${lead.name || lead.phone}`);
    const blocks = await generateCampaignMessage(lead, campaignTemplate);
    await sendBlocks(lead, blocks);

    if (mediaAttachments.length > 0) {
      await sendMediaAttachments(lead, mediaAttachments);
    }

    // Marca que já enviou a primeira mensagem (para o warming flow saber)
    if (!lead.firstMessageSent) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { firstMessageSent: true },
      });
    }

    log.ok(`Campanha enviada para ${lead.name || lead.phone} — ${blocks.length} bloco(s)`);
    return { success: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Erro desconhecido';
    log.error(`Falha ao enviar para ${lead.name || lead.phone}`, err);
    return { success: false, reason };
  }
}

export async function processIncomingMessage(data: {
  phone: string;
  content: string;
  type: MessageType;
  instanceNumber: number;
}): Promise<void> {
  const { phone, content, type, instanceNumber } = data;

  const variants = buildPhoneVariants(phone);
  let lead = null;
  for (const variant of variants) {
    lead = await prisma.lead.findUnique({
      where: { phone: variant },
      include: { messages: { orderBy: { sentAt: 'desc' }, take: 5 } },
    });
    if (lead) break;
  }

  if (!lead) {
    log.warn(`Número não encontrado no banco: ${phone} | variantes: ${variants.join(', ')}`);
    return;
  }

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
    },
  });

  log.msgRecv(`[chip ${instanceNumber}] ← ${lead.name || lead.phone}: "${content.slice(0, 80)}${content.length > 80 ? '…' : ''}"`);

  // Lead respondeu → para o follow-up automático
  await stopLeadFollowUp(lead.id);

  // Auto-reply fora do horário
  await sendAutoReplyIfNeeded(lead);

  // Processa fluxo de aquecimento (lead sem nome, COLD)
  // Se o fluxo processar a resposta, não executa as outras lógicas de nome
  const handledByWarmingFlow = await processWarmingResponse(lead, content).catch(() => false);

  if (!handledByWarmingFlow) {
    // Tenta extrair nome se COLD sem nome (fallback do fluxo antigo)
    if (!lead.nameCollected && lead.firstMessageSent && type === 'TEXT') {
      const extractedName = extractNameFromMessage(content);
      if (extractedName) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { name: extractedName, nameCollected: true, stage: 'WARMING', updatedAt: new Date() },
        });
        log.lead(`Nome coletado: "${extractedName}" (${lead.phone})`);
      }
    }
  }

  // Detecção de intenção de compra (rápida, sem IA)
  const allMessages = [...(lead.messages || []), {
    id: 'new', leadId: lead.id, direction: 'RECEIVED' as MessageDirection,
    content, type, fromNumber: instanceNumber, sentAt: new Date(),
  }];
  const intent = detectBuyingIntent(allMessages as any);
  if (intent.detected) {
    log.lead(`🎯 Intenção: ${intent.type} | "${intent.keyword}" | ${lead.name || lead.phone}`);
    const stageMap: Record<string, string> = {
      ready_to_buy: 'INTERESTED', price_inquiry: 'WARM',
      visit_request: 'HOT', financing: 'WARM', urgency: 'HOT',
    };
    const stageOrder = ['COLD', 'WARMING', 'WARM', 'HOT', 'INTERESTED'];
    const newStage = stageMap[intent.type || ''];
    if (newStage && stageOrder.indexOf(newStage) > stageOrder.indexOf(lead.stage)) {
      await prisma.lead.update({ where: { id: lead.id }, data: { stage: newStage as any, updatedAt: new Date() } });
      log.lead(`Stage: ${lead.stage} → ${newStage} (${lead.name || lead.phone})`);
    }
  }

  // Qualificação completa com IA a cada 3 mensagens recebidas
  const receivedCount = (lead.messages || []).filter((m) => m.direction === 'RECEIVED').length;
  if (receivedCount >= 2 && receivedCount % 3 === 0) {
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
          if (stageOrder.indexOf(qualification.suggestedStage) > stageOrder.indexOf(freshLead.stage)) {
            updates.stage = qualification.suggestedStage;
          }
          if (qualification.extractedTags.length > 0) {
            updates.tags = [...new Set([...freshLead.tags, ...qualification.extractedTags])];
          }
          if (Object.keys(updates).length > 0) {
            await prisma.lead.update({ where: { id: lead.id }, data: { ...updates, updatedAt: new Date() } });
            log.lead(`IA qualificou ${freshLead.name || freshLead.phone}: ${qualification.suggestedStage} | ${qualification.extractedTags.join(', ')}`);
          }
        }
      } catch (err) { log.error('Erro na qualificação IA', err); }
    });
  }
}

function extractNameFromMessage(content: string): string | null {
  const cleaned = content.trim();
  if (cleaned.length > 60) return null;

  const patterns = [
    /^(?:me chamo|meu nome é|sou o|sou a|pode me chamar de|pode chamar de)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i,
    /^([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)$/,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]?.trim().length >= 2) return match[1].trim();
  }
  return null;
}

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
