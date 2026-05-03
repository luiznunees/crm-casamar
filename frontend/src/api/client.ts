import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 300_000, // 5 minutos para uploads grandes
});

// Types
export type Stage = 'COLD' | 'WARMING' | 'WARM' | 'HOT' | 'INTERESTED';
export type PreferredContact = 'WHATSAPP' | 'AUDIO' | 'CALL';
export type MessageDirection = 'SENT' | 'RECEIVED';
export type MessageType = 'TEXT' | 'AUDIO' | 'IMAGE';
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';

export interface Lead {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  source: string;
  origin: string;
  stage: Stage;
  nameCollected: boolean;
  firstMessageSent: boolean;
  assignedNumber: number;
  preferredContact: PreferredContact;
  observations: string | null;
  tags: string[];
  unreadCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
  messages?: Message[];
}

export interface Message {
  id: string;
  leadId: string;
  direction: MessageDirection;
  content: string;
  type: MessageType;
  fromNumber: number | null;
  sentAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  targetStages: Stage[];
  targetSources: string[];
  targetOrigins: string[];
  targetTags: string[];
  targetTagsMatchAll: boolean;
  targetPreferredContact: string[];
  messageTemplate: string;
  scheduledAt: string | null;
  status: CampaignStatus;
  mediaAttachments: MediaAttachment[];
  sendWindowStart: string | null;
  sendWindowEnd: string | null;
  sendWindowDays: number[];
  createdAt: string;
  updatedAt: string;
  _count?: { campaignLeads: number };
}

export interface MediaAttachment {
  type: 'audio' | 'image' | 'video' | 'document';
  base64: string;
  mimetype: string;
  caption?: string;
  fileName?: string;
}

