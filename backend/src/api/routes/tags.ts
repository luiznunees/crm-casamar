import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { randomUUID } from 'crypto';

const router = Router();

// GET /tags
router.get('/', async (_req: Request, res: Response) => {
  try {
    const tags = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "Tag" ORDER BY "name" ASC`
    );
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
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Tag" ("id","name","color","description","createdAt") VALUES ($1,$2,$3,$4,NOW())`,
      id, name.toLowerCase().trim(), color, description
    );
    const [tag] = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Tag" WHERE id=$1`, id);
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

    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (name !== undefined) { sets.push(`"name"=$${i++}`); vals.push(name.toLowerCase().trim()); }
    if (color !== undefined) { sets.push(`"color"=$${i++}`); vals.push(color); }
    if (description !== undefined) { sets.push(`"description"=$${i++}`); vals.push(description); }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada para atualizar' });

    vals.push(req.params.id);
    await prisma.$executeRawUnsafe(
      `UPDATE "Tag" SET ${sets.join(',')} WHERE id=$${i}`,
      ...vals
    );
    const [tag] = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Tag" WHERE id=$1`, req.params.id);
    if (!tag) return res.status(404).json({ error: 'Tag não encontrada' });
    res.json(tag);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos' });
    res.status(500).json({ error: 'Erro ao atualizar tag' });
  }
});

// DELETE /tags/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "Tag" WHERE id=$1`, req.params.id);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Erro ao deletar tag' });
  }
});

export default router;
