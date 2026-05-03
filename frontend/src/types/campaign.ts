// ── Tipos do Campaign Builder Visual ────────────────────────────────────────

export type CampaignNodeType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'delay'
  | 'poll'
  | 'list'
  | 'abTest'
  | 'condition';

export type CampaignType = 'QUICK' | 'SEGMENTED' | 'FREE' | 'TEMPLATE';

export interface CampaignNode {
  id: string;
  type: CampaignNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface CampaignEdge {
  id: string;
  source: string;
  target: string;
  label?: string; // usado em abTest e condition
  sourceHandle?: string;
  targetHandle?: string;
}

// ── Dados específicos por tipo de nó ────────────────────────────────────────

export interface TextNodeData {
  content: string;
  useAI: boolean;
}

export interface ImageNodeData {
  mediaUrl?: string;
  caption?: string;
  mimetype?: string;
}

export interface VideoNodeData {
  mediaUrl?: string;
  caption?: string;
  mimetype?: string;
}

export interface AudioNodeData {
  mediaUrl?: string;
  mimetype?: string;
  applyNoise?: boolean;
}

export interface DelayNodeData {
  mode: 'fixed' | 'ai';
  minSeconds?: number;
  maxSeconds?: number;
}

export interface PollNodeData {
  question: string;
  optionA: string;
  optionB: string;
}

export interface ListNodeData {
  title: string;
  footer?: string;
  items: string[];
}

export interface ABTestNodeData {
  percentA: number; // 0-100; percentB = 100 - percentA
  labelA?: string;
  labelB?: string;
}

export interface ConditionNodeData {
  field: 'stage' | 'engagementScore' | 'tags' | 'origin';
  operator: 'equals' | 'greaterThan' | 'contains';
  value: string;
}

// ── Campanha completa ────────────────────────────────────────────────────────

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  status: 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';
  nodes: CampaignNode[];
  edges: CampaignEdge[];
  targetFilter?: LeadFilter;
  createdAt: string;
  updatedAt: string;
}

export interface LeadFilter {
  stages?: string[];
  sources?: string[];
  origins?: string[];
  tags?: string[];
  tagsMatchAll?: boolean;
  minEngagementScore?: number;
}

export interface CampaignTemplate {
  id: string;
  name: string;
  nodes: CampaignNode[];
  edges: CampaignEdge[];
  createdAt: string;
}
