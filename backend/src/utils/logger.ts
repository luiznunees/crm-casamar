// Cores ANSI
const C = {
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',
  bold:   '\x1b[1m',
  // texto
  white:  '\x1b[37m',
  gray:   '\x1b[90m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
  // fundo
  bgRed:  '\x1b[41m',
};

function timestamp() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function prefix(color: string, label: string) {
  return `${C.dim}${timestamp()}${C.reset} ${color}${C.bold}${label}${C.reset}`;
}

export const log = {
  // ── Sistema ──────────────────────────────────────────
  server: (msg: string) =>
    console.log(`${prefix(C.cyan,   '⚡ SERVER ')} ${msg}`),

  db: (msg: string) =>
    console.log(`${prefix(C.blue,   '🗄  DB     ')} ${msg}`),

  redis: (msg: string) =>
    console.log(`${prefix(C.magenta,'📦 REDIS  ')} ${msg}`),

  worker: (msg: string) =>
    console.log(`${prefix(C.blue,   '⚙  WORKER ')} ${msg}`),

  scheduler: (msg: string) =>
    console.log(`${prefix(C.cyan,   '🕐 SCHED  ')} ${msg}`),

  // ── Webhook / Mensagens ───────────────────────────────
  webhook: (msg: string) =>
    console.log(`${prefix(C.green,  '📨 WEBHOOK')} ${msg}`),

  msgSent: (msg: string) =>
    console.log(`${prefix(C.green,  '📤 SENT   ')} ${msg}`),

  msgRecv: (msg: string) =>
    console.log(`${prefix(C.cyan,   '📥 RECV   ')} ${msg}`),

  // ── Leads / Campanhas ─────────────────────────────────
  lead: (msg: string) =>
    console.log(`${prefix(C.white,  '👤 LEAD   ')} ${msg}`),

  campaign: (msg: string) =>
    console.log(`${prefix(C.yellow, '📣 CAMP   ')} ${msg}`),

  ai: (msg: string) =>
    console.log(`${prefix(C.magenta,'🤖 AI     ')} ${msg}`),

  // ── Estados ───────────────────────────────────────────
  ok: (msg: string) =>
    console.log(`${prefix(C.green,  '✅ OK     ')} ${msg}`),

  skip: (msg: string) =>
    console.log(`${prefix(C.yellow, '⏭  SKIP   ')} ${msg}`),

  warn: (msg: string) =>
    console.warn(`${prefix(C.yellow, '⚠️  WARN   ')} ${msg}`),

  error: (msg: string, err?: unknown) => {
    console.error(`${prefix(C.red,   '❌ ERROR  ')} ${msg}`);
    if (err instanceof Error) {
      console.error(`${C.dim}           ${err.message}${C.reset}`);
    }
  },

  fatal: (msg: string, err?: unknown) => {
    console.error(`${prefix(C.bgRed + C.white, ' FATAL ')} ${msg}`);
    if (err) console.error(err);
  },

  // ── Separador visual ──────────────────────────────────
  divider: () =>
    console.log(`${C.dim}${'─'.repeat(60)}${C.reset}`),
};
