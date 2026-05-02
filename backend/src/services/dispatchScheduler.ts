/**
 * Calcula os delays de envio para uma campanha com janela de horário.
 * 
 * Regras:
 * - Mensagens são distribuídas dentro da janela (ex: 09:00–18:00)
 * - Delay mínimo entre mensagens do mesmo chip: 30s
 * - Intercala chips para não sobrecarregar um único número
 * - Se a janela já passou hoje, agenda para o próximo dia elegível
 */

export interface SendWindow {
  startTime: string;  // "09:00"
  endTime: string;    // "18:00"
  days: number[];     // 0=dom, 1=seg, ..., 6=sab (vazio = todos os dias)
}

export interface ScheduledSend {
  leadId: string;
  chipNumber: 1 | 2;
  delayMs: number;
  scheduledAt: Date;
}

/**
 * Converte "HH:MM" para minutos desde meia-noite
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Retorna o próximo timestamp válido dentro da janela de envio,
 * a partir de `fromDate`, com um offset de `offsetMinutes`.
 */
function nextValidTime(fromDate: Date, window: SendWindow, offsetMinutes: number): Date {
  const startMin = timeToMinutes(window.startTime);
  const endMin = timeToMinutes(window.endTime);
  const windowDuration = endMin - startMin; // minutos disponíveis por dia

  // Quantos dias completos de janela precisamos pular
  let remainingOffset = offsetMinutes;
  let candidate = new Date(fromDate);

  // Começa no início da janela do dia atual (ou próximo dia válido)
  const currentMin = candidate.getHours() * 60 + candidate.getMinutes();

  if (currentMin >= endMin) {
    // Janela de hoje já passou — vai para o próximo dia
    candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
  } else if (currentMin < startMin) {
    // Antes da janela de hoje — começa no início da janela
    candidate.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
  }
  // else: estamos dentro da janela — usa o tempo atual como base

  // Avança pelos dias válidos consumindo o offset
  while (remainingOffset > 0) {
    // Verifica se o dia atual é válido
    const dayOfWeek = candidate.getDay();
    const isDayValid = window.days.length === 0 || window.days.includes(dayOfWeek);

    if (!isDayValid) {
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
      continue;
    }

    // Minutos disponíveis neste dia a partir do ponto atual
    const currentDayMin = candidate.getHours() * 60 + candidate.getMinutes();
    const availableToday = endMin - Math.max(currentDayMin, startMin);

    if (remainingOffset <= availableToday) {
      // Cabe neste dia
      candidate = new Date(candidate.getTime() + remainingOffset * 60 * 1000);
      remainingOffset = 0;
    } else {
      // Não cabe — consome o dia e vai para o próximo
      remainingOffset -= availableToday;
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
    }
  }

  return candidate;
}

/**
 * Calcula o schedule completo de uma campanha.
 * 
 * @param leads - lista de leads com chipNumber já definido
 * @param window - janela de envio (null = sem restrição, usa delay fixo)
 * @param baseDelaySeconds - delay mínimo entre mensagens (padrão: 30s)
 */
export function calculateDispatchSchedule(
  leads: Array<{ leadId: string; chipNumber: 1 | 2 }>,
  window: SendWindow | null,
  baseDelaySeconds = 30
): ScheduledSend[] {
  if (leads.length === 0) return [];

  const now = new Date();
  const result: ScheduledSend[] = [];

  if (!window) {
    // Sem janela — delay fixo entre mensagens, intercalando chips
    // Chip 1 e chip 2 têm filas independentes
    const chipLastSent: Record<number, number> = { 1: 0, 2: 0 };

    for (const lead of leads) {
      const chip = lead.chipNumber;
      const delayMs = chipLastSent[chip] + baseDelaySeconds * 1000;
      chipLastSent[chip] = delayMs;

      result.push({
        leadId: lead.leadId,
        chipNumber: chip,
        delayMs,
        scheduledAt: new Date(now.getTime() + delayMs),
      });
    }
    return result;
  }

  // Com janela — distribui as mensagens dentro da janela
  const startMin = timeToMinutes(window.startTime);
  const endMin = timeToMinutes(window.endTime);
  const windowDurationMin = endMin - startMin;

  if (windowDurationMin <= 0) {
    throw new Error(`Janela de envio inválida: ${window.startTime} → ${window.endTime}`);
  }

  // Separa leads por chip
  const chip1Leads = leads.filter((l) => l.chipNumber === 1);
  const chip2Leads = leads.filter((l) => l.chipNumber === 2);

  // Calcula intervalo entre mensagens para cada chip dentro da janela
  // Distribui uniformemente, mas com mínimo de baseDelaySeconds
  const getInterval = (count: number) => {
    if (count <= 1) return 0;
    const evenInterval = Math.floor(windowDurationMin / count);
    return Math.max(evenInterval, Math.ceil(baseDelaySeconds / 60));
  };

  const interval1 = getInterval(chip1Leads.length);
  const interval2 = getInterval(chip2Leads.length);

  // Agenda chip 1
  for (let i = 0; i < chip1Leads.length; i++) {
    const offsetMin = i * interval1;
    const scheduledAt = nextValidTime(now, window, offsetMin);
    result.push({
      leadId: chip1Leads[i].leadId,
      chipNumber: 1,
      delayMs: scheduledAt.getTime() - now.getTime(),
      scheduledAt,
    });
  }

  // Agenda chip 2 (com offset de metade do intervalo para intercalar)
  const chip2Offset = Math.floor(interval1 / 2);
  for (let i = 0; i < chip2Leads.length; i++) {
    const offsetMin = chip2Offset + i * interval2;
    const scheduledAt = nextValidTime(now, window, offsetMin);
    result.push({
      leadId: chip2Leads[i].leadId,
      chipNumber: 2,
      delayMs: scheduledAt.getTime() - now.getTime(),
      scheduledAt,
    });
  }

  // Ordena por scheduledAt para visualização
  result.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  return result;
}

/**
 * Determina o chip a usar para um lead.
 * - Se já tem assignedNumber e já enviou mensagem → usa o mesmo
 * - Se nunca enviou → aleatoriza entre os chips disponíveis
 */
export function resolveChipForLead(lead: {
  assignedNumber: number;
  firstMessageSent: boolean;
}): 1 | 2 {
  if (lead.firstMessageSent) {
    // Já tem histórico — mantém o chip original
    return lead.assignedNumber as 1 | 2;
  }
  // Nunca enviou — aleatoriza
  return Math.random() < 0.5 ? 1 : 2;
}

/**
 * Distribui leads entre chips de forma intercalada.
 * Leads que já têm chip fixo mantêm o seu.
 * Leads sem histórico são distribuídos alternadamente.
 */
export function assignChipsToLeads(
  leads: Array<{ leadId: string; assignedNumber: number; firstMessageSent: boolean }>
): Array<{ leadId: string; chipNumber: 1 | 2 }> {
  let chipToggle: 1 | 2 = 1;

  return leads.map((lead) => {
    if (lead.firstMessageSent) {
      // Já tem chip fixo
      return { leadId: lead.leadId, chipNumber: lead.assignedNumber as 1 | 2 };
    }
    // Aleatoriza e intercala
    const chip = chipToggle;
    chipToggle = chipToggle === 1 ? 2 : 1;
    return { leadId: lead.leadId, chipNumber: chip };
  });
}
