import prisma from '../prisma/client';

export interface AIConfigData {
  id: string;
  personaName: string;
  personaRole: string;
  companyName: string;
  globalRules: string;
  toneInstructions: string;
  forbiddenWords: string[];
  mustInclude: string[];
  maxLength: number;
  signatureTemplate: string;
  splitMessages: boolean;
  blockDelaySeconds: number;
  updatedAt: Date;
}

export interface AIConfigInput {
  personaName?: string;
  personaRole?: string;
  companyName?: string;
  globalRules?: string;
  toneInstructions?: string;
  forbiddenWords?: string[];
  mustInclude?: string[];
  maxLength?: number;
  signatureTemplate?: string;
  splitMessages?: boolean;
  blockDelaySeconds?: number;
}

const DEFAULT_CONFIG: AIConfigData = {
  id: 'default',
  personaName: 'Consultora',
  personaRole: 'consultora imobiliária',
  companyName: 'Imobiliária',
  globalRules: '',
  toneInstructions: '',
  forbiddenWords: [],
  mustInclude: [],
  maxLength: 300,
  signatureTemplate: '',
  splitMessages: true,
  blockDelaySeconds: 3,
  updatedAt: new Date(),
};

// Lê via SQL raw — não depende do Prisma client gerado
export async function getAIConfig(): Promise<AIConfigData> {
  try {
    const rows = await prisma.$queryRawUnsafe<AIConfigData[]>(
      `SELECT * FROM "AIConfig" WHERE id = 'default' LIMIT 1`
    );
    if (rows.length === 0) return DEFAULT_CONFIG;

    const row = rows[0];
    return {
      ...DEFAULT_CONFIG,
      ...row,
      // Garante que arrays são arrays (PostgreSQL retorna como array nativo)
      forbiddenWords: Array.isArray(row.forbiddenWords) ? row.forbiddenWords : [],
      mustInclude: Array.isArray(row.mustInclude) ? row.mustInclude : [],
      splitMessages: row.splitMessages ?? true,
      blockDelaySeconds: row.blockDelaySeconds ?? 3,
    };
  } catch (err) {
    console.warn('[AIConfig] Erro ao ler config, usando padrão:', (err as Error).message);
    return DEFAULT_CONFIG;
  }
}

// Salva via SQL raw com upsert
export async function updateAIConfig(data: AIConfigInput): Promise<AIConfigData> {
  const current = await getAIConfig();
  const merged = { ...current, ...data };

  const forbiddenArr = `ARRAY[${(merged.forbiddenWords || []).map((w) => `'${w.replace(/'/g, "''")}'`).join(',')}]::TEXT[]`;
  const mustArr = `ARRAY[${(merged.mustInclude || []).map((w) => `'${w.replace(/'/g, "''")}'`).join(',')}]::TEXT[]`;

  await prisma.$executeRawUnsafe(`
    INSERT INTO "AIConfig" (
      "id", "personaName", "personaRole", "companyName",
      "globalRules", "toneInstructions",
      "forbiddenWords", "mustInclude",
      "maxLength", "signatureTemplate",
      "splitMessages", "blockDelaySeconds", "updatedAt"
    ) VALUES (
      'default',
      '${esc(merged.personaName)}',
      '${esc(merged.personaRole)}',
      '${esc(merged.companyName)}',
      '${esc(merged.globalRules)}',
      '${esc(merged.toneInstructions)}',
      ${forbiddenArr},
      ${mustArr},
      ${merged.maxLength},
      '${esc(merged.signatureTemplate)}',
      ${merged.splitMessages},
      ${merged.blockDelaySeconds},
      NOW()
    )
    ON CONFLICT ("id") DO UPDATE SET
      "personaName"       = EXCLUDED."personaName",
      "personaRole"       = EXCLUDED."personaRole",
      "companyName"       = EXCLUDED."companyName",
      "globalRules"       = EXCLUDED."globalRules",
      "toneInstructions"  = EXCLUDED."toneInstructions",
      "forbiddenWords"    = EXCLUDED."forbiddenWords",
      "mustInclude"       = EXCLUDED."mustInclude",
      "maxLength"         = EXCLUDED."maxLength",
      "signatureTemplate" = EXCLUDED."signatureTemplate",
      "splitMessages"     = EXCLUDED."splitMessages",
      "blockDelaySeconds" = EXCLUDED."blockDelaySeconds",
      "updatedAt"         = NOW();
  `);

  return getAIConfig();
}

// Escapa aspas simples para SQL
function esc(val: string | undefined | null): string {
  return (val ?? '').replace(/'/g, "''");
}
