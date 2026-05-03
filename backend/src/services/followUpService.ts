import prisma from '../prisma/client';
import { Stage } from '@prisma/client';
import { sendCampaignMessageToLead, type MediaAttachment } from './messageService';
import { log } from '../utils/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateSequenceInput {
  name: string;
  description?: string;
  targetStages: Stage[];
  targetSources?: string[];
  steps: {
    order: number;
    delayDays: number;
    messageTemplate: string;
    mediaAttachments?: MediaAttachment[];
  }[];
}

// ── Sequence CRUD ─────────────────────────────────────────────────────────────

export async function createSequence(data: CreateSequenceInput) {
  return prisma.$transaction(async (tx) => {
    const sequence = await tx.followUpSequence.create({
      data: {
        name: data.name,
        description: data.description || '',
        targetStages: data.targetStages,
        targetSources: data.targetSources || [],
      },
    });

    for (const step of data.steps) {
      await tx.followUpStep.create({
        data: {
          sequenceId: sequence.id,
          order: step.order,
          delayDays: step.delayDays,
          messageTemplate: step.messageTemplate,
          mediaAttachments: (step.mediaAttachments || []) as any,
        },
      });
    }

    return tx.followUpSequence.findUnique({
      where: { id: sequence.id },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
  });
}

export async function listSequences() {
  return prisma.followUpSequence.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      steps: { orderBy: { order: 'asc' } },
      _count: { select: { leadFollowUps: true } },
    },
  });
}

export async function getSequenceById(id: string) {
  return prisma.followUpSequence.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { order: 'asc' } },
      leadFollowUps: {
        include: {
          lead: true,
          executions: { orderBy: { sentAt: 'desc' }, take: 1 },
        },
        orderBy: { nextSendAt: 'asc' },
      },
    },
  });
}

export async function updateSequence(id: string, data: Partial<CreateSequenceInput>) {
  return prisma.followUpSequence.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      targetStages: data.targetStages,
      targetSources: data.targetSources,
      updatedAt: new Date(),
    },
  });
}

export async function toggleSequenceActive(id: string) {
  const seq = await prisma.followUpSequence.findUnique({ where: { id } });
  if (!seq) throw new Error('Sequência não encontrada');
  return prisma.followUpSequence.update({
    where: { id },
    data: { active: !seq.active, updatedAt: new Date() },
  });
}

export async function deleteSequence(id: string) {
  return prisma.followUpSequence.delete({ where: { id } });
}

// ── Lead enrollment ───────────────────────────────────────────────────────────

/**
 * Inscreve um lead em uma sequência de follow-up.
 * O primeiro passo é agendado para daqui a `step1.delayDays` dias.
 */
export async function enrollLead(leadId: string, sequenceId: string) {
  const sequence = await prisma.followUpSequence.findUnique({
    where: { id: sequenceId },
    include: { steps: { orderBy: { order: 'asc' } } },
  });
  if (!sequence) throw new Error('Sequência não encontrada');
  if (!sequence.steps.length) throw new Error('Sequência sem passos');

  const firstStep = sequence.steps[0];
  const nextSendAt = new Date();
  nextSendAt.setDate(nextSendAt.getDate() + firstStep.delayDays);

  return prisma.leadFollowUp.upsert({
    where: { leadId_sequenceId: { leadId, sequenceId } },
    create: {
      leadId,
      sequenceId,
      currentStep: 1,
      status: 'ACTIVE',
      nextSendAt,
    },
    update: {
      currentStep: 1,
      status: 'ACTIVE',
      nextSendAt,
      stoppedAt: null,
    },
  });
}

/**
 * Para a sequência para um lead (ex: quando ele responde).
 */
export async function stopLeadFollowUp(leadId: string) {
  const active = await prisma.leadFollowUp.findMany({
    where: { leadId, status: 'ACTIVE' },
  });

  if (active.length === 0) return;

  await prisma.leadFollowUp.updateMany({
    where: { leadId, status: 'ACTIVE' },
    data: { status: 'STOPPED', stoppedAt: new Date() },
  });

  log.lead(`Follow-up pausado para lead ${leadId} (respondeu)`);
}

/**
 * Inscreve automaticamente leads elegíveis em sequências ativas.
 * Chamado quando um lead é criado ou tem o stage atualizado.
 */
export async function autoEnrollLead(leadId: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;

  const sequences = await prisma.followUpSequence.findMany({
    where: {
      active: true,
      targetStages: { has: lead.stage },
    },
    include: { steps: { orderBy: { order: 'asc' }, take: 1 } },
  });

  for (const seq of sequences) {
    // Verifica se já está inscrito
    const existing = await prisma.leadFollowUp.findUnique({
      where: { leadId_sequenceId: { leadId, sequenceId: seq.id } },
    });
    if (existing) continue;

    // Verifica filtro de source
    if (seq.targetSources.length > 0 && !seq.targetSources.includes(lead.source)) continue;

    await enrollLead(leadId, seq.id);
    log.lead(`Lead ${lead.name || lead.phone} inscrito na sequência "${seq.name}"`);
  }
}

