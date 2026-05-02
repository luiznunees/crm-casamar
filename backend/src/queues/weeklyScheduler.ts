import cron from 'node-cron';
import prisma from '../prisma/client';
import { campaignQueue } from './campaignQueue';
import { processFollowUps } from '../services/followUpService';
import { log } from '../utils/logger';

export function startWeeklyScheduler() {
  // Toda segunda-feira às 09:00
  cron.schedule('0 9 * * 1', async () => {
    log.scheduler('Segunda-feira 9h — verificando campanhas agendadas');
    await checkAndRunScheduledCampaigns();
  });

  // Verifica a cada hora
  cron.schedule('0 * * * *', async () => {
    await checkAndRunScheduledCampaigns();
    await processFollowUps();
  });

  // Follow-ups também a cada 30 minutos para maior precisão
  cron.schedule('*/30 * * * *', async () => {
    await processFollowUps();
  });

  log.scheduler('Agendador iniciado (toda segunda às 9h + verificação horária)');
}

async function checkAndRunScheduledCampaigns() {
  const now = new Date();
  const due = await prisma.campaign.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
  });

  if (due.length === 0) return;

  log.scheduler(`${due.length} campanha(s) para disparar`);

  for (const campaign of due) {
    await campaignQueue.add(
      'run-campaign',
      { campaignId: campaign.id },
      { jobId: `scheduled-${campaign.id}-${Date.now()}` }
    );
    log.campaign(`"${campaign.name}" enfileirada pelo scheduler`);
  }
}
