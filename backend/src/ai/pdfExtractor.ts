import Groq from 'groq-sdk';
import { log } from '../utils/logger';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

export interface ExtractedLead {
  phone: string;
  name?: string;
  email?: string;
}

/**
 * Usa IA para extrair leads estruturados de texto de PDF.
 * Processa chunks em paralelo para ser mais rápido.
 */
export async function extractLeadsWithAI(text: string): Promise<ExtractedLead[]> {
  const chunks = splitIntoChunks(text, 6000); // chunks maiores = menos chamadas
  const seenPhones = new Set<string>();
  const allLeads: ExtractedLead[] = [];

  log.ai(`Extraindo leads com IA — ${chunks.length} chunk(s)`);

  // Processa em lotes de 3 paralelos para ser mais rápido
  const BATCH_SIZE = 3;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((chunk, idx) => extractChunk(chunk, i + idx + 1, chunks.length))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const lead of result.value) {
          const phone = normalizePhone(lead.phone);
          if (phone && isValidPhone(phone) && !seenPhones.has(phone)) {
            seenPhones.add(phone);
            allLeads.push({ ...lead, phone });
          }
        }
      }
    }

    log.ai(`Progresso: ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length} chunks`);
  }

  log.ok(`IA extraiu ${allLeads.length} leads únicos`);
  return allLeads;
}

async function extractChunk(text: string, chunkNum: number, total: number): Promise<ExtractedLead[]> {
  const systemPrompt = `Extrator de contatos de documentos imobiliários brasileiros.
Retorne APENAS JSON array, sem texto adicional:
[{"phone":"51980196396","name":"NOME","email":"email@ex.com"}]

Regras:
- phone: só dígitos, sem DDI 55, sem formatação
- Celulares apenas (11 dígitos com 9 após DDD, ou 10 dígitos)
- Ignore CPF/CNPJ, telefones fixos
- Omita campos ausentes
- Sem duplicatas
Chunk ${chunkNum}/${total}`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    temperature: 0.1,
    max_tokens: 3000,
  });

  const raw = completion.choices[0]?.message?.content?.trim() || '[]';
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function splitIntoChunks(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  const lines = text.split('\n');
  let current = '';

  for (const line of lines) {
    if (current.length + line.length > maxChars && current.length > 0) {
      chunks.push(current);
      current = line + '\n';
    } else {
      current += line + '\n';
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

function normalizePhone(phone: string): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits.slice(2);
  return digits;
}

function isValidPhone(phone: string): boolean {
  if (phone.length < 10 || phone.length > 11) return false;
  const ddd = parseInt(phone.slice(0, 2));
  return ddd >= 11 && ddd <= 99;
}
