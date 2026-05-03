/**
 * Tipos para o editor visual de sequência de disparo.
 * Cada step é um bloco independente com tipo, conteúdo e delay.
 */

export type CampaignStepType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'poll' | 'delay';

export interface BaseStep {
  id: string;
  type: CampaignStepType;
  delayAfter: number; // segundos de espera APÓS este bloco antes do próximo
}

export interface TextStep extends BaseStep {
  type: 'text';
  content: string;       // mensagem base
  useAI: boolean;        // true = IA varia as palavras; false = envia exato
}

export interface ImageStep extends BaseStep {
  type: 'image';
  base64: string;
  mimetype: string;
  caption?: string;
}

export interface AudioStep extends BaseStep {
  type: 'audio';
  base64: string;
  mimetype: string;
}

export interface VideoStep extends BaseStep {
  type: 'video';
  base64: string;
  mimetype: string;
  caption?: string;
}

export interface DocumentStep extends BaseStep {
  type: 'document';
  base64: string;
  mimetype: string;
  fileName: string;
}

export interface PollStep extends BaseStep {
  type: 'poll';
  question: string;
  optionYes: string;
  optionNo: string;
  tagOnYes: string;  // etiqueta aplicada em quem vota sim
}

export interface DelayStep extends BaseStep {
  type: 'delay';
  seconds: number;   // pausa explícita (além do delayAfter)
}

export type CampaignStep =
  | TextStep
  | ImageStep
  | AudioStep
  | VideoStep
  | DocumentStep
  | PollStep
  | DelayStep;
