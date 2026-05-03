import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { randomUUID } from 'crypto';

const router = Router();

// GET /tags
router.get('/', async (_req: Request, res: Response) => {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(tags);
  } catch {
    res.status(500).json({ error: 'Erro ao listar tags' });
  }
});

// POST /tags
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, color, description } = z.object({
      name: z.string().min(1).max(50),
      color: z.string().default('#6366f1'),
      description: z.string().default(''),
    }).parse(req.body);

    const id = randomUUID();
    const tag = await prisma.tag.create({
      data: {
        id,
        name: name.toLowerCase().trim(),
        color,
        description,
      },
    });
    res.status(201).json(tag);
  } catch (err: any) {
    if (err?.code === 'P2002' || String(err).includes('unique')) {
      return res.status(409).json({ error: 'Já existe uma tag com esse nome' });
    }
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    res.status(500).json({ error: 'Erro ao criar tag' });
  }
});

// PATCH /tags/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { name, color, description } = z.object({
      name: z.string().min(1).max(50).optional(),
      color: z.string().optional(),
      description: z.string().optional(),
    }).parse(req.body);

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.toLowerCase().trim();
    if (color !== undefined) updateData.color = color;
    if (description !== undefined) updateData.description = description;

    if (Object.keys(updateData).length === 0) return res.status(400).json({ error: 'Nada para atualizar' });

    const tag = await prisma.tag.update({
      where: { id: req.params.id },
      data: updateData,
    });
    res.json(tag);
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Tag não encontrada' });
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos' });
    res.status(500).json({ error: 'Erro ao atualizar tag' });
  }
});

// DELETE /tags/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.tag.delete({
      where: { id: req.params.id },
    });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Erro ao deletar tag' });
  }
});

export default router;
