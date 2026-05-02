import type { Stage, CampaignStatus } from './api/client';

export const STAGE_LABELS: Record<Stage, string> = {
  COLD: 'Frio',
  WARMING: 'Aquecendo',
  WARM: 'Morno',
  HOT: 'Quente',
  INTERESTED: 'Interessado',
};

export const STAGE_COLORS: Record<Stage, string> = {
  COLD: '#60a5fa',
  WARMING: '#fb923c',
  WARM: '#a3e635',
  HOT: '#f87171',
  INTERESTED: '#34d399',
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: 'Rascunho',
  SCHEDULED: 'Agendada',
  RUNNING: 'Rodando',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

export const SOURCES = ['Iniciada', 'Malibu', 'Amari', 'Outro'];

export const CHIP_COLORS: Record<number, string> = {
  1: '#6366f1',
  2: '#f59e0b',
};
