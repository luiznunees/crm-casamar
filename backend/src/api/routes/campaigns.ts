import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../prisma/client';
import {
  createCampaign,
  getCampaignById,
  listCampaigns,
  enqueueCampaign,
  getCampaignStats,
  updateCampaignStatus,
} from '../../services/campaignService';
import { log } from '../../utils/logger';

const router = Router();


const mediaAttachmentSchema = z.object({
  type: z.enum(['audio', 'image', 'video', 'document']),
  base64: z.string().min(10),
  mimetype: z.string(),
  caption: z.string().optional(),
  fileName: z.string().optional(),
});

const stepSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'image', 'audio', 'video', 'document', 'poll', 'delay']),
  delayAfter: z.number().min(0).default(0),
  // text
  content: z.string().optional(),
  useAI: z.boolean().optional(),
  // image/video
  base64: z.string().optional(),
  mimetype: z.string().optional(),
  caption: z.string().optional(),
  // document
  fileName: z.string().optional(),
  // poll
  question: z.string().optional(),
  optionYes: z.string().optional(),
  optionNo: z.string().optional(),
  tagOnYes: z.string().optional(),
  // delay
  seconds: z.number().optional(),
});

const createCampaignSchema = z.object({
  name: z.string().min(1),
  targetStages: z.array(z.enum(['COLD', 'WARMING', 'WARM', 'HOT', 'INTERESTED'])).min(1),
  targetSources: z.array(z.string()).default([]),
  targetOrigins: z.array(z.string()).optional(),
  targetTags: z.array(z.string()).optional(),
  targetTagsMatchAll: z.boolean().optional(),
  targetPreferredContact: z.array(z.string()).optional(),
  messageTemplate: z.string().optional(),
  steps: z.array(stepSchema).optional(),
  scheduledAt: z.string().datetime().optional(),
  mediaAttachments: z.array(mediaAttachmentSchema).optional(),
  sendWindowStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  sendWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  sendWindowDays: z.array(z.number().min(0).max(6)).optional(),
  pollEnabled: z.boolean().optional(),
  pollQuestion: z.string().optional(),
  pollOptionYes: z.string().optional(),
  pollOptionNo: z.string().optional(),
  pollTagOnYes: z.string().optional(),
}).refine(
  (d) => (d.steps && d.steps.length > 0) || (d.messageTemplate && d.messageTemplate.length > 0),
  { message: 'Defina pelo menos um step ou uma mensagem' }
);

// GET /campaigns
router.get('/', async (_req: Request, res: Response) => {
  try {
    const campaigns = await listCampaigns();
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar campanhas' });
  }
});

// GET /campaigns/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const campaign = await getCampaignById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar campanha' });
  }
});

// GET /campaigns/:id/stats
router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getCampaignStats(req.params.id);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar estatísticas da campanha' });
  }
});

// POST /campaigns
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createCampaignSchema.parse(req.body);
    const campaign = await createCampaign({
      ...data,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
    });
    res.status(201).json(campaign);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    res.status(500).json({ error: 'Erro ao criar campanha' });
  }
});

// PUT /campaigns/:id — atualiza nodes, edges, filtro e nome
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      name: z.string().min(1).optional(),
      nodes: z.array(z.any()).optional(),
      edges: z.array(z.any()).optional(),
      targetFilter: z.record(z.any()).optional(),
      status: z.enum(['DRAFT','SCHEDULED','RUNNING','COMPLETED','CANCELLED']).optional(),
    });
    const data = schema.parse(req.body);
    const campaign = await prisma.campaign.update({
      where: { id: req.params.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.nodes !== undefined && { steps: data.nodes as any }),
        ...(data.status && { status: data.status }),
        updatedAt: new Date(),
      },
    });
    res.json(campaign);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    res.status(500).json({ error: 'Erro ao atualizar campanha' });
  }
});

// DELETE /campaigns/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.campaign.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar campanha' });
  }
});

