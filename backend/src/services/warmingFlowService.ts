import prisma from '../prisma/client';
import Groq from 'groq-sdk';
import { Lead } from '@prisma/client';
import { sendTextMessage, sendTyping } from '../whatsapp/evolutionApi';
import { saveMessage } from './messageService';
import { getAIConfig } from './aiConfigService';
import { log } from '../utils/logger';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

// ── Análise de resposta com IA ────────────────────────────────────────────────

async function analyzeResponse(
  message: string,
  context: 'name_question' | 'optin_question'
): Promise<{ type: 'name' | 'positive' | 'negative' | 'unclear'; extractedName?: string }> {
  const systemPrompt = context === 'name_question'
    ? `Analise a mensagem e determine se é um nome de pessoa.
Retorne JSON: {"type": "name", "extractedName": "Nome"} se for um nome
Retorne JSON: {"type": "negative"} se a pessoa recusou ou disse que não quer dar o nome
Retorne JSON: {"type": "unclear"} se não ficou claro
Exemplos de nome: "João", "Me chamo Maria", "Sou o Carlos", "Ana Silva"
Exemplos de negativo: "não", "prefiro não", "pra que?", "não quero"
Seja generoso — se parecer um nome, classifique como nome.`
    : `Analise a mensagem e determine se é uma resposta positiva ou negativa.
Retorne JSON: {"type": "positive"} se a pessoa quer receber ofertas/novidades
Retorne JSON: {"type": "negative"} se a pessoa não quer
Retorne JSON: {"type": "unclear"} se não ficou claro
Positivo: "sim", "claro", "pode mandar", "quero", "ok", "tá bom"
Negativo: "não", "nao", "não quero", "para de me mandar", "sai"`;

  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      temperature: 0.1,
      max_tokens: 100,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { type: 'unclear' };
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { type: 'unclear' };
  }
}

// ── Geração de mensagens ──────────────────────────────────────────────────────

async function generateNameQuestion(lead: Lead): Promise<string> {
  const config = await getAIConfig();
  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `Você é ${config.personaName}, ${config.personaRole} da ${config.companyName}.
Gere uma mensagem curta e casual de WhatsApp perguntando o nome da pessoa.
Tom: amigável, natural, não robótico.
Máximo 2 linhas. Seed: ${Date.now()}
Responda APENAS com o texto da mensagem.`,
      },
      { role: 'user', content: `Gere a mensagem para um novo contato do empreendimento ${lead.source}.` },
    ],
    temperature: 1.0,
    max_tokens: 100,
  });
  return completion.choices[0]?.message?.content?.trim() || `Oi! Sou ${config.personaName} da ${config.companyName}. Como posso te chamar? 😊`;
}

async function generateOptInQuestion(lead: Lead, name?: string): Promise<string> {
  const config = await getAIConfig();
  const nameStr = name || 'você';
  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `Você é ${config.personaName}, ${config.personaRole} da ${config.companyName}.
Gere uma mensagem curta perguntando se a pessoa quer receber novidades e ofertas de imóveis.
Tom: respeitoso, sem pressão, casual.
Máximo 2 linhas. Seed: ${Date.now()}
Responda APENAS com o texto da mensagem.`,
      },
      { role: 'user', content: `Gere a mensagem para ${nameStr}, interessado em ${lead.source}.` },
    ],
    temperature: 1.0,
    max_tokens: 120,
  });
  return completion.choices[0]?.message?.content?.trim() || `Tudo bem! Posso te enviar novidades e ofertas sobre ${lead.source}? 🏠`;
}

async function generateOptOutConfirmation(): Promise<string> {
  return 'Tudo bem! Não vou mais te incomodar. Se precisar de algo, é só chamar! 😊';
}

async function generateWelcomeAfterName(name: string, lead: Lead): Promise<string> {
  const config = await getAIConfig();
  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `Você é ${config.personaName}, ${config.personaRole} da ${config.companyName}.
Gere uma mensagem curta e calorosa agradecendo o nome e se apresentando melhor.
Mencione o empreendimento ${lead.source} de forma natural.
Máximo 3 linhas. Seed: ${Date.now()}
Responda APENAS com o texto da mensagem.`,
      },
      { role: 'user', content: `O lead disse que se chama ${name}.` },
    ],
    temperature: 1.0,
    max_tokens: 150,
  });
  return completion.choices[0]?.message?.content?.trim() || `Prazer, ${name}! Fico feliz em te conhecer. Tenho ótimas opções no ${lead.source} para te mostrar! 🏠`;
}

// ── Envio de mensagem ─────────────────────────────────────────────────────────

async function sendWarmingMessage(lead: Lead, message: string): Promise<void> {
  await sendTyping(lead, message.length);
  await sendTextMessage(lead, message);
  await saveMessage({
    leadId: lead.id,
    direction: 'SENT',
    content: message,
    type: 'TEXT',
    fromNumber: lead.assignedNumber,
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: { lastMessageAt: new Date() },
  });
}

// ── Fluxo principal ───────────────────────────────────────────────────────────

/**
 * Inicia o fluxo de aquecimento para um lead COLD sem nome.
 * Chamado quando o lead é criado ou quando a primeira mensagem é enviada.
 */
