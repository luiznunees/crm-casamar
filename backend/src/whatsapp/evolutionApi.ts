import { Lead } from '@prisma/client';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const INSTANCE_1 = process.env.EVOLUTION_INSTANCE_1 || 'imobiliaria-numero1';
const INSTANCE_2 = process.env.EVOLUTION_INSTANCE_2 || 'imobiliaria-numero2';

function getInstanceName(assignedNumber: number): string {
  return assignedNumber === 1 ? INSTANCE_1 : INSTANCE_2;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function evolutionRequest(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown
): Promise<unknown> {
  const url = `${EVOLUTION_API_URL}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Evolution API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * Converte um arquivo (Buffer ou base64) para base64 string.
 */
function toBase64(data: string | Buffer): string {
  if (typeof data === 'string') return data;
  return data.toString('base64');
}

// ── Presence / Typing ────────────────────────────────────────────────────────

export async function sendTyping(lead: Lead, textLength: number): Promise<void> {
  const instance = getInstanceName(lead.assignedNumber);
  const phone = normalizePhone(lead.phone);
  const typingMs = Math.min(Math.max(Math.round(textLength / 40) * 1000, 1500), 6000);

  try {
    await evolutionRequest('POST', `/chat/sendPresence/${instance}`, {
      number: phone,
      options: { presence: 'composing', delay: typingMs },
    });
    await sleep(typingMs);
    await evolutionRequest('POST', `/chat/sendPresence/${instance}`, {
      number: phone,
      options: { presence: 'paused', delay: 500 },
    }).catch(() => {});
  } catch (_) {}
}

// ── Text ─────────────────────────────────────────────────────────────────────

export async function sendTextMessage(
  lead: Lead,
  message: string
): Promise<{ messageId: string }> {
  const instance = getInstanceName(lead.assignedNumber);
  const phone = normalizePhone(lead.phone);

  const result = await evolutionRequest('POST', `/message/sendText/${instance}`, {
    number: phone,
    text: message,
    delay: 1200,
  }) as { key?: { id?: string } };

  return { messageId: result?.key?.id || 'unknown' };
}

// ── Audio ────────────────────────────────────────────────────────────────────

export async function sendAudioMessage(
  lead: Lead,
  audioBase64: string,
  mimetype = 'audio/ogg; codecs=opus'
): Promise<{ messageId: string }> {
  const instance = getInstanceName(lead.assignedNumber);
  const phone = normalizePhone(lead.phone);

  // PTT (push-to-talk) = aparece como áudio de voz no WhatsApp
  const result = await evolutionRequest('POST', `/message/sendMedia/${instance}`, {
    number: phone,
    mediatype: 'audio',
    mimetype,
    media: audioBase64,
    delay: 1000,
  }) as { key?: { id?: string } };

  return { messageId: result?.key?.id || 'unknown' };
}

// ── Image ────────────────────────────────────────────────────────────────────

export async function sendImageMessage(
  lead: Lead,
  imageBase64: string,
  caption = '',
  mimetype = 'image/jpeg'
): Promise<{ messageId: string }> {
  const instance = getInstanceName(lead.assignedNumber);
  const phone = normalizePhone(lead.phone);

  const result = await evolutionRequest('POST', `/message/sendMedia/${instance}`, {
    number: phone,
    mediatype: 'image',
    mimetype,
    media: imageBase64,
    caption,
    delay: 1200,
  }) as { key?: { id?: string } };

  return { messageId: result?.key?.id || 'unknown' };
}

// ── Video ────────────────────────────────────────────────────────────────────

export async function sendVideoMessage(
  lead: Lead,
  videoBase64: string,
  caption = '',
  mimetype = 'video/mp4'
): Promise<{ messageId: string }> {
  const instance = getInstanceName(lead.assignedNumber);
  const phone = normalizePhone(lead.phone);

  const result = await evolutionRequest('POST', `/message/sendMedia/${instance}`, {
    number: phone,
    mediatype: 'video',
    mimetype,
    media: videoBase64,
    caption,
    delay: 1500,
  }) as { key?: { id?: string } };

  return { messageId: result?.key?.id || 'unknown' };
}

// ── Document ─────────────────────────────────────────────────────────────────

export async function sendDocumentMessage(
  lead: Lead,
  docBase64: string,
  fileName: string,
  mimetype = 'application/pdf'
): Promise<{ messageId: string }> {
  const instance = getInstanceName(lead.assignedNumber);
  const phone = normalizePhone(lead.phone);

  const result = await evolutionRequest('POST', `/message/sendMedia/${instance}`, {
    number: phone,
    mediatype: 'document',
    mimetype,
    media: docBase64,
    fileName,
    delay: 1200,
  }) as { key?: { id?: string } };

  return { messageId: result?.key?.id || 'unknown' };
}

// ── Status ───────────────────────────────────────────────────────────────────

export async function getInstanceStatus(instanceNumber: number): Promise<{
  instance: string;
  state: string;
  connected: boolean;
}> {
  const instance = getInstanceName(instanceNumber);
  const result = await evolutionRequest('GET', `/instance/connectionState/${instance}`) as {
    instance?: { state?: string };
  };
  const state = result?.instance?.state || 'unknown';
  return { instance, state, connected: state === 'open' };
}

export async function getAllInstancesStatus() {
  const [status1, status2] = await Promise.all([getInstanceStatus(1), getInstanceStatus(2)]);
  return { number1: status1, number2: status2 };
}

export async function getQRCode(instanceNumber: number): Promise<{ qrcode?: string; pairingCode?: string; base64?: string }> {
  const instance = getInstanceName(instanceNumber);
  try {
    const result = await evolutionRequest('GET', `/instance/connect/${instance}`) as any;
    return {
      qrcode: result?.qrcode?.code || result?.code,
      base64: result?.qrcode?.base64 || result?.base64,
      pairingCode: result?.pairingCode,
    };
  } catch (err) {
    return {};
  }
}

export async function restartInstance(instanceNumber: number): Promise<boolean> {
  const instance = getInstanceName(instanceNumber);
  try {
    await evolutionRequest('DELETE', `/instance/logout/${instance}`);
    return true;
  } catch {
    return false;
  }
}
