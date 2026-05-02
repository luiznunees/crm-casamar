import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  createLead,
  updateLead,
  getLeadById,
  listLeads,
  deleteLead,
  getLeadStats,
  updateLeadName,
} from '../../services/leadService';
import { campaignQueue } from '../../queues/campaignQueue';

const router = Router();

const createLeadSchema = z.object({
  name: z.string().optional(),
  phone: z.string().min(10),
  email: z.string().email().optional(),
  source: z.string().min(1),
  stage: z.enum(['COLD', 'WARMING', 'WARM', 'HOT', 'INTERESTED']).optional(),
  assignedNumber: z.union([z.literal(1), z.literal(2)]),
  preferredContact: z.enum(['WHATSAPP', 'AUDIO', 'CALL']).optional(),
  observations: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const updateLeadSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  source: z.string().optional(),
  stage: z.enum(['COLD', 'WARMING', 'WARM', 'HOT', 'INTERESTED']).optional(),
  nameCollected: z.boolean().optional(),
  preferredContact: z.enum(['WHATSAPP', 'AUDIO', 'CALL']).optional(),
  observations: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// GET /leads
router.get('/', async (req: Request, res: Response) => {
  try {
    const { stage, source, assignedNumber, nameCollected, search, page, limit } = req.query;

    const result = await listLeads({
      stage: stage as any,
      source: source as string,
      assignedNumber: assignedNumber ? Number(assignedNumber) : undefined,
      nameCollected: nameCollected !== undefined ? nameCollected === 'true' : undefined,
      search: search as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar leads' });
  }
});

// GET /leads/stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getLeadStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// GET /leads/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar lead' });
  }
});

// POST /leads
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createLeadSchema.parse(req.body);
    const lead = await createLead(data);

    // Se lead COLD sem nome, enfileira mensagem de coleta de nome automaticamente
    if (!lead.name && lead.stage === 'COLD') {
      await campaignQueue.add(
        'send-name-request',
        { leadId: lead.id },
        { delay: 5000, jobId: `name-request-${lead.id}` }
      );
    }

    res.status(201).json(lead);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    res.status(500).json({ error: 'Erro ao criar lead' });
  }
});

// PATCH /leads/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const data = updateLeadSchema.parse(req.body);
    const lead = await updateLead(req.params.id, data);
    res.json(lead);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    res.status(500).json({ error: 'Erro ao atualizar lead' });
  }
});

// PATCH /leads/:id/name
router.patch('/:id/name', async (req: Request, res: Response) => {
  try {
    const { name } = z.object({ name: z.string().min(2) }).parse(req.body);
    const lead = await updateLeadName(req.params.id, name);
    res.json(lead);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Nome inválido', details: err.errors });
    }
    res.status(500).json({ error: 'Erro ao atualizar nome' });
  }
});

// DELETE /leads/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteLead(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar lead' });
  }
});

export default router;
