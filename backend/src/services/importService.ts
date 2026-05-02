import prisma from '../prisma/client';
import { Stage } from '@prisma/client';
import { autoEnrollLead } from './followUpService';
import { log } from '../utils/logger';

export interface ImportResult {
  total: number;
  imported: number;
  duplicates: number;
  invalid: number;
  leads: Array<{ phone: string; name?: string; status: 'imported' | 'duplicate' | 'invalid' }>;
}

export interface LeadImportRow {
  phone: string;
  name?: string;
  email?: string;
  observations?: string;
}

// ── Phone extraction ──────────────────────────────────────────────────────────

/**
 * Extrai todos os números de telefone de um texto bruto (PDF, texto colado, etc.)
 * Suporta formatos brasileiros: (51) 99999-9999, 51999999999, +5551999999999, etc.
 */
export function extractPhonesFromText(text: string): string[] {
  const patterns = [
    // +55 (51) 99999-9999 ou +5551999999999
    /\+?55\s*\(?(\d{2})\)?\s*9?\d{4}[-\s]?\d{4}/g,
    // (51) 99999-9999 ou (51) 9999-9999
    /\((\d{2})\)\s*9?\d{4}[-\s]?\d{4}/g,
    // 51 99999-9999 ou 51999999999
    /\b(\d{2})\s*9\d{4}[-\s]?\d{4}\b/g,
    // 9 dígitos sem DDD (assume DDD padrão não aplicável — ignora)
  ];

  const found = new Set<string>();

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const cleaned = match[0].replace(/\D/g, '');
      const normalized = normalizePhone(cleaned);
      if (normalized && isValidBrazilianPhone(normalized)) {
        found.add(normalized);
      }
    }
  }

  return Array.from(found);
}

function normalizePhone(digits: string): string {
  // Remove DDI 55 se presente
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits.slice(2);
  }
  return digits;
}

function isValidBrazilianPhone(phone: string): boolean {
  // Deve ter 10 ou 11 dígitos (DDD + número)
  if (phone.length < 10 || phone.length > 11) return false;
  const ddd = parseInt(phone.slice(0, 2));
  // DDDs válidos no Brasil: 11-99
  if (ddd < 11 || ddd > 99) return false;
  return true;
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

/**
 * Parseia CSV simples. Detecta automaticamente separador (vírgula ou ponto-e-vírgula).
 * Colunas esperadas (case-insensitive): phone/telefone, name/nome, email, observations/observacoes
 */
export function parseCSV(content: string): LeadImportRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));

  const colIndex = {
    phone: headers.findIndex((h) => ['phone', 'telefone', 'fone', 'celular', 'whatsapp', 'numero', 'número'].includes(h)),
    name: headers.findIndex((h) => ['name', 'nome'].includes(h)),
    email: headers.findIndex((h) => ['email', 'e-mail'].includes(h)),
    observations: headers.findIndex((h) => ['observations', 'observacoes', 'observações', 'obs', 'notas'].includes(h)),
  };

  if (colIndex.phone === -1) {
    // Tenta usar a primeira coluna como telefone
    colIndex.phone = 0;
  }

  const rows: LeadImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.trim().replace(/^["']|["']$/g, ''));
    const rawPhone = cols[colIndex.phone] || '';
    const phone = normalizePhone(rawPhone.replace(/\D/g, ''));

    if (!phone || !isValidBrazilianPhone(phone)) continue;

    rows.push({
      phone,
      name: colIndex.name >= 0 ? cols[colIndex.name] || undefined : undefined,
      email: colIndex.email >= 0 ? cols[colIndex.email] || undefined : undefined,
      observations: colIndex.observations >= 0 ? cols[colIndex.observations] || undefined : undefined,
    });
  }

  return rows;
}

// ── Bulk import ───────────────────────────────────────────────────────────────

export async function importLeads(
  rows: LeadImportRow[],
  options: {
    source: string;
    assignedNumber?: 1 | 2; // ignorado — sempre intercala automaticamente
    stage?: Stage;
    tags?: string[];
  }
): Promise<ImportResult> {
  const result: ImportResult = {
    total: rows.length,
    imported: 0,
    duplicates: 0,
    invalid: 0,
    leads: [],
  };

  // Intercala chip 1 e 2 automaticamente
  let chipToggle: 1 | 2 = 1;

  for (const row of rows) {
    if (!row.phone || !isValidBrazilianPhone(row.phone)) {
      result.invalid++;
      result.leads.push({ phone: row.phone, status: 'invalid' });
      continue;
    }

    const existing = await prisma.lead.findUnique({ where: { phone: row.phone } });
    if (existing) {
      result.duplicates++;
      result.leads.push({ phone: row.phone, name: row.name, status: 'duplicate' });
      continue;
    }

    try {
      const lead = await prisma.lead.create({
        data: {
          phone: row.phone,
          name: row.name || null,
          email: row.email || null,
          source: options.source,
          stage: options.stage || 'COLD',
          nameCollected: !!row.name,
          assignedNumber: chipToggle, // intercala 1, 2, 1, 2...
          observations: row.observations || null,
          tags: options.tags || [],
        },
      });

      // Avança o toggle para o próximo lead
      chipToggle = chipToggle === 1 ? 2 : 1;

      await autoEnrollLead(lead.id).catch(() => {});

      result.imported++;
      result.leads.push({ phone: row.phone, name: row.name, status: 'imported' });
    } catch (err) {
      result.invalid++;
      result.leads.push({ phone: row.phone, name: row.name, status: 'invalid' });
      log.error(`Erro ao importar ${row.phone}`, err);
    }
  }

  log.ok(`Importação: ${result.imported} importados (chip 1: ~${Math.ceil(result.imported/2)}, chip 2: ~${Math.floor(result.imported/2)}), ${result.duplicates} duplicados, ${result.invalid} inválidos`);
  return result;
}

// ── Lead Lists CRUD ───────────────────────────────────────────────────────────

export async function createLeadList(data: { name: string; description?: string; color?: string }) {
  return prisma.leadList.create({ data: { name: data.name, description: data.description || '', color: data.color || '#6366f1' } });
}

export async function listLeadLists() {
  const lists = await prisma.leadList.findMany({ orderBy: { createdAt: 'desc' } });
  // Conta leads por source (nome da lista)
  const counts = await prisma.lead.groupBy({ by: ['source'], _count: { id: true } });
  const countMap = counts.reduce((acc, c) => ({ ...acc, [c.source]: c._count.id }), {} as Record<string, number>);
  return lists.map((l) => ({ ...l, leadCount: countMap[l.name] || 0 }));
}

export async function deleteLeadList(id: string) {
  return prisma.leadList.delete({ where: { id } });
}
