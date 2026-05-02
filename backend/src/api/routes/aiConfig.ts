import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getAIConfig, updateAIConfig } from '../../services/aiConfigService';
import { generatePreviewMessage } from '../../ai/messageGenerator';

const router = Router();

const updateSchema = z.object({
  personaName: z.string().min(1).optional(),
  personaRole: z.string().optional(),
  companyName: z.string().min(1).optional(),
  globalRules: z.string().optional(),
  toneInstructions: z.string().optional(),
  forbiddenWords: z.array(z.string()).optional(),
  mustInclude: z.array(z.string()).optional(),
  maxLength: z.number().min(50).max(1000).optional(),
  signatureTemplate: z.string().optional(),
  splitMessages: z.boolean().optional(),
  blockDelaySeconds: z.number().min(1).max(30).optional(),
});

const previewSchema = z.object({
  template: z.string().min(5),
  mockLead: z.object({
    name: z.string().optional(),
    source: z.string().optional(),
    stage: z.string().optional(),
  }).optional(),
});

// GET /ai-config
router.get('/', async (_req: Request, res: Response) => {
  try {
    const config = await getAIConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar configurações de IA' });
  }
});

// PUT /ai-config
router.put('/', async (req: Request, res: Response) => {
  try {
    const data = updateSchema.parse(req.body);
    const config = await updateAIConfig(data);
    res.json(config);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    res.status(500).json({ error: 'Erro ao salvar configurações de IA' });
  }
});

// POST /ai-config/preview
router.post('/preview', async (req: Request, res: Response) => {
  try {
    const { template, mockLead } = previewSchema.parse(req.body);
    const result = await generatePreviewMessage(template, mockLead);
    res.json(result); // { blocks: string[], raw: string }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    const msg = err instanceof Error ? err.message : 'Erro ao gerar preview';
    res.status(500).json({ error: msg });
  }
});

export default router;
