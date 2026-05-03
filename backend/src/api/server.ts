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
import tagsRouter from './routes/tags';
import uploadRouter from './routes/upload';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import campaignTemplatesRouter from './routes/campaignTemplates';
import aiRouter from './routes/ai';
import { authMiddleware } from '../middleware/auth';



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

  // Rotas públicas
  app.use('/api/auth', authRouter);
  
  // Webhook (sem prefixo /api e público)
  app.use('/webhook', webhookRouter);

  // Aplica auth middleware nas rotas de API privadas
  app.use('/api', authMiddleware);

  // Rotas privadas
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
  app.use('/api/tags', tagsRouter);
  app.use('/api/upload', uploadRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/campaign-templates', campaignTemplatesRouter);
  app.use('/api/ai', aiRouter);



  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
  });

  return app;
}
