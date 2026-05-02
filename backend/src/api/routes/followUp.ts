import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  createSequence, listSequences, getSequenceById,
  updateSequence, toggleSequenceActive, deleteSequence,
  enrollLead, getPendingFollowUps, getFollowUpStats,
  processFollowUps,
} from '../../services/followUpService';
import prisma from '../../prisma/client';

const router = Router();

const stepSchema = z.object({
  order: z.number().int().min(1),
  delayDays: z.number().int().min(0),
  messageTemplate: z.string().min(5),
  mediaAttachments: z.array(z.any()).optional(),
});

const createSequenceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  targetStages: z.array(z.enum(['COLD', 'WARMING', 'WARM', 'HOT', 'INTERESTED'])).min(1),
  targetSources: z.array(z.string()).optional(),
  steps: z.array(stepSchema).min(1),
});

// GET /follow-up/stats
router.get('/stats', async (_req, res: Response) => {
  try {
    const stats = await getFollowUpStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar stats' });
  }
});

// GET /follow-up/pending
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const days = req.query.days ? Number(req.query.days) : 2;
    const leads = await getPendingFollowUps(days);
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar pendentes' });
  }
});

// POST /follow-up/process — força processamento imediato (debug/manual)
router.post('/process', async (_req, res: Response) => {
  try {
    await processFollowUps();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao processar follow-ups' });
  }
});

// GET /follow-up/sequences
router.get('/sequences', async (_req, res: Response) => {
  try {
    const sequences = await listSequences();
    res.json(sequences);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar sequências' });
  }
});

// GET /follow-up/sequences/:id
router.get('/sequences/:id', async (req: Request, res: Response) => {
  try {
    const seq = await getSequenceById(req.params.id);
    if (!seq) return res.status(404).json({ error: 'Sequência não encontrada' });
    res.json(seq);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar sequência' });
  }
});

// POST /follow-up/sequences
router.post('/sequences', async (req: Request, res: Response) => {
  try {
    const data = createSequenceSchema.parse(req.body);
    const seq = await createSequence(data as any);
    res.status(201).json(seq);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    res.status(500).json({ error: 'Erro ao criar sequência' });
  }
});

// PATCH /follow-up/sequences/:id
router.patch('/sequences/:id', async (req: Request, res: Response) => {
  try {
    const seq = await updateSequence(req.params.id, req.body);
    res.json(seq);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar sequência' });
  }
});

// PATCH /follow-up/sequences/:id/toggle
router.patch('/sequences/:id/toggle', async (req: Request, res: Response) => {
  try {
    const seq = await toggleSequenceActive(req.params.id);
    res.json(seq);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alternar sequência' });
  }
});

// DELETE /follow-up/sequences/:id
router.delete('/sequences/:id', async (req: Request, res: Response) => {
  try {
    await deleteSequence(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar sequência' });
  }
});

// POST /follow-up/enroll — inscreve lead manualmente
router.post('/enroll', async (req: Request, res: Response) => {
  try {
    const { leadId, sequenceId } = z.object({
      leadId: z.string().uuid(),
      sequenceId: z.string().uuid(),
    }).parse(req.body);
    const lfu = await enrollLead(leadId, sequenceId);
    res.json(lfu);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos' });
    const msg = err instanceof Error ? err.message : 'Erro ao inscrever lead';
    res.status(500).json({ error: msg });
  }
});

// DELETE /follow-up/lead/:leadId — remove lead de todas as sequências ativas
router.delete('/lead/:leadId', async (req: Request, res: Response) => {
  try {
    await prisma.leadFollowUp.updateMany({
      where: { leadId: req.params.leadId, status: 'ACTIVE' },
      data: { status: 'STOPPED', stoppedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover lead das sequências' });
  }
});

export default router;
