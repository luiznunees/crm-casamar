import { Router, Request, Response } from 'express';
import { getAllInstancesStatus, getQRCode, restartInstance } from '../../whatsapp/evolutionApi';
import { log } from '../../utils/logger';

const router = Router();

// GET /whatsapp/status
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await getAllInstancesStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao verificar status' });
  }
});

// GET /whatsapp/qrcode/:chip — pega o QR code de um chip (1 ou 2)
router.get('/qrcode/:chip', async (req: Request, res: Response) => {
  try {
    const chip = Number(req.params.chip);
    if (chip !== 1 && chip !== 2) return res.status(400).json({ error: 'Chip inválido' });
    const result = await getQRCode(chip);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar QR code' });
  }
});

// POST /whatsapp/restart/:chip — desconecta e gera novo QR
router.post('/restart/:chip', async (req: Request, res: Response) => {
  try {
    const chip = Number(req.params.chip);
    if (chip !== 1 && chip !== 2) return res.status(400).json({ error: 'Chip inválido' });
    const ok = await restartInstance(chip);
    log.ok(`Chip ${chip} reiniciado`);
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao reiniciar chip' });
  }
});

export default router;
