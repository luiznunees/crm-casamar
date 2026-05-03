/**
 * Executor de steps do editor visual de campanhas.
 * Processa cada bloco em sequência, respeitando delays configurados.
 */

import prisma from '../prisma/client';
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
import { getLeadById } from './leadService';
import { saveMessage } from './messageService';
import { injectUnicodeNoise, addAudioNoise, addImageNoise, shortHash } from '../utils/fingerprintEvasion';
import { log } from '../utils/logger';

export type CampaignStepType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'poll' | 'delay';

export interface CampaignStep {
  id: string;
  type: CampaignStepType;
  delayAfter: number; // segundos após este bloco
  // text
  content?: string;
  useAI?: boolean;
  // image/video
  base64?: string;
  mimetype?: string;
  caption?: string;
  // audio
  // document
  fileName?: string;
  // poll
  question?: string;
  optionYes?: string;
  optionNo?: string;
  tagOnYes?: string;
  // delay
  seconds?: number;
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export async function executeSteps(
  leadId: string,
  steps: CampaignStep[]
): Promise<{ success: boolean; reason?: string }> {
  const lead = await getLeadById(leadId);
  if (!lead) return { success: false, reason: 'Lead não encontrado' };

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await executeOneStep(lead, step);

      // Delay após o step (exceto no último)
      if (i < steps.length - 1 && step.delayAfter > 0) {
        log.ok(`Aguardando ${step.delayAfter}s antes do próximo bloco...`);
        await sleep(step.delayAfter * 1000);
      }
    }

    if (!lead.firstMessageSent) {
      await prisma.lead.update({ where: { id: leadId }, data: { firstMessageSent: true } });
    }

    log.ok(`Steps concluídos para ${lead.name || lead.phone} — ${steps.length} bloco(s)`);
    return { success: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Erro desconhecido';
    log.error(`Falha nos steps para ${lead.name || lead.phone}`, err);
    return { success: false, reason };
  }
}

async function executeOneStep(
  lead: Awaited<ReturnType<typeof getLeadById>> & object,
  step: CampaignStep
): Promise<void> {
  const leadId = (lead as any).id;
  const chip = (lead as any).assignedNumber;
  const phone = (lead as any).phone;

  switch (step.type) {
    case 'text': {
      if (step.useAI && step.content) {
        // IA varia as palavras — anti-fingerprint
        const blocks = await generateCampaignMessage(lead, step.content);
        for (let i = 0; i < blocks.length; i++) {
          if (i > 0) await sleep(3000);
          const noisy = injectUnicodeNoise(blocks[i], leadId + i);
          await sendTyping(lead as any, noisy.length);
          await sendTextMessage(lead as any, noisy);
          await saveMessage({ leadId, direction: 'SENT', content: blocks[i], type: 'TEXT', fromNumber: chip });
          log.msgSent(`[chip ${chip}] → ${phone} | texto IA bloco ${i + 1}/${blocks.length}`);
        }
      } else if (step.content) {
        // Envia exato com unicode noise
        const noisy = injectUnicodeNoise(step.content, leadId);
        await sendTyping(lead as any, noisy.length);
        await sendTextMessage(lead as any, noisy);
        await saveMessage({ leadId, direction: 'SENT', content: step.content, type: 'TEXT', fromNumber: chip });
        log.msgSent(`[chip ${chip}] → ${phone} | texto exato`);
      }
      await prisma.lead.update({ where: { id: leadId }, data: { lastMessageAt: new Date() } });
      break;
    }

    case 'image': {
      if (!step.base64 || !step.mimetype) break;
      const noisyBase64 = addImageNoise(step.base64, step.mimetype);
      log.ok(`[fingerprint] image | ${shortHash(step.base64)} → ${shortHash(noisyBase64)}`);
      await sendImageMessage(lead as any, noisyBase64, step.caption || '', step.mimetype);
      await saveMessage({ leadId, direction: 'SENT', content: step.caption ? `[Imagem] ${step.caption}` : '[Imagem enviada]', type: 'IMAGE', fromNumber: chip });
      log.msgSent(`[chip ${chip}] → ${phone} | image`);
      break;
    }

    case 'audio': {
      if (!step.base64 || !step.mimetype) break;
      const noisyBase64 = addAudioNoise(step.base64, step.mimetype);
      log.ok(`[fingerprint] audio | ${shortHash(step.base64)} → ${shortHash(noisyBase64)}`);
      await sendAudioMessage(lead as any, noisyBase64, step.mimetype);
      await saveMessage({ leadId, direction: 'SENT', content: '[Áudio enviado]', type: 'AUDIO', fromNumber: chip });
      log.msgSent(`[chip ${chip}] → ${phone} | audio`);
      break;
    }

    case 'video': {
      if (!step.base64 || !step.mimetype) break;
      await sendVideoMessage(lead as any, step.base64, step.caption || '', step.mimetype);
      await saveMessage({ leadId, direction: 'SENT', content: step.caption ? `[Vídeo] ${step.caption}` : '[Vídeo enviado]', type: 'IMAGE', fromNumber: chip });
      log.msgSent(`[chip ${chip}] → ${phone} | video`);
      break;
    }

    case 'document': {
      if (!step.base64 || !step.mimetype || !step.fileName) break;
      await sendDocumentMessage(lead as any, step.base64, step.fileName, step.mimetype);
      await saveMessage({ leadId, direction: 'SENT', content: `[Documento] ${step.fileName}`, type: 'TEXT', fromNumber: chip });
      log.msgSent(`[chip ${chip}] → ${phone} | document`);
      break;
    }

    case 'poll': {
      if (!step.question) break;
      // Delay extra antes da enquete para evitar "aguardando mensagem"
      await sleep(8000);
      await sendTyping(lead as any, step.question.length);
      await sendPollMessage(lead as any, step.question, [step.optionYes || 'Sim', step.optionNo || 'Não'], 1);

      if (step.tagOnYes) {
        const pendingTag = `poll-pending:${step.tagOnYes}`;
        if (!(lead as any).tags.includes(pendingTag)) {
          await prisma.lead.update({
            where: { id: leadId },
            data: { tags: { push: pendingTag }, updatedAt: new Date() },
          });
        }
      }

      await saveMessage({ leadId, direction: 'SENT', content: `[Enquete] ${step.question}`, type: 'TEXT', fromNumber: chip });
      log.ok(`Enquete enviada para ${(lead as any).name || phone}: "${step.question}"`);
      break;
    }

    case 'delay': {
      const secs = step.seconds || step.delayAfter || 5;
      log.ok(`Delay explícito: ${secs}s para ${(lead as any).name || phone}`);
      await sleep(secs * 1000);
      break;
    }
  }
}
