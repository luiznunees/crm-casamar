import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { getAutoReplyConfig, updateAutoReplyConfig } from '../../services/autoReplyService';
import { generateWeeklyReport } from '../../services/reportService';
import { qualifyLead } from '../../ai/leadQualifier';

const router = Router();

// ── Auto-reply ────────────────────────────────────────────────────────────────

router.get('/auto-reply', async (_req, res: Response) => {
  try { res.json(await getAutoReplyConfig()); }
  catch (err) { res.status(500).json({ error: 'Erro ao buscar config' }); }
});

router.put('/auto-reply', async (req: Request, res: Response) => {
  try {
    const data = z.object({
      enabled: z.boolean().optional(),
      startHour: z.number().min(0).max(23).optional(),
      endHour: z.number().min(0).max(23).optional(),
      message: z.string().min(5).optional(),
    }).parse(req.body);
    res.json(await updateAutoReplyConfig(data));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    res.status(500).json({ error: 'Erro ao salvar config' });
  }
});

// ── Quick Replies ─────────────────────────────────────────────────────────────

router.get('/quick-replies', async (_req, res: Response) => {
  try {
    const items = await prisma.quickReply.findMany({ orderBy: [{ category: 'asc' }, { order: 'asc' }] });
    res.json(items);
  } catch (err) { res.status(500).json({ error: 'Erro ao buscar templates' }); }
});

router.post('/quick-replies', async (req: Request, res: Response) => {
  try {
    const data = z.object({
      title: z.string().min(1),
      content: z.string().min(1),
      category: z.string().optional(),
      order: z.number().optional(),
    }).parse(req.body);
    const item = await prisma.quickReply.create({ data: { ...data, category: data.category || 'geral', order: data.order || 0 } });
    res.status(201).json(item);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos' });
    res.status(500).json({ error: 'Erro ao criar template' });
  }
});

router.patch('/quick-replies/:id', async (req: Request, res: Response) => {
  try {
    const item = await prisma.quickReply.update({ where: { id: req.params.id }, data: req.body });
    res.json(item);
  } catch (err) { res.status(500).json({ error: 'Erro ao atualizar template' }); }
});

router.delete('/quick-replies/:id', async (req: Request, res: Response) => {
  try {
    await prisma.quickReply.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: 'Erro ao deletar template' }); }
});

// ── Weekly Report ─────────────────────────────────────────────────────────────

router.get('/report/weekly', async (_req, res: Response) => {
  try { res.json(await generateWeeklyReport()); }
  catch (err) { res.status(500).json({ error: 'Erro ao gerar relatório' }); }
});

// ── Manual lead qualification ─────────────────────────────────────────────────

router.post('/qualify-lead/:leadId', async (req: Request, res: Response) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.leadId },
      include: { messages: { orderBy: { sentAt: 'desc' }, take: 15 } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    const result = await qualifyLead(lead as any);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'Erro ao qualificar lead' }); }
});

export default router;
