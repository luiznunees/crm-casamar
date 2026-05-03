import { api } from './client';
import type { Campaign, CampaignTemplate, CampaignNode, CampaignEdge, LeadFilter } from '../types/campaign';

// ── Campaign CRUD ─────────────────────────────────────────────────────────────

export const campaignBuilderApi = {
  list: (params?: { page?: number; limit?: number }) =>
    api.get<{ campaigns: Campaign[]; total: number }>('/campaigns', { params }),

  get: (id: string) => api.get<Campaign>(`/campaigns/${id}`),

  create: (data: {
    name: string;
    type: Campaign['type'];
    nodes?: CampaignNode[];
    edges?: CampaignEdge[];
    targetFilter?: LeadFilter;
  }) => api.post<Campaign>('/campaigns', data),

  update: (id: string, data: Partial<{
    name: string;
    nodes: CampaignNode[];
    edges: CampaignEdge[];
    targetFilter: LeadFilter;
    status: Campaign['status'];
  }>) => api.put<Campaign>(`/campaigns/${id}`, data),

  delete: (id: string) => api.delete(`/campaigns/${id}`),

  dispatch: (id: string) => api.post<{ jobId: string }>(`/campaigns/${id}/dispatch`),

  /** SSE — retorna a URL para criar um EventSource no frontend */
  statusStreamUrl: (id: string) => `/api/campaigns/${id}/status`,

  previewAudience: (filter: LeadFilter) =>
    api.post<{ total: number; byStage: Record<string, number>; bySource: Record<string, number> }>(
      '/campaigns/preview-audience',
      filter
    ),
};

// ── Templates ─────────────────────────────────────────────────────────────────

export const campaignTemplatesApi = {
  list: () => api.get<CampaignTemplate[]>('/campaign-templates'),

  create: (data: { name: string; nodes: CampaignNode[]; edges: CampaignEdge[] }) =>
    api.post<CampaignTemplate>('/campaign-templates', data),

  delete: (id: string) => api.delete(`/campaign-templates/${id}`),
};

// ── AI endpoints ──────────────────────────────────────────────────────────────

export const aiBuilderApi = {
  suggestDelay: (leadId: string) =>
    api.post<{ suggestedSeconds: number; reason: string }>('/ai/suggest-delay', { leadId }),

  varyMessage: (template: string, leadId: string) =>
    api.post<{ message: string }>('/ai/vary-message', { template, leadId }),
};
