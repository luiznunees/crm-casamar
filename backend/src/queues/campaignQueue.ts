import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from './redis';
import prisma from '../prisma/client';
import { sendCampaignMessageToLead, executeCampaignSteps, type CampaignPoll } from '../services/messageService';
import { executeSteps, type CampaignStep } from '../services/stepsExecutor';
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

        let result: { success: boolean; skipped?: boolean; reason?: string };

        // Novo fluxo: steps do editor visual
        const steps = (campaign as any).steps as CampaignStep[] | undefined;
        if (steps && steps.length > 0) {
          result = await executeSteps(leadId, steps);
        } else {
          // Fluxo legado: messageTemplate + mediaAttachments
          const mediaAttachments = (campaign as any).mediaAttachments || [];
          const poll: CampaignPoll | undefined = (campaign as any).pollEnabled
            ? {
                question: (campaign as any).pollQuestion || '',
                optionYes: (campaign as any).pollOptionYes || 'Sim, quero acessar',
                optionNo: (campaign as any).pollOptionNo || 'Agora não',
                tagOnYes: (campaign as any).pollTagOnYes || '',
              }
            : undefined;
          result = await sendCampaignMessageToLead(leadId, campaign.messageTemplate, mediaAttachments, poll);
        }

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
        // Job legado — ignorado. Coleta de nome agora é passiva.
        log.skip(`Job send-name-request ignorado (fluxo removido)`);
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