// GET /campaigns/:id/status — SSE com progresso de disparo em tempo real
router.get('/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);

  const sendStatus = async () => {
    try {
      const [campaign, totalSent, totalPending, totalFailed, nodeGroups] = await Promise.all([
        prisma.campaign.findUnique({ where: { id }, select: { status: true, name: true } }),
        prisma.campaignLead.count({ where: { campaignId: id, status: 'SENT' } }),
        prisma.campaignLead.count({ where: { campaignId: id, status: 'PENDING' } }),
        prisma.campaignLead.count({ where: { campaignId: id, status: 'FAILED' } }),
        prisma.campaignLead.groupBy({
          by: ['currentStepId'],
          where: { campaignId: id, currentStepId: { not: null } },
          _count: { _all: true },
        }),
      ]);

      if (!campaign) {
        res.write('event: error\ndata: {"error":"Campanha n\u00e3o encontrada"}\n\n');
        clearInterval(heartbeat);
        clearInterval(poll);
        res.end();
        return;
      }

      const nodeStats = nodeGroups.reduce((acc, g) => ({
        ...acc,
        [g.currentStepId as string]: g._count._all,
      }), {});

      const payload = { 
        status: campaign.status, 
        totalSent, 
        totalPending, 
        totalFailed, 
        nodeStats, // Item 4: Heatmap
        ts: Date.now() 
      };

      res.write(`event: status\ndata: ${JSON.stringify(payload)}\n\n`);

      if (campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED') {
        clearInterval(heartbeat);
        clearInterval(poll);
        res.end();
        log.campaign(`[SSE] Campanha ${id} finalizada (${campaign.status})`);
      }
    } catch (err) {
      log.error('[SSE] Erro ao consultar status da campanha', err);
    }
  };

  // Envia imediatamente e depois a cada 3s
  sendStatus();
  const poll = setInterval(sendStatus, 3000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(poll);
    log.ok(`[SSE] Cliente desconectou do status da campanha ${id}`);
  });
});


// POST /campaigns/preview-audience — conta leads que batem com os filtros
router.post('/preview-audience', async (req: Request, res: Response) => {
  try {
    const { targetStages, targetSources, targetTags, targetPreferredContact } = z.object({
      targetStages: z.array(z.enum(['COLD', 'WARMING', 'WARM', 'HOT', 'INTERESTED'])).optional(),
      targetSources: z.array(z.string()).optional(),
      targetTags: z.array(z.string()).optional(),
      targetPreferredContact: z.array(z.string()).optional(),
    }).parse(req.body);

    const where: any = {};
    if (targetStages?.length) where.stage = { in: targetStages };
    if (targetSources?.length) where.source = { in: targetSources };
    if (targetTags?.length) where.tags = { hasSome: targetTags };
    if (targetPreferredContact?.length) where.preferredContact = { in: targetPreferredContact };

    const [count, byStage, bySource] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.groupBy({ by: ['stage'], where, _count: { id: true } }),
      prisma.lead.groupBy({ by: ['source'], where, _count: { id: true } }),
    ]);

    res.json({
      total: count,
      byStage: byStage.reduce((acc, s) => ({ ...acc, [s.stage]: s._count.id }), {}),
      bySource: bySource.reduce((acc, s) => ({ ...acc, [s.source]: s._count.id }), {}),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos' });
    res.status(500).json({ error: 'Erro ao calcular audiência' });
  }
});

// POST /campaigns/:id/dispatch
router.post('/:id/dispatch', async (req: Request, res: Response) => {  try {
    const result = await enqueueCampaign(req.params.id);
    res.json({ message: 'Campanha enfileirada com sucesso', ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao disparar campanha';
    res.status(500).json({ error: message });
  }
});

// POST /campaigns/:id/test — envia para até 5 leads de teste
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const { testLeadIds } = z.object({
      testLeadIds: z.array(z.string().uuid()).min(1).max(5),
    }).parse(req.body);

    const campaign = await getCampaignById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });

    const { sendCampaignMessageToLead } = await import('../../services/messageService');
    const results = [];

    for (const leadId of testLeadIds) {
      const result = await sendCampaignMessageToLead(
        leadId,
        campaign.messageTemplate,
        (campaign as any).mediaAttachments || []
      );
      results.push({ leadId, ...result });
    }

    res.json({
      message: 'Teste enviado',
      results,
      sent: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    const message = err instanceof Error ? err.message : 'Erro ao testar campanha';
    res.status(500).json({ error: message });
  }
});

// PATCH /campaigns/:id/cancel
router.patch('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const campaign = await updateCampaignStatus(req.params.id, 'CANCELLED');
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao cancelar campanha' });
  }
});

export default router;
