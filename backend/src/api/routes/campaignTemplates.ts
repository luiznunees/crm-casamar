import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../prisma/client';

const router = Router();

const nodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.any()),
});

const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
});

const templateSchema = z.object({
  name: z.string().min(1).max(100),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});

// GET /campaign-templates
router.get('/', async (_req: Request, res: Response) => {
  try {
    const templates = await prisma.campaignTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(templates);
  } catch {
    res.status(500).json({ error: 'Erro ao listar templates' });
  }
});

// POST /campaign-templates
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = templateSchema.parse(req.body);
    const template = await prisma.campaignTemplate.create({
      data: {
        name: data.name,
        nodes: data.nodes as any,
        edges: data.edges as any,
      },
    });
    res.status(201).json(template);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    res.status(500).json({ error: 'Erro ao salvar template' });
  }
});

// DELETE /campaign-templates/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.campaignTemplate.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Erro ao deletar template' });
  }
});

export default router;
