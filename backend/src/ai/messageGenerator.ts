import Groq from 'groq-sdk';
import { Lead, Message } from '@prisma/client';
import { getAIConfig } from '../services/aiConfigService';
import { config } from '../config';
import { log } from '../utils/logger';

const groq = new Groq({ apiKey: config.groqApiKey });
const MODEL = 'llama-3.3-70b-versatile';

type LeadWithMessages = Lead & { messages?: Message[] };

// ── Retry helper ─────────────────────────────────────────────────────────────

/** Erros recuperáveis da Groq (rate limit, serviço indisponível). */
const RECOVERABLE_STATUS = new Set([429, 503, 502]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa uma chamada à Groq com retry exponencial.
 * - Tenta até 3 vezes com delays de 1s, 2s e 4s.
 * - Distingue erros recuperáveis (429, 503) de permanentes (400, 401).
 * - Em caso de falha permanente, lança imediatamente sem retry.
 */
async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  const maxAttempts = 3;
  const delays = [1000, 2000, 4000];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as any)?.status ?? (err as any)?.statusCode ?? 0;
      const isRecoverable = RECOVERABLE_STATUS.has(status) || status === 0; // 0 = network error

      if (!isRecoverable) {
        // Erro permanente (ex: 400 bad request, 401 unauthorized) — falha imediata
        log.error(`[groq] ${context} → erro permanente (${status})`, err);
        throw err;
      }

      if (attempt === maxAttempts) {
        log.error(`[groq] ${context} → esgotou ${maxAttempts} tentativas (último status: ${status})`, err);
        throw err;
      }

      const delay = delays[attempt - 1];
      log.warn(`[groq] ${context} → tentativa ${attempt}/${maxAttempts} falhou (${status}). Retry em ${delay}ms…`);
      await sleep(delay);
    }
  }

  // TypeScript — nunca alcançado
  throw new Error('Retry loop exited unexpectedly');
}

// ── Parsers ───────────────────────────────────────────────────────────────────

/**
 * Separa a resposta da IA em blocos individuais.
 * Delimitador: linha contendo apenas "---"
 */
