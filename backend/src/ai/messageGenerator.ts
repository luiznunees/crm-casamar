import Groq from 'groq-sdk';
import { Lead, Message } from '@prisma/client';
import { getAIConfig } from '../services/aiConfigService';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

type LeadWithMessages = Lead & { messages?: Message[] };

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

/**
 * Fluxo 1: Mensagem de coleta de nome (lead COLD sem nome).
 * Retorna array de blocos — normalmente 1 bloco só.
 */
export async function generateNameRequestMessage(lead: LeadWithMessages): Promise<string[]> {
  const config = await getAIConfig();
  const seed = Date.now();

  const systemPrompt = `Você é ${config.personaName}, ${config.personaRole} da ${config.companyName}.
Sua tarefa ÚNICA: apresentar-se brevemente e perguntar o nome da pessoa.

REGRAS:
- NÃO mencione imóveis, preços ou empreendimentos
- Mensagem curta (2-3 linhas)
- Tom casual, como WhatsApp
- Termine com pergunta pelo nome
${config.toneInstructions ? `\nTOM: ${config.toneInstructions}` : ''}
${config.forbiddenWords?.length ? `\nPALAVRAS PROIBIDAS: ${config.forbiddenWords.join(', ')}` : ''}

Seed: ${seed}
Responda APENAS com o texto da mensagem, sem aspas.`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Novo contato do empreendimento "${lead.source}". Seed: ${seed}` },
    ],
    temperature: 1.0,
    max_tokens: 200,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error('Groq retornou resposta vazia');
  return parseMessageBlocks(raw);
}

/**
 * Fluxo 2: Mensagem de campanha em blocos separados.
 * BLOQUEIA se o lead não tiver nome coletado.
 */
export async function generateCampaignMessage(
  lead: LeadWithMessages,
  campaignTemplate: string
): Promise<string[]> {
  // Se não tem nome, gera mensagem sem usar o nome (não bloqueia mais)
  const hasName = lead.name && lead.nameCollected;

  const config = await getAIConfig();
  const seed = Date.now();

  const recentMessages = (lead.messages || [])
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
    .slice(0, 5)
    .reverse()
    .map((m) => `[${m.direction === 'SENT' ? config.personaName : 'Lead'}]: ${m.content}`)
    .join('\n');

  const configuredRules: string[] = [];
  if (config.globalRules) configuredRules.push(`REGRAS OBRIGATÓRIAS:\n${config.globalRules}`);
  if (config.toneInstructions) configuredRules.push(`TOM E ESTILO:\n${config.toneInstructions}`);
  if (config.mustInclude?.length) configuredRules.push(`ELEMENTOS OBRIGATÓRIOS:\n- ${config.mustInclude.join('\n- ')}`);
  if (config.forbiddenWords?.length) configuredRules.push(`PALAVRAS PROIBIDAS: ${config.forbiddenWords.join(', ')}`);

  // Instrução de blocos
  const blocksInstruction = config.splitMessages
    ? `FORMATO OBRIGATÓRIO — MENSAGENS EM BLOCOS:
A mensagem deve ser dividida em ${config.signatureTemplate ? '4' : '3'} blocos curtos separados por uma linha contendo apenas "---".
Estrutura obrigatória:
BLOCO 1: Saudação curta e casual (1 linha). Ex: "Oi ${lead.name}, bom dia! 😊"
BLOCO 2: Contexto / gancho principal (1-2 linhas). O que você quer comunicar.
BLOCO 3: Detalhe ou CTA (1-2 linhas). Convite, pergunta ou próximo passo.${config.signatureTemplate ? `\nBLOCO 4: Apenas a assinatura: "${config.signatureTemplate}"` : ''}

Exemplo de formato:
Oi ${lead.name}, tudo bem?
---
Vi que você tem interesse no ${lead.source} e queria te contar sobre as condições especiais dessa semana.
---
Posso te passar mais detalhes? É rapidinho 😊${config.signatureTemplate ? `\n---\n${config.signatureTemplate}` : ''}

IMPORTANTE: use exatamente "---" em uma linha separada para dividir os blocos. Nada mais.`
    : `Escreva a mensagem em um único bloco corrido.${config.signatureTemplate ? ` Termine com a assinatura: "${config.signatureTemplate}"` : ''}`;

  const systemPrompt = `Você é ${config.personaName}, ${config.personaRole} da ${config.companyName}.

LEAD:
- Nome: ${hasName ? lead.name : 'Desconhecido (não temos o nome ainda)'}
- Empreendimento: ${lead.source}
- Stage: ${lead.stage}
- Contato preferido: ${lead.preferredContact}
${lead.observations ? `- Observações: ${lead.observations}` : ''}
${lead.tags.length > 0 ? `- Tags: ${lead.tags.join(', ')}` : ''}

HISTÓRICO RECENTE:
${recentMessages || 'Nenhuma mensagem anterior.'}

INSTRUÇÃO DA CAMPANHA:
${campaignTemplate}

${configuredRules.join('\n\n')}

${blocksInstruction}

REGRAS ABSOLUTAS:
${hasName
  ? `1. O BLOCO 1 DEVE começar com o nome: "Oi ${lead.name}" ou "Olá ${lead.name}"`
  : `1. NÃO temos o nome desta pessoa. Comece com uma saudação genérica: "Oi!", "Olá!", "Bom dia!" — NUNCA invente um nome`}
2. Tom de WhatsApp — natural, humano, nunca robótico
3. Não mencione que é IA ou sistema automatizado
4. Seed de variação: ${seed} — gere algo único e diferente

Responda APENAS com os blocos no formato especificado.`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Gere a mensagem para ${hasName ? lead.name : 'este contato'}. Seed: ${seed}` },
    ],
    temperature: 1.0,
    max_tokens: Math.ceil((config.maxLength || 300) * 2),
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error('Groq retornou resposta vazia');
  return parseMessageBlocks(raw);
}