// ── Execution engine ──────────────────────────────────────────────────────────

/**
 * Processa todos os follow-ups que estão no prazo.
 * Chamado pelo scheduler a cada hora.
 */
export async function processFollowUps(): Promise<void> {
  try {
    const now = new Date();

    const due = await prisma.leadFollowUp.findMany({
      where: { status: 'ACTIVE', nextSendAt: { lte: now } },
      include: {
        lead: { include: { messages: { orderBy: { sentAt: 'desc' }, take: 5 } } },
        sequence: { include: { steps: { orderBy: { order: 'asc' } } } },
      },
    });

    if (due.length === 0) return;

    log.scheduler(`Follow-up: ${due.length} envio(s) no prazo`);

    for (const lfu of due) {
      try {
        await executeFollowUpStep(lfu);
      } catch (err) {
        log.error(`Erro no follow-up do lead ${lfu.leadId}`, err);
      }
    }
  } catch (_) {
    // Tabelas ainda não existem — silencioso
  }
}

async function executeFollowUpStep(lfu: any): Promise<void> {
  const { lead, sequence } = lfu;
  const steps = sequence.steps as any[];
  const currentStepData = steps.find((s: any) => s.order === lfu.currentStep);

  if (!currentStepData) {
    // Não há mais passos — sequência completa
    await prisma.leadFollowUp.update({
      where: { id: lfu.id },
      data: { status: 'COMPLETED', stoppedAt: new Date() },
    });
    log.ok(`Follow-up completo para ${lead.name || lead.phone}`);
    return;
  }

  // Envia a mensagem
  const mediaAttachments = (currentStepData.mediaAttachments || []) as MediaAttachment[];
  const result = await sendCampaignMessageToLead(
    lead.id,
    currentStepData.messageTemplate,
    mediaAttachments
  );

  // Registra execução
  await prisma.leadFollowUpExecution.create({
    data: {
      leadFollowUpId: lfu.id,
      stepId: currentStepData.id,
      status: result.success ? 'SENT' : result.skipped ? 'SKIPPED' : 'FAILED',
      message: result.reason || 'ok',
    },
  });

  // Avança para o próximo passo
  const nextStep = steps.find((s: any) => s.order === lfu.currentStep + 1);

  if (!nextStep) {
    // Era o último passo
    await prisma.leadFollowUp.update({
      where: { id: lfu.id },
      data: { status: 'COMPLETED', stoppedAt: new Date() },
    });
    log.ok(`Follow-up completo para ${lead.name || lead.phone} (${steps.length} passos)`);
  } else {
    // Agenda o próximo passo
    const nextSendAt = new Date();
    nextSendAt.setDate(nextSendAt.getDate() + nextStep.delayDays);

    await prisma.leadFollowUp.update({
      where: { id: lfu.id },
      data: {
        currentStep: lfu.currentStep + 1,
        nextSendAt,
      },
    });

    log.scheduler(`Follow-up: ${lead.name || lead.phone} → passo ${lfu.currentStep + 1} em ${nextStep.delayDays}d`);
  }
}

// ── Painel de pendentes (manual) ──────────────────────────────────────────────

/**
 * Retorna leads que precisam de atenção manual:
 * - HOT ou INTERESTED sem resposta há X dias
 * - Ordenados por urgência (mais tempo sem resposta primeiro)
 */
export async function getPendingFollowUps(daysSinceLastMessage = 2) {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysSinceLastMessage);

    const leads = await prisma.lead.findMany({
      where: {
        stage: { in: ['HOT', 'INTERESTED', 'WARM'] },
        OR: [
          { lastMessageAt: { lte: cutoff } },
          { lastMessageAt: null },
        ],
      },
      orderBy: [
        { stage: 'desc' },
        { lastMessageAt: 'asc' },
      ],
      include: {
        messages: { orderBy: { sentAt: 'desc' }, take: 3 },
        leadFollowUps: {
          where: { status: 'ACTIVE' },
          include: { sequence: true },
        },
      },
    });

    return leads.map((lead) => ({
      ...lead,
      daysSinceLastMessage: lead.lastMessageAt
        ? Math.floor((Date.now() - new Date(lead.lastMessageAt).getTime()) / 86400000)
        : null,
      inActiveSequence: lead.leadFollowUps.length > 0,
    }));
  } catch (_) {
    return [];
  }
}

export async function getFollowUpStats() {
  try {
    const rows = await prisma.leadFollowUp.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const map = rows.reduce((acc, r) => ({ ...acc, [r.status]: r._count._all }), {} as Record<string, number>);

    const pendingCount = await prisma.leadFollowUp.count({
      where: {
        status: 'ACTIVE',
        nextSendAt: { lte: new Date() },
      },
    });

    return {
      active: map['ACTIVE'] || 0,
      completed: map['COMPLETED'] || 0,
      stopped: map['STOPPED'] || 0,
      pendingNow: pendingCount,
    };
  } catch (_) {
    return { active: 0, completed: 0, stopped: 0, pendingNow: 0 };
  }
}
