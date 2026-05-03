/**
 * Configurações centralizadas — todas as variáveis de ambiente são lidas aqui.
 * Nunca use process.env diretamente no restante do código.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const config = {
  // ── Server ──────────────────────────────────────────────────────────────────
  port: parseInt(optionalEnv('PORT', '3001'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  frontendUrl: optionalEnv('FRONTEND_URL', 'http://localhost:5173'),

  // ── Database ─────────────────────────────────────────────────────────────────
  databaseUrl: requireEnv('DATABASE_URL'),

  // ── Redis ────────────────────────────────────────────────────────────────────
  redisUrl: requireEnv('REDIS_URL'),

  // ── Groq AI ──────────────────────────────────────────────────────────────────
  groqApiKey: requireEnv('GROQ_API_KEY'),

  // ── Evolution API (WhatsApp) ──────────────────────────────────────────────────
  evolutionApiUrl: requireEnv('EVOLUTION_API_URL'),
  evolutionApiKey: requireEnv('EVOLUTION_API_KEY'),
  evolutionInstance1: optionalEnv('EVOLUTION_INSTANCE_1', 'chip-disparo'),
  evolutionInstance2: optionalEnv('EVOLUTION_INSTANCE_2', 'chip-luisjr'),

  // ── JWT Auth ─────────────────────────────────────────────────────────────────
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiresIn: optionalEnv('JWT_EXPIRES_IN', '7d'),

  // ── Object Storage (S3 / MinIO / R2) ─────────────────────────────────────────
  storage: {
    endpoint: optionalEnv('STORAGE_ENDPOINT', ''),
    region: optionalEnv('STORAGE_REGION', 'us-east-1'),
    bucket: optionalEnv('STORAGE_BUCKET', ''),
    accessKey: optionalEnv('STORAGE_ACCESS_KEY', ''),
    secretKey: optionalEnv('STORAGE_SECRET_KEY', ''),
    /** True se o storage está configurado (todas as envs presentes) */
    get enabled(): boolean {
      return !!(this.endpoint && this.bucket && this.accessKey && this.secretKey);
    },
  },
} as const;
