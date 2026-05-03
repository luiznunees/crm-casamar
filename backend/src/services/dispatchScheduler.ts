/**
 * Calcula os delays de envio para uma campanha com janela de horário.
 *
 * Regras anti-ban:
 * - Delay ALEATÓRIO entre mensagens (não fixo) — evita fingerprint de robô
 * - Pausa longa a cada 50 mensagens por chip (simula humano descansando)
 * - Leads com engajamento (já responderam) vão na frente do lote
 * - Intercala chips para não sobrecarregar um único número
 * - Respeita janela de horário configurada
 */

export interface SendWindow {
  startTime: string; // "09:00"
  endTime: string;   // "18:00"
  days: number[];    // 0=dom, 1=seg, ..., 6=sab (vazio = todos os dias)
}

export interface ScheduledSend {
  leadId: string;
  chipNumber: 1 | 2;
  delayMs: number;
  scheduledAt: Date;
}

// ── Delay aleatório ───────────────────────────────────────────────────────────

/**
 * Gera um delay aleatório em segundos dentro de um range.
 * Padrão: entre 20s e 60s — parece humano, não é detectável como fixo.
 */
export function randomDelay(minSeconds = 20, maxSeconds = 60): number {
  return Math.floor(Math.random() * (maxSeconds - minSeconds + 1) + minSeconds);
}

/**
 * A cada 50 mensagens por chip, insere uma pausa longa (10-15 min).
 * Simula o humano parando para fazer outra coisa.
 */
function longBreakIfNeeded(messageIndex: number): number {
  if (messageIndex > 0 && messageIndex % 50 === 0) {
    // Pausa de 10 a 15 minutos em segundos
    return Math.floor(Math.random() * (15 - 10 + 1) + 10) * 60;
  }
  return 0;
}

// ── Tempo válido na janela ────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function nextValidTime(fromDate: Date, window: SendWindow, offsetSeconds: number): Date {
  const startMin = timeToMinutes(window.startTime);
  const endMin = timeToMinutes(window.endTime);
  const windowDurationSec = (endMin - startMin) * 60;

  let remainingOffset = offsetSeconds;
  let candidate = new Date(fromDate);

  const currentSec = candidate.getHours() * 3600 + candidate.getMinutes() * 60 + candidate.getSeconds();
  const startSec = startMin * 60;
  const endSec = endMin * 60;

  if (currentSec >= endSec) {
    candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
  } else if (currentSec < startSec) {
    candidate.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
  }

  while (remainingOffset > 0) {
    const dayOfWeek = candidate.getDay();
    const isDayValid = window.days.length === 0 || window.days.includes(dayOfWeek);

    if (!isDayValid) {
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
      continue;
    }

    const currentDaySec =
      candidate.getHours() * 3600 + candidate.getMinutes() * 60 + candidate.getSeconds();
    const availableToday = endSec - Math.max(currentDaySec, startSec);

    if (remainingOffset <= availableToday) {
      candidate = new Date(candidate.getTime() + remainingOffset * 1000);
      remainingOffset = 0;
    } else {
      remainingOffset -= availableToday;
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
    }
  }

  return candidate;
}

// ── Schedule principal ────────────────────────────────────────────────────────

/**
 * Calcula o schedule completo de uma campanha.
 *
 * @param leads - lista de leads com chipNumber e engagementScore já definidos
 * @param window - janela de envio (null = sem restrição)
 * @param minDelaySeconds - delay mínimo entre mensagens (padrão: 20s)
 * @param maxDelaySeconds - delay máximo entre mensagens (padrão: 60s)
 */
export function calculateDispatchSchedule(
  leads: Array<{ leadId: string; chipNumber: 1 | 2; engagementScore?: number }>,
  window: SendWindow | null,
  minDelaySeconds = 20,
  maxDelaySeconds = 60
): ScheduledSend[] {
  if (leads.length === 0) return [];

  const now = new Date();
  const result: ScheduledSend[] = [];

  // Separa por chip
  const chip1Leads = leads.filter((l) => l.chipNumber === 1);
  const chip2Leads = leads.filter((l) => l.chipNumber === 2);

  // Acumulador de offset em segundos por chip (filas independentes)
  const chipOffset: Record<1 | 2, number> = { 1: 0, 2: 0 };
  const chipMsgCount: Record<1 | 2, number> = { 1: 0, 2: 0 };

  function scheduleLeads(chipLeads: typeof leads, chip: 1 | 2) {
    for (const lead of chipLeads) {
      const msgIndex = chipMsgCount[chip];

      // Delay aleatório entre mensagens
      const delay = randomDelay(minDelaySeconds, maxDelaySeconds);

      // Pausa longa a cada 50 mensagens
      const longBreak = longBreakIfNeeded(msgIndex);

      chipOffset[chip] += delay + longBreak;
      chipMsgCount[chip]++;

      let scheduledAt: Date;
      if (window) {
        scheduledAt = nextValidTime(now, window, chipOffset[chip]);
      } else {
        scheduledAt = new Date(now.getTime() + chipOffset[chip] * 1000);
      }

      result.push({
        leadId: lead.leadId,
        chipNumber: chip,
        delayMs: scheduledAt.getTime() - now.getTime(),
        scheduledAt,
      });
    }
  }

  // Chip 2 começa com offset de metade do delay médio para intercalar
  const halfDelay = Math.floor((minDelaySeconds + maxDelaySeconds) / 4);
  chipOffset[2] = halfDelay;

  scheduleLeads(chip1Leads, 1);
  scheduleLeads(chip2Leads, 2);

  // Ordena por scheduledAt para visualização
  result.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  return result;
}

// ── Chip assignment ───────────────────────────────────────────────────────────

/**
 * Distribui leads entre chips de forma intercalada.
 * Leads que já têm chip fixo (firstMessageSent) mantêm o seu.
 * Leads sem histórico são distribuídos alternadamente.
 */
export function assignChipsToLeads(
  leads: Array<{ leadId: string; assignedNumber: number; firstMessageSent: boolean }>
): Array<{ leadId: string; chipNumber: 1 | 2 }> {
  let chipToggle: 1 | 2 = 1;

  return leads.map((lead) => {
    if (lead.firstMessageSent) {
      return { leadId: lead.leadId, chipNumber: lead.assignedNumber as 1 | 2 };
    }
    const chip = chipToggle;
    chipToggle = chipToggle === 1 ? 2 : 1;
    return { leadId: lead.leadId, chipNumber: chip };
  });
}

/**
 * Ordena leads por engajamento: quem já respondeu vai na frente.
 * Dentro do mesmo nível de engajamento, mantém a ordem original.
 *
 * engagementScore:
 *   >= 1 → já respondeu pelo menos uma vez (vai na frente)
 *   0    → nunca respondeu (vai no final)
 */
export function sortLeadsByEngagement<T extends { engagementScore?: number }>(
  leads: T[]
): T[] {
  return [...leads].sort((a, b) => {
    const scoreA = a.engagementScore ?? 0;
    const scoreB = b.engagementScore ?? 0;
    return scoreB - scoreA; // maior score primeiro
  });
}
