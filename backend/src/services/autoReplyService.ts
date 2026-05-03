import prisma from '../prisma/client';
import { Lead } from '@prisma/client';
import { sendTextMessage, sendTyping } from '../whatsapp/evolutionApi';
import { saveMessage } from './messageService';
import { log } from '../utils/logger';

export interface AutoReplyConfigData {
  id: string;
  enabled: boolean;
  startHour: number;
  endHour: number;
  message: string;
}

export async function getAutoReplyConfig(): Promise<AutoReplyConfigData> {
  try {
    const config = await prisma.autoReplyConfig.findUnique({
      where: { id: 'default' }
    });
    if (config) {
      return {
        id: config.id,
        enabled: config.enabled,
        startHour: config.startHour,
        endHour: config.endHour,
        message: config.message,
      };
    }
    return {
      id: 'default', enabled: false, startHour: 22, endHour: 8,
      message: 'Oi {nome}! Recebi sua mensagem e vou te responder assim que possível. 😊',
    };
  } catch (_) {
    return { id: 'default', enabled: false, startHour: 22, endHour: 8, message: '' };
  }
}

export async function updateAutoReplyConfig(data: Partial<AutoReplyConfigData>) {
  const current = await getAutoReplyConfig();
  const merged = { ...current, ...data };
  
  await prisma.autoReplyConfig.upsert({
    where: { id: 'default' },
    update: {
      enabled: merged.enabled,
      startHour: merged.startHour,
      endHour: merged.endHour,
      message: merged.message,
    },
    create: {
      id: 'default',
      enabled: merged.enabled,
      startHour: merged.startHour,
      endHour: merged.endHour,
      message: merged.message,
    }
  });
  
  return getAutoReplyConfig();
}

/**
 * Verifica se o horário atual está fora do horário de atendimento.
 */
export function isOutsideBusinessHours(config: AutoReplyConfigData): boolean {
  if (!config.enabled) return false;
  const hour = new Date().getHours();
  const { startHour, endHour } = config;

  // Ex: startHour=22, endHour=8 → fora do horário das 22h às 8h
  if (startHour > endHour) {
    return hour >= startHour || hour < endHour;
  }
  // Ex: startHour=12, endHour=14 → fora das 12h às 14h
  return hour >= startHour && hour < endHour;
}

/**
 * Envia resposta automática fora do horário se configurado.
 * Retorna true se enviou.
 */
export async function sendAutoReplyIfNeeded(lead: Lead): Promise<boolean> {
  const config = await getAutoReplyConfig();
  if (!isOutsideBusinessHours(config)) return false;

  const message = config.message.replace('{nome}', lead.name || 'tudo bem?');

  try {
    await sendTyping(lead, message.length);
    await sendTextMessage(lead, message);
    await saveMessage({
      leadId: lead.id,
      direction: 'SENT',
      content: message,
      type: 'TEXT',
      fromNumber: lead.assignedNumber,
    });
    log.ok(`Auto-reply enviado para ${lead.name || lead.phone}`);
    return true;
  } catch (err) {
    log.error('Erro ao enviar auto-reply', err);
    return false;
  }
}
