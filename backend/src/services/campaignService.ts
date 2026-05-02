import prisma from '../prisma/client';
import { Stage, CampaignStatus } from '@prisma/client';
import { campaignQueue } from '../queues/campaignQueue';
import { assignChipsToLeads, calculateDispatchSchedule, type SendWindow } from './dispatchScheduler';
import { log } from '../utils/logger';

export interface CreateCampaignInput {
  name: string;
  targetStages: Stage[];
  targetSources: string[];
  targetTags?: string[];
  targetPreferredContact?: string[];
  messageTemplate: string;
  scheduledAt?: Date;
  mediaAttachments?: any[];
  sendWindowStart?: string;
  sendWindowEnd?: string;
  sendWindowDays?: number[];
}

export async function createCampaign(data: CreateCampaignInput) {
  const campaign = await prisma.campaign.create({
    data: {
      name: data.name,
      targetStages: data.targetStages,
      targetSources: data.targetSources,
      targetTags: data.targetTags || [],
      targetPreferredContact: data.targetPreferredContact || [],
      messageTemplate: data.messageTemplate,
      scheduledAt: data.scheduledAt,
      status: data.scheduledAt ? 'SCHEDULED' : 'DRAFT',
      mediaAttachments: data.mediaAttachments || [],
      sendWindowStart: data.sendWindowStart || null,
      sendWindowEnd: data.sendWindowEnd || null,
      sendWindowDays: data.sendWindowDays || [],
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
 * Enfileira os leads de uma campanha com:
 * - Chip fixo para quem já tem histórico
 * - Chip aleatório/intercalado para quem não tem
 * - Delays calculados pela janela de envio
 */
export async function enqueueCampaign(campaignId: string): Promise<{
  total: number;
  enqueued: number;
  skipped: number;
  schedule: Array<{ leadId: string; chipNumber: number; scheduledAt: string }>;
}> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error(`Campanha ${campaignId} não encontrada`);

  // Busca leads elegíveis com todos os filtros
  const where: any = {
    stage: { in: campaign.targetStages },
  };

  // Filtro por listas/empreendimentos
  if (campaign.targetSources.length > 0) {
    where.source = { in: campaign.targetSources };
  }

  // Filtro por tags (lead deve ter PELO MENOS UMA das tags)
  const targetTags = (campaign as any).targetTags || [];
  if (targetTags.length > 0) {
    where.tags = { hasSome: targetTags };
  }

  // Filtro por contato preferido
  const targetContact = (campaign as any).targetPreferredContact || [];
  if (targetContact.length > 0) {
    where.preferredContact = { in: targetContact };
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });

  log.campaign(`Filtros: stages=${campaign.targetStages.join(',')}, sources=${campaign.targetSources.join(',') || 'todos'}, tags=${targetTags.join(',') || 'todas'}, contact=${targetContact.join(',') || 'todos'} → ${leads.length} leads`);

  // Filtra já enviados
  const pendingLeads = [];
  let skipped = 0;

  for (const lead of leads) {
    const existing = await prisma.campaignLead.findUnique({
      where: { campaignId_leadId: { campaignId, leadId: lead.id } },
    });
    if (existing?.status === 'SENT') { skipped++; continue; }
    pendingLeads.push(lead);
  }

  if (pendingLeads.length === 0) {
    await updateCampaignStatus(campaignId, 'COMPLETED');
    return { total: leads.length, enqueued: 0, skipped, schedule: [] };
  }

  // 1. Atribui chips — mantém chip fixo para quem já enviou, intercala para novos
  const withChips = assignChipsToLeads(
    pendingLeads.map((l) => ({
      leadId: l.id,
      assignedNumber: l.assignedNumber,
      firstMessageSent: l.firstMessageSent,
    }))
  );

  // Atualiza assignedNumber no banco para leads que tiveram chip atribuído agora
  for (const { leadId, chipNumber } of withChips) {
    const lead = pendingLeads.find((l) => l.id === leadId)!;
    if (!lead.firstMessageSent && lead.assignedNumber !== chipNumber) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { assignedNumber: chipNumber },
      });
    }
  }

  // 2. Calcula schedule com janela de horário
  const window: SendWindow | null = (campaign as any).sendWindowStart && (campaign as any).sendWindowEnd
    ? {
        startTime: (campaign as any).sendWindowStart,
        endTime: (campaign as any).sendWindowEnd,
        days: (campaign as any).sendWindowDays || [],
      }
    : null;

  const schedule = calculateDispatchSchedule(withChips, window, 30);

  // 3. Cria CampaignLead e enfileira jobs
  for (const item of schedule) {
    await prisma.campaignLead.upsert({
      where: { campaignId_leadId: { campaignId, leadId: item.leadId } },
      create: { campaignId, leadId: item.leadId, status: 'PENDING' },
      update: { status: 'PENDING' },
    });

    const delayMs = Math.max(0, item.delayMs);

    await campaignQueue.add(
      'send-campaign-message',
      { campaignId, leadId: item.leadId },
      {
        delay: delayMs,
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
