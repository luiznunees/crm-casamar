import prisma from '../prisma/client';
import Groq from 'groq-sdk';
import { Lead } from '@prisma/client';
import { sendTextMessage, sendTyping } from '../whatsapp/evolutionApi';
import { saveMessage } from './messageService';
import { getAIConfig } from './aiConfigService';
import { log } from '../utils/logger';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

/**
 * Tenta extrair um nome de uma mensagem recebida.
 *
 * Estratégia passiva — sem perguntar nada ao lead.
 * Captura padrões como:
 *   "João"  /  "Me chamo Maria"  /  "Sou o Carlos"  /  "Ana Silva"
 */
export function extractNameFromMessage(content: string): string | null {
  const cleaned = content.trim();

  // Mensagens longas dificilmente são só um nome
  if (cleaned.length > 80) return null;

  // Padrões explícitos de apresentação
  const explicitPatterns = [
    /^(?:me chamo|meu nome é|meu nome e|sou o|sou a|pode me chamar de|pode chamar de|aqui é o|aqui é a|aqui é)\s+([A-ZÀ-Úa-zà-ú][a-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú][a-zà-ú]+)*)/i,
    /^(?:oi|olá|ola|bom dia|boa tarde|boa noite)[,!]?\s+(?:me chamo|sou o|sou a|meu nome é)\s+([A-ZÀ-Úa-zà-ú][a-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú][a-zà-ú]+)*)/i,
  ];

  for (const pattern of explicitPatterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]?.trim().length >= 2) {
      return capitalize(match[1].trim());
    }
  }

  // Mensagem que é só um nome (1 ou 2 palavras, sem pontuação estranha)
  // Ex: "João", "Ana Silva", "Carlos Eduardo"
  const nameOnly = /^([A-ZÀ-Úa-zà-ú][a-zà-ú]{1,}(?:\s+[A-ZÀ-Úa-zà-ú][a-zà-ú]{1,})?)$/;
  const match = cleaned.match(nameOnly);
  if (match?.[1]) {
    const candidate = match[1].trim();
    // Rejeita palavras comuns que não são nomes
    const notNames = [
      'oi', 'olá', 'ola', 'sim', 'não', 'nao', 'ok', 'tudo', 'bem', 'bom', 'boa',
      'dia', 'tarde', 'noite', 'obrigado', 'obrigada', 'certo', 'claro', 'pode',
      'quero', 'queria', 'gostaria', 'preciso', 'tenho', 'tenho', 'interesse',
      'informações', 'informacoes', 'apartamento', 'imóvel', 'imovel', 'casa',
    ];
    if (!notNames.includes(candidate.toLowerCase()) && candidate.length >= 3) {
      return capitalize(candidate);
    }
  }

  return null;
}

function capitalize(str: string): string {
  return str
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Processa uma mensagem recebida de um lead sem nome.
 * Tenta extrair o nome passivamente — sem enviar nenhuma pergunta.
 * Se encontrar um nome, salva e avança o stage para WARMING.
 *
 * Retorna true se o nome foi coletado.
 */
export async function tryCollectName(lead: Lead, message: string): Promise<boolean> {
  if (lead.nameCollected && lead.name) return false;

  const name = extractNameFromMessage(message);
  if (!name) return false;

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      name,
      nameCollected: true,
      stage: lead.stage === 'COLD' ? 'WARMING' : lead.stage,
      updatedAt: new Date(),
    },
  });

  log.lead(`Nome coletado passivamente: "${name}" ← ${lead.phone}`);
  return true;
}

/**
 * Quando um lead COLD responde pela primeira vez, avança para WARMING.
 * Não envia nenhuma mensagem automática.
 * Retorna true se o stage foi alterado.
 */
export async function advanceFromCold(lead: Lead): Promise<boolean> {
  if (lead.stage !== 'COLD') return false;

  await prisma.lead.update({
    where: { id: lead.id },
    data: { stage: 'WARMING', updatedAt: new Date() },
  });

  log.lead(`${lead.phone} respondeu → COLD → WARMING`);
  return true;
}

/**
 * Verifica se um lead tem opt-out (tag 'opt-out').
 */
export async function hasOptOut(leadId: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { tags: true },
  });
  return lead?.tags.includes('opt-out') ?? false;
}

/**
 * Envia os 3 formatos de opt-in para comparação visual.
 * Usado apenas em modo de teste — em produção usa só um formato.
 */