export function parseMessageBlocks(raw: string): string[] {
  return raw
    .split(/\n---\n|^---$/m)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

// ── Capitalize helper ─────────────────────────────────────────────────────────

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ── Fluxo 1: Coleta de nome ───────────────────────────────────────────────────

/**
 * Mensagem de coleta de nome (lead COLD sem nome).
 * Retorna array de blocos — normalmente 1 bloco só.
 */
export async function generateNameRequestMessage(lead: LeadWithMessages): Promise<string[]> {
  const aiConfig = await getAIConfig();
  const seed = Date.now();

  const systemPrompt = `Você é ${aiConfig.personaName}, ${aiConfig.personaRole} da ${aiConfig.companyName}.
Sua tarefa ÚNICA: apresentar-se brevemente e perguntar o nome da pessoa.

REGRAS:
- NÃO mencione imóveis, preços ou empreendimentos
- Mensagem curta (2-3 linhas)
- Tom casual, como WhatsApp
- Termine com pergunta pelo nome
${aiConfig.toneInstructions ? `\nTOM: ${aiConfig.toneInstructions}` : ''}
${aiConfig.forbiddenWords?.length ? `\nPALAVRAS PROIBIDAS: ${aiConfig.forbiddenWords.join(', ')}` : ''}

Seed: ${seed}
Responda APENAS com o texto da mensagem, sem aspas.`;

  const raw = await withRetry(async () => {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Novo contato do empreendimento "${lead.source}". Seed: ${seed}` },
      ],
      temperature: 1.0,
      max_tokens: 200,
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) throw new Error('Groq retornou resposta vazia');
    return text;
  }, `generateNameRequestMessage(${lead.id})`);

  return parseMessageBlocks(raw);
}

// ── Fluxo 2: Mensagem de campanha ─────────────────────────────────────────────

/**
 * Reescreve uma mensagem de campanha com variação por lead (anti-fingerprint).
 * Mantém o mesmo significado e tamanho da mensagem original.
 */
export async function generateCampaignMessage(
  lead: LeadWithMessages,
  campaignTemplate: string
): Promise<string[]> {
  const hasName = !!(lead.name && lead.nameCollected);
  const firstName = hasName ? capitalize(lead.name!.split(' ')[0]) : null;

  const aiConfig = await getAIConfig();
  const seed = Date.now();

  const blocksInstruction = aiConfig.splitMessages
    ? `FORMATO DE SAÍDA — OBRIGATÓRIO:
Separe cada frase/ideia com "---" em linha isolada.
Exemplo do formato correto:

Oi João!
---
Estou montando uma lista VIP com oportunidades no litoral.
---
Quer fazer parte?

NÃO envie tudo junto. Cada "---" vira uma mensagem separada no WhatsApp.`
    : `Mensagem em bloco único, sem separadores.`;

  const systemPrompt = `Você é um assistente que reescreve mensagens de WhatsApp.

TAREFA: Reescreva a mensagem abaixo mantendo:
- O mesmo significado e intenção
- O mesmo tamanho aproximado (não expanda)
- Tom casual de WhatsApp
- Português brasileiro correto e natural

O QUE VOCÊ PODE FAZER:
- Trocar palavras por sinônimos naturais
- Mudar a ordem das frases
- Variar expressões ("Posso te incluir?" → "Quer fazer parte?" → "Te coloco na lista?")
- Ajustar pontuação e emojis levemente
${hasName
  ? `- Inserir o nome "${firstName}" na saudação de forma natural`
  : `- Usar saudação genérica ("Oi!", "Olá!") — não temos o nome`}

O QUE VOCÊ NÃO PODE FAZER:
- Adicionar informações que não estão na mensagem original
- Inventar dados, preços, locais ou detalhes
- Aumentar o tamanho significativamente
- Errar gramática — "Aqui é o Luis Jr" ✅, "Estou Luis Jr" ❌, "Sou Luis Jr" ✅
- Usar o nome completo — use apenas o primeiro nome: "${firstName || 'nome'}"
- Usar construções estranhas em português
${aiConfig.forbiddenWords?.length ? `- Usar: ${aiConfig.forbiddenWords.join(', ')}` : ''}

${blocksInstruction}

Seed de variação: ${seed} — cada lead recebe uma versão diferente.
Responda APENAS com a mensagem reescrita, em português correto.`;

  const raw = await withRetry(async () => {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: campaignTemplate },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) throw new Error('Groq retornou resposta vazia');
    return text;
  }, `generateCampaignMessage(${lead.id})`);

  return parseMessageBlocks(raw);
}

// ── Preview / teste ───────────────────────────────────────────────────────────

/**
 * Preview/teste — retorna blocos sem enviar.
 */
export async function generatePreviewMessage(
  template: string,
  mockLead?: { name?: string; source?: string; stage?: string }
): Promise<{ blocks: string[]; raw: string }> {
  const aiConfig = await getAIConfig();
  const seed = Date.now();

  const name = mockLead?.name || 'João';
  const source = mockLead?.source || 'Empreendimento Exemplo';
  const stage = mockLead?.stage || 'WARM';

  const configuredRules: string[] = [];
  if (aiConfig.globalRules) configuredRules.push(`REGRAS OBRIGATÓRIAS:\n${aiConfig.globalRules}`);
  if (aiConfig.toneInstructions) configuredRules.push(`TOM E ESTILO:\n${aiConfig.toneInstructions}`);
  if (aiConfig.mustInclude?.length) configuredRules.push(`ELEMENTOS OBRIGATÓRIOS:\n- ${aiConfig.mustInclude.join('\n- ')}`);
  if (aiConfig.forbiddenWords?.length) configuredRules.push(`PALAVRAS PROIBIDAS: ${aiConfig.forbiddenWords.join(', ')}`);

  const blocksInstruction = aiConfig.splitMessages
    ? `FORMATO — MENSAGENS EM BLOCOS separados por "---":
BLOCO 1: Saudação curta (1 linha)
BLOCO 2: Contexto / gancho (1-2 linhas)
BLOCO 3: CTA ou próximo passo (1-2 linhas)${aiConfig.signatureTemplate ? `\nBLOCO 4: Assinatura: "${aiConfig.signatureTemplate}"` : ''}
Use "---" em linha separada entre cada bloco.`
    : `Mensagem em bloco único.${aiConfig.signatureTemplate ? ` Assinatura ao final: "${aiConfig.signatureTemplate}"` : ''}`;

  const systemPrompt = `Você é ${aiConfig.personaName}, ${aiConfig.personaRole} da ${aiConfig.companyName}.

LEAD DE TESTE: Nome: ${name} | Empreendimento: ${source} | Stage: ${stage}

INSTRUÇÃO: ${template}

${configuredRules.join('\n\n')}

${blocksInstruction}

REGRAS: Comece com "Oi ${name}" ou "Olá ${name}". Tom natural de WhatsApp. Seed: ${seed}
Responda APENAS com o texto.`;

  const raw = await withRetry(async () => {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Preview para ${name}. Seed: ${seed}` },
      ],
      temperature: 1.0,
      max_tokens: Math.ceil((aiConfig.maxLength || 300) * 2),
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) throw new Error('Groq retornou resposta vazia');
    return text;
  }, `generatePreviewMessage`);

  return { blocks: parseMessageBlocks(raw), raw };
}

