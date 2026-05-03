import { Router, Request, Response } from 'express';
import { recalculateAllEngagementScores } from '../../services/messageService';
import { log } from '../../utils/logger';

const router = Router();

/**
 * GET /api/admin/recalculate-scores
 * Recalcula o engagementScore de todos os leads com base na contagem real de mensagens recebidas.
 * Útil para corrigir dessincronias após migrações ou bugs.
 */
router.get('/recalculate-scores', async (_req: Request, res: Response) => {
  try {
    log.ok('[admin] Iniciando recálculo de engagementScore...');
    const result = await recalculateAllEngagementScores();
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error('[admin] Erro ao recalcular scores', err);
    res.status(500).json({ error: 'Erro ao recalcular scores' });
  }
});

export default router;
