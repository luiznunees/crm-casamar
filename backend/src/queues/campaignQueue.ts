import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from './redis';
import prisma from '../prisma/client';
import { sendCampaignMessageToLead, sendNameRequestMessage } from '../services/messageService';
import { enqueueCampaign, updateCampaignStatus } from '../services/campaignService';
import { log } from '../utils/logger';

export const campaignQueue = new Queue('campaigns', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

export function startCampaignWorker() {
  const worker = new Worker(
    'campaigns',
    async (job: Job) => {
      const { name, data } = job;

      if (name === 'run-campaign') {
        const { campaignId } = data as { campaignId: string };
        log.campaign(`Iniciando campanha ${campaignId}`);
        const result = await enqueueCampaign(campaignId);
        log.campaign(`Campanha ${campaignId} → ${result.enqueued} enfileirados, ${result.skipped} pulados`);
        return result;
      }

      if (name === 'send-campaign-message') {
        const { campaignId, leadId } = data as { campaignId: string; leadId: string };

        const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
        if (!campaign) throw new Error(`Campanha ${campaignId} não encontrada`);

        const mediaAttachments = (campaign as any).mediaAttachments || [];
        const result = await sendCampaignMessageToLead(leadId, campaign.messageTemplate, mediaAttachments);

        await prisma.campaignLead.update({
          where: { campaignId_leadId: { campaignId, leadId } },
          data: {
            status: result.success ? 'SENT' : result.skipped ? 'SKIPPED' : 'FAILED',
            sentAt: result.success ? new Date() : undefined,
          },
        });

        const pending = await prisma.campaignLead.count({
          where: { campaignId, status: 'PENDING' },
        });

        if (pending === 0) {
          await updateCampaignStatus(campaignId, 'COMPLETED');
          log.campaign(`Campanha "${campaign.name}" concluída`);
        }

        return result;
      }

      if (name === 'send-name-request') {
        const { leadId } = data as { leadId: string };
        await sendNameRequestMessage(leadId);
        return { success: true };
      }

      throw new Error(`Job desconhecido: ${name}`);
    },
    { connection: redisConnection, concurrency: 3 }
  );

  worker.on('completed', (job) =>
    log.worker(`Job #${job.id} [${job.name}] concluído`)
  );

  worker.on('failed', (job, err) =>
    log.error(`Job #${job?.id} [${job?.name}] falhou: ${err.message}`)
  );

  log.worker('Campaign worker iniciado (concurrency: 3)');
  return worker;
}
