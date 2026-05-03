import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, ChevronRight, Folder, FolderOpen, Users } from 'lucide-react';
import { leadsApi, tagsApi, type Lead, type Stage, type LeadStats, type Tag } from '../api/client';
import { STAGE_LABELS, STAGE_COLORS, DEFAULT_ORIGINS } from '../constants';
import { StageBadge } from '../components/StageBadge';
import { LeadRowSkeleton } from '../components/Skeleton';
import { useDebounce } from '../hooks/useDebounce';

// ── Create Lead Modal ─────────────────────────────────────────────────────────

function CreateLeadModal({ onClose, defaultSource }: { onClose: () => void; defaultSource?: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', phone: '', email: '', source: defaultSource || '',
    origin: 'Orgânico',
    stage: 'COLD' as Stage, assignedNumber: 1 as 1 | 2,
    preferredContact: 'WHATSAPP' as const, observations: '', tags: [] as string[],
  });
  const [customOrigin, setCustomOrigin] = useState('');
  const [error, setError] = useState('');

  const { data: stats } = useQuery({
    queryKey: ['lead-stats'],
    queryFn: () => leadsApi.stats().then(r => r.data),
    staleTime: 30_000,
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: () => tagsApi.list().then(r => r.data),
    staleTime: 60_000,
  });

  const allSources = Array.from(new Set([
    ...Object.keys((stats as LeadStats | undefined)?.bySource || {}),
    'Iniciada', 'Malibu', 'Amari', 'Outro',
  ])).sort();

  const originOptions = [...DEFAULT_ORIGINS, ...(customOrigin && !DEFAULT_ORIGINS.includes(customOrigin) ? [customOrigin] : [])];

  const toggleTag = (tag: string) =>
    setForm(f => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag] }));

  const mutation = useMutation({
    mutationFn: () => leadsApi.create({
      ...form,
      name: form.name || undefined,
      email: form.email || undefined,
      observations: form.observations || undefined,
    } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead-stats'] });
      onClose();
    },
    onError: (err: any) => setError(err?.response?.data?.error || 'Erro ao criar lead'),
  });

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Novo Lead</h2>
        <div className="form-group">
          <label className="form-label">Telefone *</label>
          <input className="form-input" placeholder="51999999999" value={form.phone} onChange={e => set('phone', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Nome (opcional)</label>
          <input className="form-input" placeholder="Nome do lead" value={form.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Empreendimento *</label>
            <select className="form-select" value={form.source} onChange={e => set('source', e.target.value)}>
              <option value="">Selecione...</option>
              {allSources.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Origem *</label>
            <select className="form-select" value={form.origin} onChange={e => set('origin', e.target.value)}>
              {originOptions.map(o => <option key={o}>{o}</option>)}
              <option value="__custom__">+ Outra origem...</option>
            </select>
            {form.origin === '__custom__' && (
              <input className="form-input" style={{ marginTop: 6 }} placeholder="Ex: Indicação, Evento..."
                value={customOrigin} onChange={e => { setCustomOrigin(e.target.value); set('origin', e.target.value); }} />
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Stage</label>
            <select className="form-select" value={form.stage} onChange={e => set('stage', e.target.value)}>
              {Object.entries(STAGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Chip</label>
            <select className="form-select" value={form.assignedNumber} onChange={e => set('assignedNumber', Number(e.target.value))}>
              <option value={1}>Chip 1</option>
              <option value={2}>Chip 2</option>
            </select>
          </div>
        </div>

        {/* Tags */}
        {(allTags as Tag[]).length > 0 && (
          <div className="form-group">
            <label className="form-label">Etiquetas</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(allTags as Tag[]).map(tag => (
                <button key={tag.id} type="button" onClick={() => toggleTag(tag.name)}
                  style={{
                    padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600,
                    background: form.tags.includes(tag.name) ? `${tag.color}33` : 'transparent',
                    color: form.tags.includes(tag.name) ? tag.color : 'var(--text-muted)',
                    border: `1px solid ${form.tags.includes(tag.name) ? tag.color : 'var(--border)'}`,
                  }}>
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Observações</label>
          <textarea className="form-textarea" placeholder="Notas sobre o lead..." value={form.observations} onChange={e => set('observations', e.target.value)} />
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => mutation.mutate()} disabled={!form.phone || !form.source || mutation.isPending}>
            {mutation.isPending ? 'Criando...' : 'Criar Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Folder view ───────────────────────────────────────────────────────────────

function FolderView({ onSelectSource }: { onSelectSource: (source: string) => void }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['lead-stats'],
    queryFn: () => leadsApi.stats().then(r => r.data),
    staleTime: 30_000,
  });

  const s = stats as LeadStats | undefined;
  const sources = Object.entries(s?.bySource || {}).sort(([, a], [, b]) => b - a);

  if (isLoading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ height: 56, background: 'var(--bg-card)', borderRadius: 8, animation: 'shimmer 1.4s infinite' }} />
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sources.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">📁</div><div className="empty-state-text">Nenhuma lista ainda</div></div>
      ) : (
        sources.map(([source, count]) => {
          const stageBreakdown = s?.byStage || {};
          return (
            <div
              key={source}
              onClick={() => onSelectSource(source)}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-card)'; }}
            >
              <Folder size={20} color="var(--primary)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{source}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {count} lead{count !== 1 ? 's' : ''}
                </div>
              </div>
              {/* Mini barra de stages */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {(Object.keys(STAGE_LABELS) as Stage[]).map(stage => {
                  const n = stageBreakdown[stage] || 0;
                  if (n === 0) return null;
                  return (
                    <span key={stage} style={{ fontSize: 10, background: `${STAGE_COLORS[stage]}22`, color: STAGE_COLORS[stage], border: `1px solid ${STAGE_COLORS[stage]}44`, borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>
                      {STAGE_LABELS[stage].slice(0, 3)} {n}
                    </span>
                  );
                })}
              </div>
              <ChevronRight size={16} color="var(--text-muted)" />
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Lead list inside a folder ─────────────────────────────────────────────────

function LeadList({ source, onBack }: { source: string; onBack: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const search = useDebounce(searchInput, 350);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['leads', { search, stage: stageFilter, source, page }],
    queryFn: () => leadsApi.list({ search: search || undefined, stage: stageFilter || undefined, source, page }).then(r => r.data),
    placeholderData: prev => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => leadsApi.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['leads'] });
      const prev = qc.getQueryData(['leads', { search, stage: stageFilter, source, page }]);
      qc.setQueryData(['leads', { search, stage: stageFilter, source, page }], (old: any) => ({
        ...old,
        leads: old?.leads?.filter((l: Lead) => l.id !== id) ?? [],
        total: (old?.total ?? 1) - 1,
      }));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['leads', { search, stage: stageFilter, source, page }], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead-stats'] });
    },
  });

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <button className="btn btn-ghost" style={{ fontSize: 13, padding: '4px 10px' }} onClick={onBack}>
          <Users size={14} /> Todas as listas
        </button>
        <ChevronRight size={14} color="var(--text-muted)" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FolderOpen size={16} color="var(--primary)" />
          <span style={{ fontWeight: 600 }}>{source}</span>
          {data && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({data.total} leads)</span>}
          {isFetching && !isLoading && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>atualizando...</span>}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Novo Lead
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="search-bar" style={{ marginBottom: 16 }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar por nome, telefone..."
            value={searchInput} onChange={e => { setSearchInput(e.target.value); setPage(1); }} />
        </div>
        <select className="form-select" value={stageFilter} onChange={e => { setStageFilter(e.target.value); setPage(1); }}>
          <option value="">Todos os stages</option>
          {Object.entries(STAGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Nome / Telefone</th>
              <th>Stage</th>
              <th>Chip</th>
              <th>Origem</th>
              <th>Msgs</th>
              <th>Criado em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <LeadRowSkeleton key={i} />)
            ) : !data?.leads.length ? (
              <tr><td colSpan={6}>
                <div className="empty-state"><div className="empty-state-icon">👥</div><div className="empty-state-text">Nenhum lead encontrado</div></div>
              </td></tr>
            ) : (
              data.leads.map((lead: Lead) => (
                <tr key={lead.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/leads/${lead.id}`)}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{lead.name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem nome</span>}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{lead.phone}</div>
                  </td>
                  <td><StageBadge stage={lead.stage} /></td>
                  <td>
                    <span style={{ fontSize: 11, background: lead.assignedNumber === 1 ? 'rgba(99,102,241,0.15)' : 'rgba(245,158,11,0.15)', color: lead.assignedNumber === 1 ? '#6366f1' : '#f59e0b', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
                      chip {lead.assignedNumber}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lead.origin || '—'}</td>
                  <td>{lead._count?.messages ?? 0}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(lead.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost" style={{ padding: '4px 8px' }} aria-label="Deletar lead"
                      onClick={() => { if (confirm('Deletar este lead?')) deleteMutation.mutate(lead.id); }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
          <button className="btn btn-ghost" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
          <span style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{page} / {data.totalPages}</span>
          <button className="btn btn-ghost" disabled={page === data.totalPages} onClick={() => setPage(p => p + 1)}>Próxima</button>
        </div>
      )}

      {showCreate && <CreateLeadModal onClose={() => setShowCreate(false)} defaultSource={source} />}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Leads() {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Se tem uma pasta selecionada, mostra os leads dela
  if (selectedSource) {
    return <LeadList source={selectedSource} onBack={() => setSelectedSource(null)} />;
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Leads</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Novo Lead
        </button>
      </div>

      <FolderView onSelectSource={setSelectedSource} />

      {showCreate && <CreateLeadModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
