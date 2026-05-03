import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Save, BarChart2, MessageSquare, Clock, Tag } from 'lucide-react';
import { settingsApi, tagsApi, type QuickReply, type WeeklyReport, type Tag as TagType } from '../api/client';
import { STAGE_LABELS } from '../constants';
import type { Stage } from '../api/client';

// ── Tags tab ──────────────────────────────────────────────────────────────────

const TAG_PALETTE = [
  '#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316',
  '#f59e0b','#10b981','#14b8a6','#06b6d4','#3b82f6',
  '#64748b','#84cc16',
];

function TagsTab() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [error, setError] = useState('');

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: () => tagsApi.list().then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => tagsApi.create({ name, color, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      setName(''); setDescription(''); setColor('#6366f1'); setError('');
    },
    onError: (err: any) => setError(err?.response?.data?.error || 'Erro ao criar tag'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => tagsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tagsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  });

  return (
    <div>
      <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Etiquetas (Tags)</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        Crie etiquetas universais para segmentar leads em campanhas. Você pode combinar múltiplas tags com filtro AND ou OR.
      </p>

      {/* Criar nova tag */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h4 style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Nova Etiqueta</h4>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, flex: '1 1 160px' }}>
            <label className="form-label">Nome *</label>
            <input className="form-input" placeholder="Ex: beira lago" value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && name.trim() && createMutation.mutate()} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: '1 1 200px' }}>
            <label className="form-label">Descrição (opcional)</label>
            <input className="form-input" placeholder="Ex: Unidades com vista para o lago" value={description}
              onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Cor</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 200 }}>
              {TAG_PALETTE.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: color === c ? '3px solid white' : '2px solid transparent', cursor: 'pointer', outline: color === c ? `2px solid ${c}` : 'none' }} />
              ))}
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginBottom: 0 }}
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}>
            <Plus size={14} /> {createMutation.isPending ? 'Criando...' : 'Criar'}
          </button>
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</div>}
        {/* Preview */}
        {name.trim() && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Preview:</span>
            <span style={{ background: `${color}22`, color, border: `1px solid ${color}66`, borderRadius: 6, padding: '3px 10px', fontSize: 13, fontWeight: 600 }}>
              {name.trim()}
            </span>
          </div>
        )}
      </div>

      {/* Lista de tags */}
      {isLoading ? <div className="loading">Carregando...</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(tags as TagType[]).length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🏷️</div>
              <div className="empty-state-text">Nenhuma etiqueta criada</div>
            </div>
          ) : (tags as TagType[]).map(tag => (
            <div key={tag.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              {editingId === tag.id ? (
                <>
                  <input className="form-input" style={{ flex: 1, fontSize: 13 }} value={editName}
                    onChange={e => setEditName(e.target.value)} />
                  <div style={{ display: 'flex', gap: 4 }}>
                    {TAG_PALETTE.map(c => (
                      <button key={c} onClick={() => setEditColor(c)}
                        style={{ width: 18, height: 18, borderRadius: '50%', background: c, border: editColor === c ? '2px solid white' : '1px solid transparent', cursor: 'pointer' }} />
                    ))}
                  </div>
                  <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => updateMutation.mutate({ id: tag.id, data: { name: editName, color: editColor } })}>
                    Salvar
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setEditingId(null)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span style={{ background: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}66`, borderRadius: 6, padding: '3px 10px', fontSize: 13, fontWeight: 600, minWidth: 80, textAlign: 'center' }}>
                    {tag.name}
                  </span>
                  {tag.description && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>{tag.description}</span>
                  )}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={() => { setEditingId(tag.id); setEditName(tag.name); setEditColor(tag.color); }}>
                      Editar
                    </button>
                    <button className="btn btn-ghost" style={{ padding: '3px 8px' }}
                      onClick={() => { if (confirm(`Deletar a tag "${tag.name}"?`)) deleteMutation.mutate(tag.id); }}>
                      <X size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Auto-reply tab ────────────────────────────────────────────────────────────

function AutoReplyTab() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ['auto-reply-config'],
    queryFn: () => settingsApi.autoReply.get().then((r) => r.data),
  });

  const [form, setForm] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: () => settingsApi.autoReply.update(form),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auto-reply-config'] }),
  });

  const current = form ?? config;
  const set = (k: string, v: unknown) => setForm((f: any) => ({ ...(f ?? config), [k]: v }));

  if (isLoading) return <div className="loading">Carregando...</div>;

  return (
    <div style={{ maxWidth: 600 }}>
      <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Resposta Automática Fora do Horário</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        Quando o lead mandar mensagem fora do horário configurado, o sistema responde automaticamente.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={current?.enabled ?? false}
              onChange={(e) => set('enabled', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
            />
            <span style={{ fontWeight: 500 }}>Ativar resposta automática</span>
          </label>
          <span style={{
            padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
            background: current?.enabled ? '#1a3a2a' : 'var(--bg)',
            color: current?.enabled ? 'var(--success)' : 'var(--text-muted)',
            border: `1px solid ${current?.enabled ? 'var(--success)' : 'var(--border)'}`,
          }}>
            {current?.enabled ? '● Ativa' : '○ Inativa'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Início (hora)</label>
            <select className="form-select" value={current?.startHour ?? 22} onChange={(e) => set('startHour', Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Fim (hora)</label>
            <select className="form-select" value={current?.endHour ?? 8} onChange={(e) => set('endHour', Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Mensagem automática</label>
          <textarea
            className="form-textarea"
            style={{ minHeight: 80 }}
            value={current?.message ?? ''}
            onChange={(e) => set('message', e.target.value)}
            placeholder="Use {nome} para incluir o nome do lead"
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Use <code style={{ background: 'var(--bg)', padding: '1px 4px', borderRadius: 3 }}>{'{nome}'}</code> para personalizar com o nome do lead
          </span>
        </div>
      </div>

      {current?.enabled && (
        <div style={{ background: '#1e3a5f', border: '1px solid #3b82f6', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#93c5fd' }}>
          ℹ️ Ativo das <strong>{String(current.startHour).padStart(2, '0')}:00</strong> às <strong>{String(current.endHour).padStart(2, '0')}:00</strong>
        </div>
      )}

      <button className="btn btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending || !form}>
        <Save size={14} /> {mutation.isPending ? 'Salvando...' : 'Salvar'}
      </button>
      {mutation.isSuccess && <span style={{ marginLeft: 12, color: 'var(--success)', fontSize: 13 }}>✅ Salvo!</span>}
    </div>
  );
}

// ── Quick Replies tab ─────────────────────────────────────────────────────────

function QuickRepliesTab() {
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('geral');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['quick-replies'],
    queryFn: () => settingsApi.quickReplies.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => settingsApi.quickReplies.create({ title: newTitle, content: newContent, category: newCategory }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quick-replies'] });
      setNewTitle(''); setNewContent(''); setNewCategory('geral');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      settingsApi.quickReplies.update(id, { content }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quick-replies'] }); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => settingsApi.quickReplies.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quick-replies'] }),
  });

  const categories = [...new Set((items as QuickReply[]).map((i) => i.category))];

  return (
    <div>
      <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Templates de Resposta Rápida</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        Respostas pré-configuradas disponíveis no Inbox com um clique.
      </p>

      {/* Criar novo */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h4 style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Novo Template</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Título (nome curto)</label>
            <input className="form-input" placeholder="Ex: Confirmar visita" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Categoria</label>
            <input className="form-input" placeholder="Ex: visitas, preços, geral" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Texto da mensagem</label>
          <textarea className="form-textarea" style={{ minHeight: 70 }}
            placeholder="Ex: Posso te ligar agora para conversarmos melhor? 😊"
            value={newContent} onChange={(e) => setNewContent(e.target.value)} />
        </div>
        <button className="btn btn-primary" style={{ fontSize: 13 }}
          onClick={() => createMutation.mutate()}
          disabled={!newTitle || !newContent || createMutation.isPending}>
          <Plus size={13} /> {createMutation.isPending ? 'Criando...' : 'Criar Template'}
        </button>
      </div>

      {/* Lista */}
      {isLoading ? <div className="loading">Carregando...</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {categories.map((cat) => (
            <div key={cat}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                {cat}
              </div>
              {(items as QuickReply[]).filter((i) => i.category === cat).map((item) => (
                <div key={item.id} className="card" style={{ padding: '12px 16px', marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{item.title}</div>
                      {editingId === item.id ? (
                        <div>
                          <textarea className="form-textarea" style={{ minHeight: 60, fontSize: 13 }}
                            value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                            <button className="btn btn-primary" style={{ fontSize: 12 }}
                              onClick={() => updateMutation.mutate({ id: item.id, content: editContent })}>
                              Salvar
                            </button>
                            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditingId(null)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.content}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
                      {editingId !== item.id && (
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => { setEditingId(item.id); setEditContent(item.content); }}>
                          Editar
                        </button>
                      )}
                      <button className="btn btn-ghost" style={{ padding: '3px 8px' }}
                        onClick={() => { if (confirm('Deletar?')) deleteMutation.mutate(item.id); }}>
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {items.length === 0 && (
            <div className="empty-state"><div className="empty-state-icon">💬</div><div className="empty-state-text">Nenhum template criado</div></div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Report tab ────────────────────────────────────────────────────────────────

function ReportTab() {
  const { data: report, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['weekly-report'],
    queryFn: () => settingsApi.report().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <div className="loading">Gerando relatório...</div>;
  if (!report) return null;

  const r = report as WeeklyReport;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontWeight: 600, marginBottom: 2 }}>Relatório Semanal</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {r.period.from} → {r.period.to}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Atualizando...' : '↻ Atualizar'}
        </button>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total de Leads', value: r.leads.total, color: 'var(--text)' },
          { label: 'Novos esta semana', value: r.leads.newThisWeek, color: 'var(--primary)' },
          { label: 'Avançaram de stage', value: r.leads.advancedStage, color: 'var(--success)' },
          { label: 'Sem resposta', value: r.leads.withoutResponse, color: 'var(--warning)' },
          { label: 'Mensagens enviadas', value: r.messages.sent, color: 'var(--text)' },
          { label: 'Mensagens recebidas', value: r.messages.received, color: 'var(--success)' },
          { label: 'Taxa de resposta', value: `${r.messages.responseRate}%`, color: r.messages.responseRate >= 30 ? 'var(--success)' : 'var(--warning)' },
          { label: 'Campanhas rodadas', value: r.campaigns.ran, color: 'var(--primary)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value" style={{ color, fontSize: 22 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Leads quentes */}
      {r.hotLeads.length > 0 && (
        <div className="card">
          <h4 style={{ fontWeight: 600, marginBottom: 12 }}>🔥 Leads Quentes</h4>
          <table className="table">
            <thead>
              <tr><th>Nome</th><th>Telefone</th><th>Empreendimento</th><th>Stage</th><th>Última mensagem</th></tr>
            </thead>
            <tbody>
              {r.hotLeads.map((lead) => (
                <tr key={lead.id}>
                  <td style={{ fontWeight: 500 }}>{lead.name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem nome</span>}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{lead.phone}</td>
                  <td>{lead.source}</td>
                  <td><span className={`badge badge-${lead.stage.toLowerCase()}`}>{STAGE_LABELS[lead.stage as Stage]}</span></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {lead.lastMessageAt ? new Date(lead.lastMessageAt).toLocaleString('pt-BR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Settings Page ────────────────────────────────────────────────────────

export default function Settings() {
  const [tab, setTab] = useState<'tags' | 'auto-reply' | 'quick-replies' | 'report'>('tags');

  const tabs = [
    { key: 'tags',          label: 'Etiquetas',           icon: <Tag size={15} /> },
    { key: 'auto-reply',    label: 'Resposta Automática', icon: <Clock size={15} /> },
    { key: 'quick-replies', label: 'Respostas Rápidas',   icon: <MessageSquare size={15} /> },
    { key: 'report',        label: 'Relatório Semanal',   icon: <BarChart2 size={15} /> },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Configurações</h1>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {tabs.map(({ key, label, icon }) => (
          <button key={key} onClick={() => setTab(key as any)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              color: tab === key ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: tab === key ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: tab === key ? 600 : 400, fontSize: 14, marginBottom: -1,
            }}>
            {icon}{label}
          </button>
        ))}
      </div>

      {tab === 'tags' && <TagsTab />}
      {tab === 'auto-reply' && <AutoReplyTab />}
      {tab === 'quick-replies' && <QuickRepliesTab />}
      {tab === 'report' && <ReportTab />}
    </div>
  );
}
