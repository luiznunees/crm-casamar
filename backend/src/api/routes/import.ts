import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  extractPhonesFromText, parseCSV, importLeads,
  createLeadList, listLeadLists, deleteLeadList,
  type LeadImportRow,
} from '../../services/importService';
import { extractLeadsWithAI } from '../../ai/pdfExtractor';
import { log } from '../../utils/logger';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'text/csv', 'text/plain'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Use PDF, CSV ou TXT.'));
    }
  },
});

const importOptsSchema = z.object({
  source: z.string().min(1),
  origin: z.string().optional(),
  assignedNumber: z.coerce.number().refine((n) => n === 1 || n === 2),
  stage: z.enum(['COLD', 'WARMING', 'WARM', 'HOT', 'INTERESTED']).optional(),
  tags: z.string().optional(),
  useAI: z.string().optional(),
});

async function extractTextFromFile(file: Express.Multer.File): Promise<string> {
  if (file.mimetype === 'application/pdf') {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(file.buffer);
    return data.text;
  }
  return file.buffer.toString('utf-8');
}

// ── Lead Lists ────────────────────────────────────────────────────────────────

router.get('/lists', async (_req, res: Response) => {
  try { res.json(await listLeadLists()); }
  catch { res.status(500).json({ error: 'Erro ao listar listas' }); }
});

router.post('/lists', async (req: Request, res: Response) => {
  try {
    const data = z.object({ name: z.string().min(1), description: z.string().optional(), color: z.string().optional() }).parse(req.body);
    res.status(201).json(await createLeadList(data));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos' });
    res.status(500).json({ error: 'Erro ao criar lista' });
  }
});

router.delete('/lists/:id', async (req: Request, res: Response) => {
  try { await deleteLeadList(req.params.id); res.status(204).send(); }
  catch { res.status(500).json({ error: 'Erro ao deletar lista' }); }
});

// ── PDF: extrai sem importar ──────────────────────────────────────────────────

router.post('/pdf/extract', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const useAI = req.body.useAI === 'true';
    const text = await extractTextFromFile(req.file);

    if (useAI) {
      log.ai(`Extração inteligente: "${req.file.originalname}"`);
      try {
        const leads = await extractLeadsWithAI(text);
        return res.json({
          fileName: req.file.originalname,
          totalFound: leads.length,
          leads,
          mode: 'ai',
        });
      } catch (aiErr) {
        log.warn(`IA falhou, usando extração simples: ${(aiErr as Error).message}`);
        // Fallback para extração simples
        const phones = extractPhonesFromText(text);
        return res.json({
          fileName: req.file.originalname,
          totalFound: phones.length,
          leads: phones.map(p => ({ phone: p })),
          mode: 'simple_fallback',
        });
      }
    }

    // Modo simples: só telefones
    const phones = extractPhonesFromText(text);
    log.ok(`PDF simples: ${phones.length} telefones de "${req.file.originalname}"`);
    res.json({
      fileName: req.file.originalname,
      totalFound: phones.length,
      phones,
      leads: phones.map(p => ({ phone: p })),
      mode: 'simple',
    });
  } catch (err) {
    log.error('Erro ao extrair PDF', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao processar' });
  }
});

// ── PDF: extrai E importa ─────────────────────────────────────────────────────

router.post('/pdf', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const opts = importOptsSchema.parse(req.body);
    const tags = opts.tags ? JSON.parse(opts.tags) : [];
    const useAI = opts.useAI === 'true';
    const text = await extractTextFromFile(req.file);

    let rows: LeadImportRow[];

    if (useAI) {
      log.ai(`Importação inteligente: "${req.file.originalname}"`);
      const leads = await extractLeadsWithAI(text);
      rows = leads;
    } else {
      const phones = extractPhonesFromText(text);
      rows = phones.map(phone => ({ phone }));
    }

    const result = await importLeads(rows, {
      source: opts.source,
      origin: opts.origin,
      assignedNumber: opts.assignedNumber as 1 | 2,
      stage: opts.stage,
      tags,
    });

    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao importar' });
  }
});

// ── CSV ───────────────────────────────────────────────────────────────────────

router.post('/csv/preview', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const rows = parseCSV(req.file.buffer.toString('utf-8'));
    res.json({ fileName: req.file.originalname, totalFound: rows.length, preview: rows.slice(0, 10), rows });
  } catch { res.status(500).json({ error: 'Erro ao processar CSV' }); }
});

router.post('/csv', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const opts = importOptsSchema.parse(req.body);
    const tags = opts.tags ? JSON.parse(opts.tags) : [];
    const rows = parseCSV(req.file.buffer.toString('utf-8'));
    const result = await importLeads(rows, {
      source: opts.source,
      origin: opts.origin,
      assignedNumber: opts.assignedNumber as 1 | 2,
      stage: opts.stage,
      tags,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos' });
    res.status(500).json({ error: 'Erro ao importar CSV' });
  }
});

// ── Bulk ──────────────────────────────────────────────────────────────────────

router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const { text, source, assignedNumber, stage, tags } = z.object({
      text: z.string().min(5),
      source: z.string().min(1),
      assignedNumber: z.number().refine((n) => n === 1 || n === 2),
      stage: z.enum(['COLD', 'WARMING', 'WARM', 'HOT', 'INTERESTED']).optional(),
      tags: z.array(z.string()).optional(),
    }).parse(req.body);

    const phones = extractPhonesFromText(text);
    const result = await importLeads(phones.map(p => ({ phone: p })), {
      source, assignedNumber: assignedNumber as 1 | 2, stage, tags: tags || [],
    });
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    res.status(500).json({ error: 'Erro ao importar' });
  }
});

export default router;
