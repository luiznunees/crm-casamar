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
    const config = await prisma.aIConfig.findUnique({
      where: { id: 'default' },
    });
    if (!config) return DEFAULT_CONFIG;

    return {
      ...DEFAULT_CONFIG,
      ...config,
      forbiddenWords: Array.isArray(config.forbiddenWords) ? config.forbiddenWords : [],
      mustInclude: Array.isArray(config.mustInclude) ? config.mustInclude : [],
      splitMessages: config.splitMessages ?? true,
      blockDelaySeconds: config.blockDelaySeconds ?? 3,
      dailyLimitPerChip: config.dailyLimitPerChip ?? 300,
      minDelaySeconds: config.minDelaySeconds ?? 20,
      maxDelaySeconds: config.maxDelaySeconds ?? 60,
    };
  } catch (err) {
    console.warn('[AIConfig] Erro ao ler config, usando padrão:', (err as Error).message);
    return DEFAULT_CONFIG;
  }
}

export async function updateAIConfig(data: AIConfigInput): Promise<AIConfigData> {
  const current = await getAIConfig();
  const merged = { ...current, ...data };

  await prisma.aIConfig.upsert({
    where: { id: 'default' },
    update: {
      personaName: merged.personaName,
      personaRole: merged.personaRole,
      companyName: merged.companyName,
      globalRules: merged.globalRules,
      toneInstructions: merged.toneInstructions,
      forbiddenWords: merged.forbiddenWords,
      mustInclude: merged.mustInclude,
      maxLength: merged.maxLength,
      signatureTemplate: merged.signatureTemplate,
      splitMessages: merged.splitMessages,
      blockDelaySeconds: merged.blockDelaySeconds,
      dailyLimitPerChip: merged.dailyLimitPerChip,
      minDelaySeconds: merged.minDelaySeconds,
      maxDelaySeconds: merged.maxDelaySeconds,
    },
    create: {
      id: 'default',
      personaName: merged.personaName,
      personaRole: merged.personaRole,
      companyName: merged.companyName,
      globalRules: merged.globalRules,
      toneInstructions: merged.toneInstructions,
      forbiddenWords: merged.forbiddenWords,
      mustInclude: merged.mustInclude,
      maxLength: merged.maxLength,
      signatureTemplate: merged.signatureTemplate,
      splitMessages: merged.splitMessages,
      blockDelaySeconds: merged.blockDelaySeconds,
      dailyLimitPerChip: merged.dailyLimitPerChip,
      minDelaySeconds: merged.minDelaySeconds,
      maxDelaySeconds: merged.maxDelaySeconds,
    },
  });

  return getAIConfig();
}

function esc(val: string | undefined | null): string {
  return (val ?? '').replace(/'/g, "''");
}