export interface LeadListResponse {
  leads: Lead[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LeadStats {
  total: number;
  byStage: Record<Stage, number>;
  bySource: Record<string, number>;
}

// Lead API
export const leadsApi = {
  list: (params?: Record<string, unknown>) => api.get<LeadListResponse>('/leads', { params }),
  get: (id: string) => api.get<Lead>(`/leads/${id}`),
  stats: () => api.get<LeadStats>('/leads/stats'),
  origins: () => api.get<string[]>('/leads/origins'),
  create: (data: Partial<Lead>) => api.post<Lead>('/leads', data),
  update: (id: string, data: Partial<Lead>) => api.patch<Lead>(`/leads/${id}`, data),
  updateName: (id: string, name: string) => api.patch<Lead>(`/leads/${id}/name`, { name }),
  delete: (id: string) => api.delete(`/leads/${id}`),
};

// Campaign API
export const campaignsApi = {
  list: () => api.get<Campaign[]>('/campaigns'),
  get: (id: string) => api.get<Campaign>(`/campaigns/${id}`),
  stats: (id: string) => api.get<Record<string, number>>(`/campaigns/${id}/stats`),
  create: (data: Partial<Campaign>) => api.post<Campaign>('/campaigns', data),
  dispatch: (id: string) => api.post(`/campaigns/${id}/dispatch`),
  cancel: (id: string) => api.patch(`/campaigns/${id}/cancel`),
  previewAudience: (filters: {
    targetStages?: Stage[];
    targetSources?: string[];
    targetTags?: string[];
    targetPreferredContact?: string[];
  }) => api.post<{ total: number; byStage: Record<string, number>; bySource: Record<string, number> }>('/campaigns/preview-audience', filters),
};

// Messages API
export const messagesApi = {
  byLead: (leadId: string) => api.get<Message[]>(`/messages/lead/${leadId}`),
  sendManual: (leadId: string, template: string) =>
    api.post('/messages/send-manual', { leadId, template }),
  sendNameRequest: (leadId: string) =>
    api.post('/messages/send-name-request', { leadId }),
};

// AI Config API
export interface AIConfig {
  id: string;
  personaName: string;
  personaRole: string;
  companyName: string;
  globalRules: string;
  toneInstructions: string;
  forbiddenWords: string[];
  mustInclude: string[];
  maxLength: number;
  signatureTemplate: string;
  splitMessages: boolean;
  blockDelaySeconds: number;
  updatedAt: string;
}

export const aiConfigApi = {
  get: () => api.get<AIConfig>('/ai-config'),
  update: (data: Partial<AIConfig>) => api.put<AIConfig>('/ai-config', data),
  preview: (template: string, mockLead?: { name?: string; source?: string; stage?: string }) =>
    api.post<{ blocks: string[]; raw: string }>('/ai-config/preview', { template, mockLead }),
};

// WhatsApp API
export const whatsappApi = {
  status: () => api.get('/whatsapp/status'),
  qrcode: (chip: number) => api.get<{ qrcode?: string; base64?: string; pairingCode?: string }>(`/whatsapp/qrcode/${chip}`),
  restart: (chip: number) => api.post(`/whatsapp/restart/${chip}`),
};

// Inbox API
export const inboxApi = {
  list: (params?: { chip?: number; unreadOnly?: boolean; stage?: string; search?: string }) =>
    api.get<Lead[]>('/inbox', { params }),
  messages: (leadId: string) => api.get<Message[]>(`/inbox/${leadId}/messages`),
  reply: (leadId: string, text: string) => api.post<Message>(`/inbox/${leadId}/reply`, { text }),
  markRead: (leadId: string) => api.post(`/inbox/${leadId}/read`),
  suggest: (leadId: string) => api.post<{ suggestion: string }>(`/inbox/${leadId}/suggest`),
  sendMedia: (leadId: string, attachment: MediaAttachment) =>
    api.post<Message>(`/inbox/${leadId}/media`, attachment),
};

// ── Follow-up API ─────────────────────────────────────────────────────────────

export interface FollowUpStep {
  id: string;
  sequenceId: string;
  order: number;
  delayDays: number;
  messageTemplate: string;
  mediaAttachments: MediaAttachment[];
}

export interface FollowUpSequence {
  id: string;
  name: string;
  description: string;
  targetStages: Stage[];
  targetSources: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  steps: FollowUpStep[];
  _count?: { leadFollowUps: number };
}

export interface LeadFollowUp {
  id: string;
  leadId: string;
  sequenceId: string;
  currentStep: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'STOPPED';
  startedAt: string;
  nextSendAt: string;
  stoppedAt: string | null;
  lead?: Lead;
  sequence?: FollowUpSequence;
}

export interface PendingFollowUpLead extends Lead {
  daysSinceLastMessage: number | null;
  inActiveSequence: boolean;
  leadFollowUps: LeadFollowUp[];
}

export interface FollowUpStats {
  active: number;
  completed: number;
  stopped: number;
  pendingNow: number;
}

export const followUpApi = {
  stats: () => api.get<FollowUpStats>('/follow-up/stats'),
  pending: (days?: number) => api.get<PendingFollowUpLead[]>('/follow-up/pending', { params: { days } }),
  process: () => api.post('/follow-up/process'),
  sequences: {
    list: () => api.get<FollowUpSequence[]>('/follow-up/sequences'),
    get: (id: string) => api.get<FollowUpSequence>(`/follow-up/sequences/${id}`),
    create: (data: Partial<FollowUpSequence> & { steps: Partial<FollowUpStep>[] }) =>
      api.post<FollowUpSequence>('/follow-up/sequences', data),
    update: (id: string, data: Partial<FollowUpSequence>) =>
      api.patch<FollowUpSequence>(`/follow-up/sequences/${id}`, data),
    toggle: (id: string) => api.patch<FollowUpSequence>(`/follow-up/sequences/${id}/toggle`),
    delete: (id: string) => api.delete(`/follow-up/sequences/${id}`),
  },
  enroll: (leadId: string, sequenceId: string) =>
    api.post<LeadFollowUp>('/follow-up/enroll', { leadId, sequenceId }),
  removeFromAll: (leadId: string) => api.delete(`/follow-up/lead/${leadId}`),
};

// ── Settings API ──────────────────────────────────────────────────────────────

export interface AutoReplyConfig {
  id: string;
  enabled: boolean;
  startHour: number;
  endHour: number;
  message: string;
}

export interface QuickReply {
  id: string;
  title: string;
  content: string;
  category: string;
  order: number;
  createdAt: string;
}

export interface WeeklyReport {
  period: { from: string; to: string };
  leads: {
    total: number;
    newThisWeek: number;
    byStage: Record<string, number>;
    advancedStage: number;
    withoutResponse: number;
  };
  messages: { sent: number; received: number; responseRate: number };
  campaigns: { ran: number; totalSent: number; totalFailed: number; totalSkipped: number };
  followUps: { executed: number; stopped: number };
  hotLeads: Array<{ id: string; name: string | null; phone: string; source: string; stage: string; lastMessageAt: string | null }>;
}

export interface QualificationResult {
  suggestedStage: Stage | null;
  extractedTags: string[];
  intentDetected: boolean;
  intentType: string | null;
  summary: string;
  confidence: number;
}

export const settingsApi = {
  autoReply: {
    get: () => api.get<AutoReplyConfig>('/settings/auto-reply'),
    update: (data: Partial<AutoReplyConfig>) => api.put<AutoReplyConfig>('/settings/auto-reply', data),
  },
  quickReplies: {
    list: () => api.get<QuickReply[]>('/settings/quick-replies'),
    create: (data: Partial<QuickReply>) => api.post<QuickReply>('/settings/quick-replies', data),
    update: (id: string, data: Partial<QuickReply>) => api.patch<QuickReply>(`/settings/quick-replies/${id}`, data),
    delete: (id: string) => api.delete(`/settings/quick-replies/${id}`),
  },
  report: () => api.get<WeeklyReport>('/settings/report/weekly'),
  qualifyLead: (leadId: string) => api.post<QualificationResult>(`/settings/qualify-lead/${leadId}`),
};

export const campaignTestApi = {
  test: (id: string, testLeadIds: string[]) =>
    api.post(`/campaigns/${id}/test`, { testLeadIds }),
};

// ── Tags API ──────────────────────────────────────────────────────────────────

export interface Tag {
  id: string;
  name: string;
  color: string;
  description: string;
  createdAt: string;
}

export const tagsApi = {
  list: () => api.get<Tag[]>('/tags'),
  create: (data: { name: string; color?: string; description?: string }) => api.post<Tag>('/tags', data),
  update: (id: string, data: Partial<Tag>) => api.patch<Tag>(`/tags/${id}`, data),
  delete: (id: string) => api.delete(`/tags/${id}`),
};

// ── Import API ────────────────────────────────────────────────────────────────

export interface LeadList {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  leadCount: number;
}

export interface ImportResult {
  total: number;
  imported: number;
  duplicates: number;
  invalid: number;
  leads: Array<{ phone: string; name?: string; status: 'imported' | 'duplicate' | 'invalid' }>;
}

export interface ExtractResult {
  fileName: string;
  totalFound: number;
  phones: string[];
  textPreview?: string;
}

export interface CSVPreviewResult {
  fileName: string;
  totalFound: number;
  preview: Array<{ phone: string; name?: string; email?: string }>;
  rows: Array<{ phone: string; name?: string; email?: string }>;
}

export const importApi = {
  lists: {
    list: () => api.get<LeadList[]>('/import/lists'),
    create: (data: { name: string; description?: string; color?: string }) =>
      api.post<LeadList>('/import/lists', data),
    delete: (id: string) => api.delete(`/import/lists/${id}`),
  },
  pdf: {
    extract: (file: File, useAI = false) => {
      const form = new FormData();
      form.append('file', file);
      form.append('useAI', String(useAI));
      return api.post<ExtractResult>('/import/pdf/extract', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    import: (file: File, opts: { source: string; assignedNumber: number; stage?: string; tags?: string[]; useAI?: boolean }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('source', opts.source);
      form.append('assignedNumber', String(opts.assignedNumber));
      if (opts.stage) form.append('stage', opts.stage);
      if (opts.tags) form.append('tags', JSON.stringify(opts.tags));
      if (opts.useAI !== undefined) form.append('useAI', String(opts.useAI));
      return api.post<ImportResult>('/import/pdf', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
  },
  csv: {
    preview: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post<CSVPreviewResult>('/import/csv/preview', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    import: (file: File, opts: { source: string; assignedNumber: number; stage?: string; tags?: string[] }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('source', opts.source);
      form.append('assignedNumber', String(opts.assignedNumber));
      if (opts.stage) form.append('stage', opts.stage);
      if (opts.tags) form.append('tags', JSON.stringify(opts.tags));
      return api.post<ImportResult>('/import/csv', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
  },
  bulk: (text: string, opts: { source: string; assignedNumber: number; stage?: string; tags?: string[] }) =>
    api.post<ImportResult>('/import/bulk', { text, ...opts }),
};

// ── Warming Flow API ──────────────────────────────────────────────────────────

export interface WarmingFlowStats {
  active: number;
  optOut: number;
  completed: number;
}

export const warmingFlowApi = {
  stats: () => api.get<WarmingFlowStats>('/warming-flow/stats'),
  leads: () => api.get<any[]>('/warming-flow/leads'),
  start: (leadId: string) => api.post(`/warming-flow/start/${leadId}`),
  cancel: (leadId: string) => api.delete(`/warming-flow/${leadId}`),
};
