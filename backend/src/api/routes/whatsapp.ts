import { Router, Request, Response } from 'express';
import { getAllInstancesStatus, getQRCode, restartInstance } from '../../whatsapp/evolutionApi';
import { sendOptInComparison } from '../../services/warmingFlowService';
import prisma from '../../prisma/client';
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

// POST /whatsapp/test-optin/:phone — envia os 3 formatos de opt-in para comparação
router.post('/test-optin/:phone', async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    const lead = await prisma.lead.findFirst({
      where: { phone: { contains: phone.replace(/\D/g, '') } },
    });
    if (!lead) return res.status(404).json({ error: `Lead com telefone ${phone} não encontrado` });

    log.ok(`Enviando 3 formatos de opt-in para ${lead.phone}`);
    // Roda em background para não travar o response
    sendOptInComparison(lead).catch((err) => log.error('Erro no test-optin', err));

    res.json({ ok: true, message: `Enviando 3 formatos para ${lead.phone} (chip ${lead.assignedNumber})` });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao enviar teste' });
  }
});

export default router;
