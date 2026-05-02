import prisma from '../prisma/client';
import { log } from '../utils/logger';

export interface WeeklyReport {
  period: { from: string; to: string };
  leads: {
    total: number;
    newThisWeek: number;
    byStage: Record<string, number>;
    advancedStage: number;
    withoutResponse: number;
  };
  messages: {
    sent: number;
    received: number;
    responseRate: number;
  };
  campaigns: {
    ran: number;
    totalSent: number;
    totalFailed: number;
    totalSkipped: number;
  };
  followUps: {
    executed: number;
    stopped: number; // responderam
  };
  hotLeads: Array<{
    id: string;
    name: string | null;
    phone: string;
    source: string;
    stage: string;
    lastMessageAt: string | null;
  }>;
}

export async function generateWeeklyReport(): Promise<WeeklyReport> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalLeads,
    newLeads,
    stageStats,
    sentMessages,
    receivedMessages,
    leadsWithResponse,
    campaigns,
    campaignLeads,
    followUpExecutions,
    followUpStopped,
    hotLeads,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.lead.groupBy({ by: ['stage'], _count: { id: true } }),
    prisma.message.count({ where: { direction: 'SENT', sentAt: { gte: weekAgo } } }),
    prisma.message.count({ where: { direction: 'RECEIVED', sentAt: { gte: weekAgo } } }),
    prisma.lead.count({
      where: {
        messages: { some: { direction: 'RECEIVED', sentAt: { gte: weekAgo } } },
      },
    }),
    prisma.campaign.count({ where: { status: { in: ['COMPLETED', 'RUNNING'] }, updatedAt: { gte: weekAgo } } }),
    prisma.campaignLead.groupBy({
      by: ['status'],
      where: { sentAt: { gte: weekAgo } },
      _count: { id: true },
    }),
    prisma.leadFollowUpExecution.count({ where: { sentAt: { gte: weekAgo } } }).catch(() => 0),
    prisma.leadFollowUp.count({ where: { status: 'STOPPED', stoppedAt: { gte: weekAgo } } }).catch(() => 0),
    prisma.lead.findMany({
      where: { stage: { in: ['HOT', 'INTERESTED'] } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, name: true, phone: true, source: true, stage: true, lastMessageAt: true },
    }),
  ]);

  const leadsWithoutResponse = await prisma.lead.count({
    where: {
      messages: { some: { direction: 'SENT' } },
      NOT: { messages: { some: { direction: 'RECEIVED' } } },
    },
  });

  const advancedStage = await prisma.lead.count({
    where: {
      stage: { in: ['WARM', 'HOT', 'INTERESTED'] },
      updatedAt: { gte: weekAgo },
    },
  });

  const clStats = campaignLeads.reduce((acc, s) => ({ ...acc, [s.status]: s._count.id }), {} as Record<string, number>);

  const responseRate = sentMessages > 0 ? Math.round((leadsWithResponse / sentMessages) * 100) : 0;

  return {
    period: {
      from: weekAgo.toLocaleDateString('pt-BR'),
      to: now.toLocaleDateString('pt-BR'),
    },
    leads: {
      total: totalLeads,
      newThisWeek: newLeads,
      byStage: stageStats.reduce((acc, s) => ({ ...acc, [s.stage]: s._count.id }), {}),
      advancedStage,
      withoutResponse: leadsWithoutResponse,
    },
    messages: {
      sent: sentMessages,
      received: receivedMessages,
      responseRate,
    },
    campaigns: {
      ran: campaigns,
      totalSent: clStats['SENT'] || 0,
      totalFailed: clStats['FAILED'] || 0,
      totalSkipped: clStats['SKIPPED'] || 0,
    },
    followUps: {
      executed: followUpExecutions as number,
      stopped: followUpStopped as number,
    },
    hotLeads: hotLeads.map((l) => ({
      ...l,
      lastMessageAt: l.lastMessageAt?.toISOString() || null,
    })),
  };
}
