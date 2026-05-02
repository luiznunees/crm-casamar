import express from 'express';
import cors from 'cors';
import leadsRouter from './routes/leads';
import campaignsRouter from './routes/campaigns';
import messagesRouter from './routes/messages';
import webhookRouter from './routes/webhook';
import whatsappRouter from './routes/whatsapp';
import aiConfigRouter from './routes/aiConfig';
import inboxRouter from './routes/inbox';
import followUpRouter from './routes/followUp';
import settingsRouter from './routes/settings';
import importRouter from './routes/import';
import warmingFlowRouter from './routes/warmingFlow';

export function createApp() {
  const app = express();

  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }));

  app.use(express.json({ limit: '50mb' }));

  // Timeout maior para uploads (5 minutos)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/import')) {
      res.setTimeout(300_000); // 5 min
    }
    next();
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api/leads', leadsRouter);
  app.use('/api/campaigns', campaignsRouter);
  app.use('/api/messages', messagesRouter);
  app.use('/api/whatsapp', whatsappRouter);
  app.use('/api/ai-config', aiConfigRouter);
  app.use('/api/inbox', inboxRouter);
  app.use('/api/follow-up', followUpRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/import', importRouter);
  app.use('/api/warming-flow', warmingFlowRouter);

  // Webhook (sem prefixo /api para facilitar configuração na Evolution API)
  app.use('/webhook', webhookRouter);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
  });

  return app;
}