export async function startWarmingFlow(leadId: string): Promise<void> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;

  // Só inicia se COLD e sem nome
  if (lead.stage !== 'COLD' || lead.nameCollected) return;

  // Verifica se já tem fluxo ativo
  const existing = await prisma.warmingFlow.findUnique({ where: { leadId } });
  if (existing?.active) return;

  try {
    const message = await generateNameQuestion(lead);
    await sendWarmingMessage(lead, message);

    await prisma.warmingFlow.upsert({
      where: { leadId },
      create: { id: require('crypto').randomUUID(), leadId, step: 1, active: true },
      update: { step: 1, active: true, optOut: false, updatedAt: new Date() },
    });

    await prisma.lead.update({
      where: { id: leadId },
      data: { firstMessageSent: true },
    });

    log.ok(`Warming flow iniciado para ${lead.phone}`);
  } catch (err) {
    log.error('Erro ao iniciar warming flow', err);
  }
}

/**
 * Processa a resposta do lead no fluxo de aquecimento.
 * Chamado pelo webhook quando o lead responde.
 * 
 * REGRA: só ativa quando o lead responde e não tem nome.
 * O fluxo NÃO é iniciado na importação — só quando o lead responde.
 */
export async function processWarmingResponse(lead: Lead, message: string): Promise<boolean> {
  // Se já tem nome, não precisa do fluxo
  if (lead.nameCollected && lead.name) return false;

  // Busca fluxo existente
  let flow = await prisma.warmingFlow.findUnique({ where: { leadId: lead.id } });

  // Se não tem fluxo ativo e o lead não tem nome → inicia agora (primeira resposta)
  if (!flow || !flow.active) {
    if (!lead.nameCollected) {
      // Lead respondeu pela primeira vez sem ter nome → pergunta o nome
      log.lead(`Warming flow: ${lead.phone} respondeu sem nome → iniciando fluxo`);
      try {
        const nameQuestion = await generateNameQuestion(lead);
        await sendWarmingMessage(lead, nameQuestion);

        await prisma.warmingFlow.upsert({
          where: { leadId: lead.id },
          create: { id: require('crypto').randomUUID(), leadId: lead.id, step: 1, active: true },
          update: { step: 1, active: true, optOut: false, updatedAt: new Date() },
        });

        // Avança de COLD para WARMING (respondeu = não é mais frio)
        if (lead.stage === 'COLD') {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { stage: 'WARMING', updatedAt: new Date() },
          });
        }

        return true;
      } catch (err) {
        log.error('Erro ao iniciar warming flow na resposta', err);
        return false;
      }
    }
    return false;
  }

  log.lead(`Warming flow step ${flow.step} — ${lead.phone}: "${message.slice(0, 50)}"`);

  if (flow.step === 1) {
    // Passo 1: esperando o nome
    const analysis = await analyzeResponse(message, 'name_question');

    if (analysis.type === 'name' && analysis.extractedName) {
      // Salvou o nome — avança para WARMING
      const name = analysis.extractedName;
      await prisma.lead.update({
        where: { id: lead.id },
        data: { name, nameCollected: true, stage: 'WARMING', updatedAt: new Date() },
      });

      const reply = await generateWelcomeAfterName(name, lead);
      await sendWarmingMessage(lead, reply);

      // Encerra o fluxo
      await prisma.warmingFlow.update({
        where: { leadId: lead.id },
        data: { active: false, updatedAt: new Date() },
      });

      log.ok(`Nome coletado via warming flow: "${name}" (${lead.phone})`);
      return true;
    }

    if (analysis.type === 'negative') {
      // Recusou dar o nome — pergunta sobre opt-in
      const reply = await generateOptInQuestion(lead);
      await sendWarmingMessage(lead, reply);

      await prisma.warmingFlow.update({
        where: { leadId: lead.id },
        data: { step: 2, updatedAt: new Date() },
      });
      return true;
    }

    // Resposta unclear — também avança para opt-in (qualquer resposta = saiu do COLD)
    await prisma.lead.update({
      where: { id: lead.id },
      data: { stage: 'WARMING', updatedAt: new Date() },
    });

    const reply = await generateOptInQuestion(lead);
    await sendWarmingMessage(lead, reply);

    await prisma.warmingFlow.update({
      where: { leadId: lead.id },
      data: { step: 2, updatedAt: new Date() },
    });
    return true;
  }

  if (flow.step === 2) {
    // Passo 2: esperando opt-in
    const analysis = await analyzeResponse(message, 'optin_question');

    if (analysis.type === 'positive') {
      // Quer receber — avança para WARMING
      await prisma.lead.update({
        where: { id: lead.id },
        data: { stage: 'WARMING', updatedAt: new Date() },
      });

      await prisma.warmingFlow.update({
        where: { leadId: lead.id },
        data: { active: false, updatedAt: new Date() },
      });

      log.ok(`Opt-in confirmado: ${lead.phone} → WARMING`);
    } else if (analysis.type === 'negative') {
      // Não quer — opt-out
      const reply = await generateOptOutConfirmation();
      await sendWarmingMessage(lead, reply);

      await prisma.warmingFlow.update({
        where: { leadId: lead.id },
        data: { active: false, optOut: true, updatedAt: new Date() },
      });

      // Mantém COLD mas marca opt-out nas tags
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          tags: { push: 'opt-out' },
          updatedAt: new Date(),
        },
      });

      log.lead(`Opt-out: ${lead.phone} não quer receber mensagens`);
    } else {
      // Unclear — avança para WARMING mesmo assim (respondeu = não é COLD)
      await prisma.lead.update({
        where: { id: lead.id },
        data: { stage: 'WARMING', updatedAt: new Date() },
      });

      await prisma.warmingFlow.update({
        where: { leadId: lead.id },
        data: { active: false, updatedAt: new Date() },
      });
    }

    return true;
  }

  return false;
}

/**
 * Verifica se um lead tem opt-out (não quer receber mensagens).
 */
export async function hasOptOut(leadId: string): Promise<boolean> {
  const flow = await prisma.warmingFlow.findUnique({ where: { leadId } });
  return flow?.optOut === true;
}
