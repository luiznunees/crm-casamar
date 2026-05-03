import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { generateCampaignMessage } from '../../ai/messageGenerator';
import { log } from '../../utils/logger';

const router = Router();

/**
 * POST /ai/suggest-delay
 * Sugere o delay ideal em segundos para o próximo envio de um lead,
 * com base no histórico de mensagens e no engagementScore.
 */
router.post('/suggest-delay', async (req: Request, res: Response) => {
  try {
    const { leadId } = z.object({ leadId: z.string() }).parse(req.body);

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { engagementScore: true, stage: true, lastMessageAt: true },
    });

    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

    // Lógica heurística — pode ser substituída por chamada Groq
    let suggestedSeconds = 30;
    let reason = 'delay padrão';

    if (lead.engagementScore >= 5) {
      suggestedSeconds = 20;
      reason = 'lead engajado — delay menor';
    } else if (lead.engagementScore === 0) {
      suggestedSeconds = 60;
      reason = 'lead frio — delay maior';
    }

    if (lead.stage === 'HOT' || lead.stage === 'INTERESTED') {
      suggestedSeconds = Math.min(suggestedSeconds, 25);
      reason += ' (lead quente)';
    }

    res.json({ suggestedSeconds, reason });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos' });
    log.error('[AI] Erro ao sugerir delay', err);
    res.status(500).json({ error: 'Erro ao sugerir delay' });
  }
});

/**
 * POST /ai/vary-message
 * Gera uma variação da mensagem para um lead específico.
 * Reutiliza a lógica de generateCampaignMessage já existente.
 */
router.post('/vary-message', async (req: Request, res: Response) => {
  try {
    const { template, leadId } = z.object({
      template: z.string().min(1),
      leadId: z.string(),
    }).parse(req.body);

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { messages: { orderBy: { sentAt: 'desc' }, take: 5 } },
    });

    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

    const blocks = await generateCampaignMessage(lead, template);
    res.json({ message: blocks.join('\n\n'), blocks });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos' });
    log.error('[AI] Erro ao variar mensagem', err);
    res.status(500).json({ error: 'Erro ao gerar variação' });
  }
});

export default router;
