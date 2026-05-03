import prisma from '../prisma/client';
import { Stage, CampaignStatus } from '@prisma/client';
import { campaignQueue } from '../queues/campaignQueue';
import {
  assignChipsToLeads,
  calculateDispatchSchedule,
  sortLeadsByEngagement,
  type SendWindow,
} from './dispatchScheduler';
import { getAIConfig } from './aiConfigService';
import { type CampaignStep } from './stepsExecutor';
import { log } from '../utils/logger';

export interface CreateCampaignInput {
  name: string;
  targetStages: Stage[];
  targetSources: string[];
  targetOrigins?: string[];
  targetTags?: string[];
  targetTagsMatchAll?: boolean;
  targetPreferredContact?: string[];
  messageTemplate?: string;   // legado
  steps?: CampaignStep[];     // novo editor visual
  scheduledAt?: Date;
  mediaAttachments?: any[];   // legado
  sendWindowStart?: string;
  sendWindowEnd?: string;
  sendWindowDays?: number[];
  pollEnabled?: boolean;
  pollQuestion?: string;
  pollOptionYes?: string;
  pollOptionNo?: string;
  pollTagOnYes?: string;
}

export async function createCampaign(data: CreateCampaignInput) {
  const campaign = await prisma.campaign.create({
    data: {
      name: data.name,
      targetStages: data.targetStages,
      targetSources: data.targetSources,
      targetOrigins: data.targetOrigins || [],
      targetTags: data.targetTags || [],
      targetTagsMatchAll: data.targetTagsMatchAll ?? false,
      targetPreferredContact: data.targetPreferredContact || [],
      messageTemplate: data.messageTemplate || '',
      steps: (data.steps || []) as any,
      scheduledAt: data.scheduledAt,
      status: data.scheduledAt ? 'SCHEDULED' : 'DRAFT',
      mediaAttachments: data.mediaAttachments || [],
      sendWindowStart: data.sendWindowStart || null,
      sendWindowEnd: data.sendWindowEnd || null,
      sendWindowDays: data.sendWindowDays || [],
      pollEnabled: data.pollEnabled ?? false,
      pollQuestion: data.pollQuestion || '',
      pollOptionYes: data.pollOptionYes || 'Sim, quero acessar',
      pollOptionNo: data.pollOptionNo || 'Agora não',
      pollTagOnYes: data.pollTagOnYes || '',
    },
  });

  if (data.scheduledAt) {
    const delay = data.scheduledAt.getTime() - Date.now();
    if (delay > 0) {
      await campaignQueue.add(
        'run-campaign',
        { campaignId: campaign.id },
        { delay, jobId: `campaign-${campaign.id}` }
      );
    }
  }

  return campaign;
}

export async function getCampaignById(id: string) {
  return prisma.campaign.findUnique({
    where: { id },
    include: {
      campaignLeads: {
        include: { lead: true },
        orderBy: { id: 'asc' },
      },
    },
  });
}

export async function listCampaigns() {
  return prisma.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { campaignLeads: true } } },
  });
}

export async function updateCampaignStatus(id: string, status: CampaignStatus) {
  return prisma.campaign.update({
    where: { id },
    data: { status, updatedAt: new Date() },
  });
}

/**
 * Conta quantas mensagens de campanha já foram enviadas hoje por chip.
 */
async function countTodaySentByChip(chip: 1 | 2): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return prisma.campaignLead.count({
    where: {
      status: 'SENT',
      sentAt: { gte: startOfDay },
      lead: { assignedNumber: chip },
    },
  });
}

/**
 * Enfileira os leads de uma campanha com:
 * - Leads engajados (já responderam) na frente do lote
 * - Chip fixo para quem já tem histórico
 * - Delays aleatórios anti-ban (configuráveis)
 * - Pausa longa a cada 50 mensagens por chip
 * - Respeito ao limite diário por chip
 * - Opt-outs excluídos automaticamente
 */
