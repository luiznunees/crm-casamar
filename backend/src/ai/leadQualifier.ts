import Groq from 'groq-sdk';
import { Lead, Message } from '@prisma/client';
import { getAIConfig } from '../services/aiConfigService';
import { log } from '../utils/logger';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

export interface QualificationResult {
  suggestedStage: 'COLD' | 'WARMING' | 'WARM' | 'HOT' | 'INTERESTED' | null;
  extractedTags: string[];
  intentDetected: boolean;
  intentType: string | null; // 'price_inquiry' | 'visit_request' | 'financing' | 'urgency' | null
  summary: string;
  confidence: number; // 0-100
}

const INTENT_KEYWORDS = [
  'quanto custa', 'qual o preço', 'valor', 'preço',
  'posso visitar', 'quero visitar', 'agendar visita', 'ver o imóvel',
  'financiamento', 'financiar', 'minha casa minha vida', 'fgts',
  'urgente', 'preciso logo', 'quando fica pronto', 'entrega',
  'disponível', 'tem disponível', 'ainda tem', 'reservar',
  'fechar', 'comprar', 'quero comprar', 'vou fechar',
];

/**
 * Detecta intenção de compra nas últimas mensagens recebidas.
 * Rápido — só analisa keywords, sem chamar a IA.
 */
export function detectBuyingIntent(messages: Message[]): {
  detected: boolean;
  type: string | null;
  keyword: string | null;
} {
  const recentReceived = messages
    .filter((m) => m.direction === 'RECEIVED')
    .slice(-5)
    .map((m) => m.content.toLowerCase());

  for (const text of recentReceived) {
    for (const kw of INTENT_KEYWORDS) {
      if (text.includes(kw)) {
        let type = 'general_interest';
        if (['quanto custa', 'qual o preço', 'valor', 'preço'].some((k) => text.includes(k))) type = 'price_inquiry';
        else if (['visitar', 'ver o imóvel', 'agendar'].some((k) => text.includes(k))) type = 'visit_request';
        else if (['financiamento', 'financiar', 'fgts'].some((k) => text.includes(k))) type = 'financing';
        else if (['fechar', 'comprar', 'reservar'].some((k) => text.includes(k))) type = 'ready_to_buy';
        else if (['urgente', 'preciso logo'].some((k) => text.includes(k))) type = 'urgency';

        return { detected: true, type, keyword: kw };
      }
    }
  }

  return { detected: false, type: null, keyword: null };
}

/**
 * Qualifica o lead com IA baseado no histórico da conversa.
 * Sugere novo stage, extrai tags e resume o interesse.
 */
export async function qualifyLead(
  lead: Lead & { messages: Message[] }
): Promise<QualificationResult> {
  const config = await getAIConfig();

  const history = lead.messages
    .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())
    .slice(-15)
    .map((m) => `[${m.direction === 'SENT' ? config.personaName : 'Lead'}]: ${m.content}`)
    .join('\n');

  const systemPrompt = `Você é um especialista em qualificação de leads imobiliários.
Analise a conversa e retorne um JSON com a qualificação do lead.

STAGES DISPONÍVEIS:
- COLD: sem interesse demonstrado, não respondeu ou resposta fria
- WARMING: respondeu, mostrou algum interesse inicial
- WARM: interesse claro, fez perguntas sobre o imóvel
- HOT: interesse alto, perguntou sobre preço/condições/visita
- INTERESTED: pronto para fechar, pediu proposta ou visita confirmada

RETORNE APENAS JSON válido neste formato:
{
  "suggestedStage": "WARM",
  "extractedTags": ["interessado em 3 quartos", "tem urgência", "quer financiamento"],
  "intentDetected": true,
  "intentType": "price_inquiry",
  "summary": "Lead demonstrou interesse claro no empreendimento, perguntou sobre preço e condições de pagamento.",
  "confidence": 85
}

intentType pode ser: "price_inquiry", "visit_request", "financing", "ready_to_buy", "urgency", null`;

  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Lead: ${lead.name || 'Sem nome'} | Empreendimento: ${lead.source} | Stage atual: ${lead.stage}\n\nConversa:\n${history || 'Sem mensagens ainda.'}` },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '{}';
    // Extrai JSON mesmo se vier com texto ao redor
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON não encontrado na resposta');

    const result = JSON.parse(jsonMatch[0]) as QualificationResult;
    log.ai(`Lead ${lead.name || lead.phone} qualificado: ${result.suggestedStage} (${result.confidence}%)`);
    return result;
  } catch (err) {
    log.error('Erro na qualificação do lead', err);
    return {
      suggestedStage: null,
      extractedTags: [],
      intentDetected: false,
      intentType: null,
      summary: '',
      confidence: 0,
    };
  }
}