/**
 * Preview/teste — retorna blocos sem enviar.
 */
export async function generatePreviewMessage(
  template: string,
  mockLead?: { name?: string; source?: string; stage?: string }
): Promise<{ blocks: string[]; raw: string }> {
  const config = await getAIConfig();
  const seed = Date.now();

  const name = mockLead?.name || 'João';
  const source = mockLead?.source || 'Empreendimento Exemplo';
  const stage = mockLead?.stage || 'WARM';

  const configuredRules: string[] = [];
  if (config.globalRules) configuredRules.push(`REGRAS OBRIGATÓRIAS:\n${config.globalRules}`);
  if (config.toneInstructions) configuredRules.push(`TOM E ESTILO:\n${config.toneInstructions}`);
  if (config.mustInclude?.length) configuredRules.push(`ELEMENTOS OBRIGATÓRIOS:\n- ${config.mustInclude.join('\n- ')}`);
  if (config.forbiddenWords?.length) configuredRules.push(`PALAVRAS PROIBIDAS: ${config.forbiddenWords.join(', ')}`);

  const blocksInstruction = config.splitMessages
    ? `FORMATO — MENSAGENS EM BLOCOS separados por "---":
BLOCO 1: Saudação curta (1 linha)
BLOCO 2: Contexto / gancho (1-2 linhas)
BLOCO 3: CTA ou próximo passo (1-2 linhas)${config.signatureTemplate ? `\nBLOCO 4: Assinatura: "${config.signatureTemplate}"` : ''}
Use "---" em linha separada entre cada bloco.`
    : `Mensagem em bloco único.${config.signatureTemplate ? ` Assinatura ao final: "${config.signatureTemplate}"` : ''}`;

  const systemPrompt = `Você é ${config.personaName}, ${config.personaRole} da ${config.companyName}.

LEAD DE TESTE: Nome: ${name} | Empreendimento: ${source} | Stage: ${stage}

INSTRUÇÃO: ${template}

${configuredRules.join('\n\n')}

${blocksInstruction}

REGRAS: Comece com "Oi ${name}" ou "Olá ${name}". Tom natural de WhatsApp. Seed: ${seed}
Responda APENAS com o texto.`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Preview para ${name}. Seed: ${seed}` },
    ],
    temperature: 1.0,
    max_tokens: Math.ceil((config.maxLength || 300) * 2),
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error('Groq retornou resposta vazia');
  const blocks = parseMessageBlocks(raw);
  return { blocks, raw };
}

/**
 * Gera uma sugestão de resposta para o inbox.
 * Lê o histórico da conversa e sugere a próxima mensagem.
 * O usuário pode editar antes de enviar.
 */
export async function generateSuggestedReply(
  lead: LeadWithMessages
): Promise<string> {
  const config = await getAIConfig();
  const seed = Date.now();

  // Histórico ordenado do mais antigo para o mais recente
  const history = (lead.messages || [])
    .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())
    .slice(-12) // últimas 12 mensagens
    .map((m) => {
      const who = m.direction === 'SENT' ? `${config.personaName}` : (lead.name || 'Lead');
      return `${who}: ${m.content}`;
    })
    .join('\n');

  // Última mensagem recebida
  const lastReceived = (lead.messages || [])
    .filter((m) => m.direction === 'RECEIVED')
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0];

  const systemPrompt = `Você é ${config.personaName}, ${config.personaRole} da ${config.companyName}.

CONTEXTO DO LEAD:
- Nome: ${lead.name || 'Desconhecido'}
- Empreendimento: ${lead.source}
- Stage: ${lead.stage}
${lead.observations ? `- Observações: ${lead.observations}` : ''}

HISTÓRICO DA CONVERSA:
${history || 'Nenhuma mensagem ainda.'}

${config.globalRules ? `REGRAS:\n${config.globalRules}` : ''}
${config.toneInstructions ? `TOM: ${config.toneInstructions}` : ''}
${config.forbiddenWords?.length ? `PALAVRAS PROIBIDAS: ${config.forbiddenWords.join(', ')}` : ''}

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
}
