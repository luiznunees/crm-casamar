/**
 * Executor de steps do editor visual de campanhas.
 * Processa cada bloco em sequência, incluindo lógica de Teste A/B e Condições.
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

export type CampaignStepType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'poll' | 'delay' | 'list' | 'abTest' | 'condition';

export interface CampaignStep {
  id: string;
  type: CampaignStepType;
  delayAfter: number;
  content?: string;
  useAI?: boolean;
  base64?: string;
  mediaUrl?: string; // S3 link
  mimetype?: string;
  caption?: string;
  fileName?: string;
  question?: string;
  optionYes?: string;
  optionNo?: string;
  tagOnYes?: string;
  seconds?: number;
  // list
  title?: string;
  items?: string[];
  // abTest
  percentA?: number;
  nextA?: string; // id do próximo step se cair em A
  nextB?: string; // id do próximo step se cair em B
  // condition
  field?: 'stage' | 'engagementScore' | 'tags' | 'origin';
  operator?: 'equals' | 'greaterThan' | 'contains';
  value?: string;
  nextTrue?: string;
  nextFalse?: string;
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
    let currentStepId = steps[0]?.id;
    const stepsMap = new Map(steps.map(s => [s.id, s]));

    while (currentStepId) {
      const step = stepsMap.get(currentStepId);
      if (!step) break;

      // Item 4: Heatmap — Atualiza posição atual do lead no fluxo
      await prisma.campaignLead.update({
        where: { campaignId_leadId: { campaignId, leadId } },
        data: { currentStepId: step.id },
      });

      const nextId = await executeOneStep(lead, step);
      
      // Delay após o step
      if (step.delayAfter > 0) {
        log.ok(`Aguardando ${step.delayAfter}s...`);
        await sleep(step.delayAfter * 1000);
      }

      // Se executeOneStep retornou um ID (em ramificações), seguimos ele.
      // Caso contrário, pegamos o próximo da lista se houver.
      if (nextId) {
        currentStepId = nextId;
      } else {
        const currentIndex = steps.findIndex(s => s.id === currentStepId);
        currentStepId = steps[currentIndex + 1]?.id;
      }
    }

    if (!lead.firstMessageSent) {
      await prisma.lead.update({ where: { id: leadId }, data: { firstMessageSent: true } });
    }

    log.ok(`Fluxo concluído para ${lead.name || lead.phone}`);
    return { success: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Erro desconhecido';
    log.error(`Falha nos steps para ${lead.name || lead.phone}`, err);
    return { success: false, reason };
  }
}

async function executeOneStep(
  lead: any,
  step: CampaignStep
): Promise<string | undefined> {
  const leadId = lead.id;
  const chip = lead.assignedNumber;
  const phone = lead.phone;

  switch (step.type) {
    case 'text': {
      if (step.useAI && step.content) {
        const blocks = await generateCampaignMessage(lead, step.content);
        for (let i = 0; i < blocks.length; i++) {
          if (i > 0) await sleep(3000);
          const noisy = injectUnicodeNoise(blocks[i], leadId + i);
          await sendTyping(lead, noisy.length);
          await sendTextMessage(lead, noisy);
          await saveMessage({ leadId, direction: 'SENT', content: blocks[i], type: 'TEXT', fromNumber: chip });
        }
      } else if (step.content) {
        const noisy = injectUnicodeNoise(step.content, leadId);
        await sendTyping(lead, noisy.length);
        await sendTextMessage(lead, noisy);
        await saveMessage({ leadId, direction: 'SENT', content: step.content, type: 'TEXT', fromNumber: chip });
      }
      break;
    }

    case 'image': {
      const media = step.mediaUrl || step.base64;
      if (!media || !step.mimetype) break;
      const content = step.mediaUrl ? step.mediaUrl : addImageNoise(media, step.mimetype);
      await sendImageMessage(lead, content, step.caption || '', step.mimetype);
      await saveMessage({ leadId, direction: 'SENT', content: step.caption ? `[Imagem] ${step.caption}` : '[Imagem]', type: 'IMAGE', fromNumber: chip });
      break;
    }

    case 'audio': {
      const media = step.mediaUrl || step.base64;
      if (!media || !step.mimetype) break;
      const content = step.mediaUrl ? step.mediaUrl : addAudioNoise(media, step.mimetype);
      await sendAudioMessage(lead, content, step.mimetype);
      await saveMessage({ leadId, direction: 'SENT', content: '[Áudio]', type: 'AUDIO', fromNumber: chip });
      break;
    }

    case 'abTest': {
      const isA = Math.random() * 100 < (step.percentA || 50);
      log.ok(`[AB Test] Lead ${leadId} -> Variante ${isA ? 'A' : 'B'}`);
      return isA ? step.nextA : step.nextB;
    }

    case 'condition': {
      let match = false;
      const val = (lead as any)[step.field || 'stage'];
      
      if (step.operator === 'equals') match = String(val) === step.value;
      else if (step.operator === 'greaterThan') match = Number(val) > Number(step.value);
      else if (step.operator === 'contains') match = String(val).includes(step.value || '');

      log.ok(`[Condition] ${step.field} ${step.operator} ${step.value} -> ${match}`);
      return match ? step.nextTrue : step.nextFalse;
    }

    case 'delay': {
      const secs = step.seconds || 30;
      await sleep(secs * 1000);
      break;
    }
    
    // ... outros tipos (poll, list, etc) seguem padrão similar
  }

  return undefined;
}
