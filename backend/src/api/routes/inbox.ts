import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../prisma/client';
import {
  sendTextMessage, sendTyping,
  sendAudioMessage, sendImageMessage,
  sendVideoMessage, sendDocumentMessage,
} from '../../whatsapp/evolutionApi';
import { saveMessage } from '../../services/messageService';
import { log } from '../../utils/logger';
import { EventEmitter } from 'events';

const router = Router();

// ── SSE EventEmitter (singleton global) ──────────────────────────────────────
// Outros módulos importam e emitem eventos aqui ao receber mensagens via webhook.
export const inboxEvents = new EventEmitter();
inboxEvents.setMaxListeners(100); // suporta até 100 clientes simultâneos

export type InboxEventType = 'new_message' | 'update_conversation';
export interface InboxEvent {
  type: InboxEventType;
  data: Record<string, unknown>;
}

/**
 * GET /inbox/stream
 * Server-Sent Events — emite eventos em tempo real quando chegam novas mensagens.
 * O cliente reconecta automaticamente (comportamento nativo do EventSource).
 */
router.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // desativa buffer do nginx
  res.flushHeaders();

  // Heartbeat a cada 30s para manter a conexão viva
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30_000);

  const onEvent = (event: InboxEvent) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
  };

  inboxEvents.on('inbox', onEvent);

  req.on('close', () => {
    clearInterval(heartbeat);
    inboxEvents.off('inbox', onEvent);
    log.ok('[SSE] Cliente inbox desconectado');
  });

  log.ok('[SSE] Cliente inbox conectado');
});



/**
 * GET /inbox
 * Lista todas as conversas ordenadas pela última mensagem.
 * Filtros: chip (1|2), unreadOnly, stage, search
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { chip, unreadOnly, stage, search } = req.query;

    const where: any = {};
    if (chip) where.assignedNumber = Number(chip);
    if (unreadOnly === 'true') where.unreadCount = { gt: 0 };
    if (stage) where.stage = stage;
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string } },
      ];
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: [
        { unreadCount: 'desc' },
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { updatedAt: 'desc' },
      ],
      include: {
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 1,
        },
      },
    });

    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar inbox' });
  }
});

/**
 * GET /inbox/:leadId/messages
 * Busca todas as mensagens de uma conversa e marca como lida.
 */
router.get('/:leadId/messages', async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;

    const messages = await prisma.message.findMany({
      where: { leadId },
      orderBy: { sentAt: 'asc' },
    });

    // Marca como lido
    await prisma.lead.update({
      where: { id: leadId },
      data: { unreadCount: 0 },
    });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

/**
 * POST /inbox/:leadId/reply
 * Envia uma resposta manual (texto livre, sem IA).
 */
router.post('/:leadId/reply', async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const { text } = z.object({ text: z.string().min(1) }).parse(req.body);

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

    // Mostra "digitando..." proporcional ao texto
    await sendTyping(lead, text.length);

    // Envia via Evolution API
    await sendTextMessage(lead, text);

    // Salva no histórico
    const message = await saveMessage({
      leadId,
      direction: 'SENT',
      content: text,
      type: 'TEXT',
      fromNumber: lead.assignedNumber,
    });

    // Atualiza lastMessageAt
    await prisma.lead.update({
      where: { id: leadId },
      data: { lastMessageAt: new Date() },
    });

    res.json(message);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Texto inválido' });
    }
    const msg = err instanceof Error ? err.message : 'Erro ao enviar';
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /inbox/:leadId/suggest
 * Gera uma sugestão de resposta com base no histórico da conversa.
 */
router.post('/:leadId/suggest', async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { messages: { orderBy: { sentAt: 'desc' }, take: 10 } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

    const { generateSuggestedReply } = await import('../../ai/messageGenerator');
    const suggestion = await generateSuggestedReply(lead);

    res.json({ suggestion });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar sugestão';
    res.status(500).json({ error: msg });
  }
});
router.post('/:leadId/read', async (req: Request, res: Response) => {
  try {
    await prisma.lead.update({
      where: { id: req.params.leadId },
      data: { unreadCount: 0 },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao marcar como lido' });
  }
});

/**
 * POST /inbox/:leadId/media
 * Envia mídia (áudio, imagem, vídeo, documento) para o lead.
 * Body: { mediaType, base64, mimetype, caption?, fileName? }
 */
router.post('/:leadId/media', async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const { mediaType, base64, mimetype, caption, fileName } = z.object({
      mediaType: z.enum(['audio', 'image', 'video', 'document']),
      base64: z.string().min(10),
      mimetype: z.string(),
      caption: z.string().optional(),
      fileName: z.string().optional(),
    }).parse(req.body);

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

    // Envia via Evolution API
    switch (mediaType) {
      case 'audio':
        await sendAudioMessage(lead, base64, mimetype);
        break;
      case 'image':
        await sendImageMessage(lead, base64, caption || '', mimetype);
        break;
      case 'video':
        await sendVideoMessage(lead, base64, caption || '', mimetype);
        break;
      case 'document':
        await sendDocumentMessage(lead, base64, fileName || 'arquivo', mimetype);
        break;
    }

    // Determina conteúdo para salvar no histórico
    const contentMap: Record<string, string> = {
      audio: '[Áudio enviado]',
      image: caption ? `[Imagem] ${caption}` : '[Imagem enviada]',
      video: caption ? `[Vídeo] ${caption}` : '[Vídeo enviado]',
      document: `[Documento] ${fileName || 'arquivo'}`,
    };

    const typeMap: Record<string, 'TEXT' | 'AUDIO' | 'IMAGE'> = {
      audio: 'AUDIO',
      image: 'IMAGE',
      video: 'IMAGE', // reutiliza IMAGE para vídeo no enum atual
      document: 'TEXT',
    };

    const message = await saveMessage({
      leadId,
      direction: 'SENT',
      content: contentMap[mediaType],
      type: typeMap[mediaType],
      fromNumber: lead.assignedNumber,
    });

    await prisma.lead.update({
      where: { id: leadId },
      data: { lastMessageAt: new Date() },
    });

    log.msgSent(`[chip ${lead.assignedNumber}] → ${lead.phone} | ${mediaType}`);
    res.json(message);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    const msg = err instanceof Error ? err.message : 'Erro ao enviar mídia';
    log.error('Erro ao enviar mídia no inbox', err);
    res.status(500).json({ error: msg });
  }
});

export default router;