export async function enqueueCampaign(campaignId: string): Promise<{
  total: number;
  enqueued: number;
  skipped: number;
  limitReached: boolean;
  schedule: Array<{ leadId: string; chipNumber: number; scheduledAt: string }>;
}> {
  const [campaign, config] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId } }),
    getAIConfig(),
  ]);
  if (!campaign) throw new Error(`Campanha ${campaignId} não encontrada`);

  // ── Filtros de leads ────────────────────────────────────────────────────────
  const where: any = { stage: { in: campaign.targetStages } };

  if (campaign.targetSources.length > 0) {
    where.source = { in: campaign.targetSources };
  }

  // Filtro por origem (canal de aquisição)
  const targetOrigins = (campaign as any).targetOrigins || [];
  if (targetOrigins.length > 0) {
    where.origin = { in: targetOrigins };
  }

  const targetTags = (campaign as any).targetTags || [];
  const matchAll = (campaign as any).targetTagsMatchAll ?? false;

  if (targetTags.length > 0) {
    if (matchAll) {
      // AND: lead deve ter TODAS as tags
      where.tags = { hasEvery: targetTags };
    } else {
      // OR: lead deve ter pelo menos UMA das tags
      where.tags = { hasSome: targetTags };
    }
  }

  const targetContact = (campaign as any).targetPreferredContact || [];
  if (targetContact.length > 0) {
    where.preferredContact = { in: targetContact };
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });

  log.campaign(
    `Filtros: stages=${campaign.targetStages.join(',')}, sources=${campaign.targetSources.join(',') || 'todos'} → ${leads.length} leads`
  );

  // ── Filtra opt-outs e já enviados ───────────────────────────────────────────
  const pendingLeads: typeof leads = [];
  let skipped = 0;

  for (const lead of leads) {
    if (lead.tags.includes('opt-out')) { skipped++; continue; }

    const existing = await prisma.campaignLead.findUnique({
      where: { campaignId_leadId: { campaignId, leadId: lead.id } },
    });
    if (existing?.status === 'SENT') { skipped++; continue; }

    pendingLeads.push(lead);
  }

  if (pendingLeads.length === 0) {
    await updateCampaignStatus(campaignId, 'COMPLETED');
    return { total: leads.length, enqueued: 0, skipped, limitReached: false, schedule: [] };
  }

  // ── Limite diário por chip ──────────────────────────────────────────────────
  const [sentChip1Today, sentChip2Today] = await Promise.all([
    countTodaySentByChip(1),
    countTodaySentByChip(2),
  ]);

  const remainingChip1 = Math.max(0, config.dailyLimitPerChip - sentChip1Today);
  const remainingChip2 = Math.max(0, config.dailyLimitPerChip - sentChip2Today);
  const totalRemaining = remainingChip1 + remainingChip2;

  log.campaign(
    `Limite diário: chip1 ${sentChip1Today}/${config.dailyLimitPerChip} (${remainingChip1} restantes), chip2 ${sentChip2Today}/${config.dailyLimitPerChip} (${remainingChip2} restantes)`
  );

  // ── Ordena por engajamento: quem já respondeu vai na frente ─────────────────
  const sortedLeads = sortLeadsByEngagement(
    pendingLeads.map((l) => ({ ...l, engagementScore: l.engagementScore ?? 0 }))
  );

  // Limita ao total disponível hoje
  let limitReached = false;
  const leadsToSend = sortedLeads.slice(0, totalRemaining);
  if (leadsToSend.length < sortedLeads.length) {
    limitReached = true;
    log.campaign(
      `⚠️  Limite diário atingido — ${sortedLeads.length - leadsToSend.length} leads adiados para amanhã`
    );
  }

  if (leadsToSend.length === 0) {
    log.campaign('Limite diário esgotado para hoje. Campanha pausada.');
    return { total: leads.length, enqueued: 0, skipped, limitReached: true, schedule: [] };
  }

  // ── Atribui chips ───────────────────────────────────────────────────────────
  const withChips = assignChipsToLeads(
    leadsToSend.map((l) => ({
      leadId: l.id,
      assignedNumber: l.assignedNumber,
      firstMessageSent: l.firstMessageSent,
    }))
  );

  // Atualiza assignedNumber no banco para leads sem histórico
  for (const { leadId, chipNumber } of withChips) {
    const lead = leadsToSend.find((l) => l.id === leadId)!;
    if (!lead.firstMessageSent && lead.assignedNumber !== chipNumber) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { assignedNumber: chipNumber },
      });
    }
  }

  // ── Calcula schedule com delays aleatórios ──────────────────────────────────
  const window: SendWindow | null =
    (campaign as any).sendWindowStart && (campaign as any).sendWindowEnd
      ? {
          startTime: (campaign as any).sendWindowStart,
          endTime: (campaign as any).sendWindowEnd,
          days: (campaign as any).sendWindowDays || [],
        }
      : null;

  // Adiciona engagementScore para o scheduler
  const withChipsAndEngagement = withChips.map((item) => {
    const lead = leadsToSend.find((l) => l.id === item.leadId)!;
    return { ...item, engagementScore: lead.engagementScore ?? 0 };
  });

  const schedule = calculateDispatchSchedule(
    withChipsAndEngagement,
    window,
    config.minDelaySeconds,
    config.maxDelaySeconds
  );

  // ── Cria CampaignLead e enfileira jobs ──────────────────────────────────────
  for (const item of schedule) {
    await prisma.campaignLead.upsert({
      where: { campaignId_leadId: { campaignId, leadId: item.leadId } },
      create: { campaignId, leadId: item.leadId, status: 'PENDING' },
      update: { status: 'PENDING' },
    });

    await campaignQueue.add(
      'send-campaign-message',
      { campaignId, leadId: item.leadId },
      {
        delay: Math.max(0, item.delayMs),
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        jobId: `campaign-${campaignId}-lead-${item.leadId}`,
      }
    );

    log.campaign(
      `Agendado: ${item.leadId} | chip ${item.chipNumber} | ${item.scheduledAt.toLocaleTimeString('pt-BR')}`
    );
  }

  await updateCampaignStatus(campaignId, 'RUNNING');

  return {
    total: leads.length,
    enqueued: schedule.length,
    skipped,
    limitReached,
    schedule: schedule.map((s) => ({
      leadId: s.leadId,
      chipNumber: s.chipNumber,
      scheduledAt: s.scheduledAt.toISOString(),
    })),
  };
}

export async function getCampaignStats(campaignId: string) {
  const stats = await prisma.campaignLead.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { id: true },
  });

  return stats.reduce(
    (acc, s) => ({ ...acc, [s.status]: s._count.id }),
    {} as Record<string, number>
  );
}
