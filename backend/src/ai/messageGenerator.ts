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
 * Fluxo 2: Mensagem de campanha.
 * Você escreve a mensagem base — a IA reescreve com variação de palavras
 * para cada lead (anti-fingerprint), mantendo o mesmo significado e tamanho.
 */
export async function generateCampaignMessage(
  lead: LeadWithMessages,
  campaignTemplate: string
): Promise<string[]> {
  const hasName = !!(lead.name && lead.nameCollected);
  const firstName = hasName
    ? capitalize(lead.name!.split(' ')[0])
    : null;

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
  const config = await getAIConfig();
  const seed = Date.now();

  const blocksInstruction = config.splitMessages
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
${config.forbiddenWords?.length ? `- Usar: ${config.forbiddenWords.join(', ')}` : ''}

${blocksInstruction}

Seed de variação: ${seed} — cada lead recebe uma versão diferente.
Responda APENAS com a mensagem reescrita, em português correto.`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: campaignTemplate },
    ],
    temperature: 0.7, // variação suficiente sem comprometer a gramática
    max_tokens: 300,
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
