import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getMessagesByLead, sendCampaignMessageToLead, sendNameRequestMessage } from '../../services/messageService';

const router = Router();

// GET /messages/lead/:leadId
router.get('/lead/:leadId', async (req: Request, res: Response) => {
  try {
    const { limit } = req.query;
    const messages = await getMessagesByLead(req.params.leadId, limit ? Number(limit) : 50);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

// POST /messages/send-name-request
router.post('/send-name-request', async (req: Request, res: Response) => {
  try {
    const { leadId } = z.object({ leadId: z.string().uuid() }).parse(req.body);
    await sendNameRequestMessage(leadId);
    res.json({ success: true, message: 'Mensagem de coleta de nome enviada' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao enviar mensagem';
    res.status(500).json({ error: message });
  }
});

// POST /messages/send-manual
router.post('/send-manual', async (req: Request, res: Response) => {
  try {
    const { leadId, template } = z
      .object({ leadId: z.string().uuid(), template: z.string().min(5) })
      .parse(req.body);

    const result = await sendCampaignMessageToLead(leadId, template);

    if (!result.success) {
      return res.status(400).json({ error: result.reason });
    }

    res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    const message = err instanceof Error ? err.message : 'Erro ao enviar mensagem';
    res.status(500).json({ error: message });
  }
});

export default router;
