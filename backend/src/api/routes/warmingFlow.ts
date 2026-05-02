import { Router, Request, Response } from 'express';
import prisma from '../../prisma/client';
import { startWarmingFlow } from '../../services/warmingFlowService';

const router = Router();

// GET /warming-flow/stats — quantos leads estão em cada etapa
router.get('/stats', async (_req, res: Response) => {
  try {
    const [active, optOut, completed] = await Promise.all([
      prisma.warmingFlow.count({ where: { active: true } }).catch(() => 0),
      prisma.warmingFlow.count({ where: { optOut: true } }).catch(() => 0),
      prisma.warmingFlow.count({ where: { active: false, optOut: false } }).catch(() => 0),
    ]);
    res.json({ active, optOut, completed });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar stats' });
  }
});

// POST /warming-flow/start/:leadId — inicia manualmente para um lead
router.post('/start/:leadId', async (req: Request, res: Response) => {
  try {
    await startWarmingFlow(req.params.leadId);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro';
    res.status(500).json({ error: msg });
  }
});

// GET /warming-flow/leads — leads com fluxo ativo
router.get('/leads', async (_req, res: Response) => {
  try {
    const flows = await prisma.warmingFlow.findMany({
      where: { active: true },
      include: {
        lead: {
          select: { id: true, name: true, phone: true, source: true, stage: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }).catch(() => []);
    res.json(flows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar leads' });
  }
});

// DELETE /warming-flow/:leadId — cancela o fluxo de um lead
router.delete('/:leadId', async (req: Request, res: Response) => {
  try {
    await prisma.warmingFlow.update({
      where: { leadId: req.params.leadId },
      data: { active: false, updatedAt: new Date() },
    }).catch(() => null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao cancelar fluxo' });
  }
});

export default router;
