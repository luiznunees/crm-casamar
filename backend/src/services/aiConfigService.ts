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
  // Anti-ban
  dailyLimitPerChip: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
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
  dailyLimitPerChip?: number;
  minDelaySeconds?: number;
  maxDelaySeconds?: number;
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
  dailyLimitPerChip: 300,
  minDelaySeconds: 20,
  maxDelaySeconds: 60,
  updatedAt: new Date(),
};

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
      forbiddenWords: Array.isArray(row.forbiddenWords) ? row.forbiddenWords : [],
      mustInclude: Array.isArray(row.mustInclude) ? row.mustInclude : [],
      splitMessages: row.splitMessages ?? true,
      blockDelaySeconds: row.blockDelaySeconds ?? 3,
      dailyLimitPerChip: row.dailyLimitPerChip ?? 300,
      minDelaySeconds: row.minDelaySeconds ?? 20,
      maxDelaySeconds: row.maxDelaySeconds ?? 60,
    };
  } catch (err) {
    console.warn('[AIConfig] Erro ao ler config, usando padrão:', (err as Error).message);
    return DEFAULT_CONFIG;
  }
}

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
      "splitMessages", "blockDelaySeconds",
      "dailyLimitPerChip", "minDelaySeconds", "maxDelaySeconds",
      "updatedAt"
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
      ${merged.dailyLimitPerChip},
      ${merged.minDelaySeconds},
      ${merged.maxDelaySeconds},
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
      "dailyLimitPerChip" = EXCLUDED."dailyLimitPerChip",
      "minDelaySeconds"   = EXCLUDED."minDelaySeconds",
      "maxDelaySeconds"   = EXCLUDED."maxDelaySeconds",
      "updatedAt"         = NOW();
  `);

  return getAIConfig();
}

function esc(val: string | undefined | null): string {
  return (val ?? '').replace(/'/g, "''");
}