// ── Sugestão de resposta (inbox) ──────────────────────────────────────────────

/**
 * Gera uma sugestão de resposta para o inbox.
 * Lê o histórico da conversa e sugere a próxima mensagem.
 */
export async function generateSuggestedReply(lead: LeadWithMessages): Promise<string> {
  const aiConfig = await getAIConfig();
  const seed = Date.now();

  const history = (lead.messages || [])
    .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())
    .slice(-12)
    .map((m) => {
      const who = m.direction === 'SENT' ? `${aiConfig.personaName}` : (lead.name || 'Lead');
      return `${who}: ${m.content}`;
    })
    .join('\n');

  const lastReceived = (lead.messages || [])
    .filter((m) => m.direction === 'RECEIVED')
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0];

  const systemPrompt = `Você é ${aiConfig.personaName}, ${aiConfig.personaRole} da ${aiConfig.companyName}.

CONTEXTO DO LEAD:
- Nome: ${lead.name || 'Desconhecido'}
- Empreendimento: ${lead.source}
- Stage: ${lead.stage}
${lead.observations ? `- Observações: ${lead.observations}` : ''}

HISTÓRICO DA CONVERSA:
${history || 'Nenhuma mensagem ainda.'}

${aiConfig.globalRules ? `REGRAS:\n${aiConfig.globalRules}` : ''}
${aiConfig.toneInstructions ? `TOM: ${aiConfig.toneInstructions}` : ''}
${aiConfig.forbiddenWords?.length ? `PALAVRAS PROIBIDAS: ${aiConfig.forbiddenWords.join(', ')}` : ''}

SUA TAREFA:
Gere UMA sugestão de resposta para a última mensagem recebida${lastReceived ? ` ("${lastReceived.content}")` : ''}.

REGRAS DA SUGESTÃO:
- Resposta natural, como se fosse você digitando no WhatsApp
- Curta e direta (1-3 linhas)
- Avance a conversa em direção ao objetivo (visita, interesse, fechamento)
- NÃO use "---" nem blocos — é uma resposta única
- NÃO comece com o nome do lead (é uma resposta, não uma abertura)
- Seed: ${seed}

Responda APENAS com o texto da sugestão.`;

  return await withRetry(async () => {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Sugira uma resposta. Seed: ${seed}` },
      ],
      temperature: 0.9,
      max_tokens: 200,
    });
    const suggestion = completion.choices[0]?.message?.content?.trim();
    if (!suggestion) throw new Error('Groq retornou sugestão vazia');
    return suggestion;
  }, `generateSuggestedReply(${lead.id})`);
}