export async function sendOptInComparison(lead: Lead): Promise<void> {
  const source = lead.source;

  try {
    // ── Formato 1: Texto simples com números ──────────────────────────────
    await sendTyping(lead, 80);
    await sendTextMessage(lead,
      `Posso te enviar novidades e ofertas sobre ${source}?\n\n1️⃣ Sim, pode mandar!\n2️⃣ Não, obrigado`
    );
    await saveMessage({ leadId: lead.id, direction: 'SENT', content: `[Formato 1 - Texto] Opt-in ${source}`, type: 'TEXT', fromNumber: lead.assignedNumber });

    await sleep(4000);

    // ── Formato 2: Enquete (Poll) ─────────────────────────────────────────
    await sendPollMessage(
      lead,
      `Posso te enviar novidades sobre ${source}?`,
      ['👍 Sim, pode mandar!', '👎 Não, obrigado'],
      1
    );
    await saveMessage({ leadId: lead.id, direction: 'SENT', content: `[Formato 2 - Poll] Opt-in ${source}`, type: 'TEXT', fromNumber: lead.assignedNumber });

    await sleep(4000);

    // ── Formato 3: Lista interativa ───────────────────────────────────────
    await sendListMessage(
      lead,
      `Novidades sobre ${source}`,
      `Posso te enviar ofertas e lançamentos sobre ${source}?`,
      'Ver opções',
      [
        {
          title: 'Sua preferência',
          rows: [
            { rowId: 'optin_yes', title: '✅ Sim, pode mandar!', description: 'Quero receber novidades' },
            { rowId: 'optin_no',  title: '❌ Não, obrigado',     description: 'Prefiro não receber' },
          ],
        },
      ]
    );
    await saveMessage({ leadId: lead.id, direction: 'SENT', content: `[Formato 3 - Lista] Opt-in ${source}`, type: 'TEXT', fromNumber: lead.assignedNumber });

    log.ok(`3 formatos de opt-in enviados para ${lead.name || lead.phone}`);
  } catch (err) {
    log.error('Erro ao enviar comparação de opt-in', err);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Gera uma variação da pergunta de opt-in usando IA.
 * Cada lead recebe uma frase diferente — evita fingerprint de robô.
 */
async function generateOptInQuestion(lead: Lead): Promise<string> {
  try {
    const config = await getAIConfig();
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `Você é ${config.personaName}, ${config.personaRole} da ${config.companyName}.
Gere UMA pergunta curta e casual de WhatsApp perguntando se a pessoa quer receber novidades sobre o empreendimento.
REGRAS:
- Máximo 1 linha
- Tom natural, como se fosse uma pessoa real digitando
- NÃO use opções numeradas, NÃO use "1️⃣", NÃO use "👍/👎"
- Pode usar no máximo 1 emoji leve (opcional)
- Varie a estrutura da frase — não comece sempre com "Posso"
- Seed de variação: ${Date.now()}
Responda APENAS com o texto da mensagem, sem aspas.`,
        },
        {
          role: 'user',
          content: `Empreendimento: ${lead.source}. Lead: ${lead.name || 'sem nome ainda'}.`,
        },
      ],
      temperature: 1.2,
      max_tokens: 80,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (text && text.length > 5) return text;
  } catch (err) {
    log.error('Erro ao gerar variação de opt-in, usando fallback', err);
  }

  // Fallback com variações locais caso a IA falhe
  const fallbacks = [
    `Posso te enviar novidades sobre ${lead.source}? 😊`,
    `Te mando as informações sobre ${lead.source}?`,
    `Quer receber as novidades do ${lead.source}?`,
    `Posso te passar as ofertas do ${lead.source}?`,
    `Tem interesse em receber atualizações sobre ${lead.source}?`,
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

/**
 * Envia uma pergunta de opt-in com variação gerada por IA.
 * Parece humano — cada lead recebe uma frase diferente.
 */
export async function sendOptInPoll(lead: Lead): Promise<void> {
  try {
    const msg = await generateOptInQuestion(lead);

    await sendTyping(lead, msg.length);
    await sendTextMessage(lead, msg);

    await saveMessage({
      leadId: lead.id,
      direction: 'SENT',
      content: msg,
      type: 'TEXT',
      fromNumber: lead.assignedNumber,
    });

    await prisma.lead.update({
      where: { id: lead.id },
      data: { tags: { push: 'opt-in-pending' }, updatedAt: new Date() },
    });

    log.ok(`Opt-in enviado para ${lead.name || lead.phone}: "${msg}"`);
  } catch (err) {
    log.error('Erro ao enviar opt-in', err);
  }
}

/**
 * Processa a resposta de um poll de opt-in.
 * Chamado pelo webhook quando o lead vota na enquete.
 *
 * Retorna true se a mensagem era uma resposta ao poll de opt-in.
 */
export async function processOptInPollResponse(lead: Lead, message: string): Promise<boolean> {
  // Só processa se o lead tem o poll pendente
  if (!lead.tags.includes('opt-in-pending')) return false;

  const lower = message.toLowerCase();
  const isPositive = lower.includes('sim') || lower.includes('👍') || lower.includes('pode');
  const isNegative = lower.includes('não') || lower.includes('nao') || lower.includes('👎') || lower.includes('obrigado');

  if (!isPositive && !isNegative) return false;

  // Remove a tag temporária
  const newTags = lead.tags.filter((t) => t !== 'opt-in-pending');

  if (isNegative) {
    // Opt-out — adiciona tag e mantém COLD
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        tags: [...newTags, 'opt-out'],
        updatedAt: new Date(),
      },
    });
    log.lead(`Opt-out via poll: ${lead.name || lead.phone}`);
  } else {
    // Opt-in confirmado — avança para WARMING
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        tags: newTags,
        stage: lead.stage === 'COLD' ? 'WARMING' : lead.stage,
        updatedAt: new Date(),
      },
    });
    log.ok(`Opt-in confirmado via poll: ${lead.name || lead.phone} → WARMING`);
  }

  return true;
}
