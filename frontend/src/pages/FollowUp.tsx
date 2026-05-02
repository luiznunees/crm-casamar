import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Pause, Trash2, Users, Clock, CheckCircle, Send, Sparkles, X } from 'lucide-react';
import {
  followUpApi, messagesApi, warmingFlowApi,
  type FollowUpSequence, type FollowUpStep,
  type PendingFollowUpLead, type Stage,
} from '../api/client';
import { STAGE_LABELS, SOURCES } from '../constants';
import { StageBadge } from '../components/StageBadge';
import { usePollingInterval } from '../hooks/usePageVisible';

// ── Create Sequence Modal ─────────────────────────────────────────────────────

function CreateSequenceModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetStages, setTargetStages] = useState<Stage[]>([]);
  const [targetSources, setTargetSources] = useState<string[]>([]);
  const [steps, setSteps] = useState([
    { order: 1, delayDays: 1, messageTemplate: '' },
  ]);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => followUpApi.sequences.create({ name, description, targetStages, targetSources, steps }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['follow-up-sequences'] }); onClose(); },
    onError: (err: any) => setError(err?.response?.data?.error || 'Erro ao criar sequência'),
  });

  const addStep = () => setSteps((s) => [...s, { order: s.length + 1, delayDays: 3, messageTemplate: '' }]);
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i).map((st, idx) => ({ ...st, order: idx + 1 })));
  const updateStep = (i: number, field: string, value: unknown) =>
    setSteps((s) => s.map((st, idx) => idx === i ? { ...st, [field]: value } : st));

  const toggleStage = (stage: Stage) =>
    setTargetStages((s) => s.includes(stage) ? s.filter((x) => x !== stage) : [...s, stage]);
  const toggleSource = (source: string) =>
    setTargetSources((s) => s.includes(source) ? s.filter((x) => x !== source) : [...s, source]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Nova Sequência de Follow-up</h2>

        <div className="form-group">
          <label className="form-label">Nome *</label>
          <input className="form-input" placeholder="Ex: Sequência COLD 7 dias" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Descrição</label>
          <input className="form-input" placeholder="Descrição opcional" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Stages que entram automaticamente *</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(Object.keys(STAGE_LABELS) as Stage[]).map((stage) => (
              <button key={stage} type="button"
                className={`badge badge-${stage.toLowerCase()}`}
                style={{ cursor: 'pointer', padding: '6px 12px', border: targetStages.includes(stage) ? '2px solid white' : '2px solid transparent' }}
                onClick={() => toggleStage(stage)}>
                {STAGE_LABELS[stage]}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Empreendimentos (vazio = todos)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SOURCES.map((source) => (
              <button key={source} type="button"
                style={{ padding: '5px 10px', borderRadius: 6, border: targetSources.includes(source) ? '2px solid var(--primary)' : '2px solid var(--border)', background: targetSources.includes(source) ? 'var(--primary)' : 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}
                onClick={() => toggleSource(source)}>
                {source}
              </button>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <label className="form-label" style={{ margin: 0 }}>Passos da Sequência *</label>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={addStep}>
              <Plus size={13} /> Adicionar Passo
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {steps.map((step, i) => (
              <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Passo {step.order}</span>
                  {steps.length > 1 && (
                    <button onClick={() => removeStep(i)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginBottom: 10 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">
                      {i === 0 ? 'Enviar após (dias da criação)' : 'Enviar após (dias do passo anterior)'}
                    </label>
                    <input className="form-input" type="number" min={0} max={365}
                      value={step.delayDays}
                      onChange={(e) => updateStep(i, 'delayDays', Number(e.target.value))} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Template / Instrução para a IA *</label>
                  <textarea className="form-textarea" style={{ minHeight: 70 }}
                    placeholder="Ex: Fazer follow-up gentil, perguntar se ainda tem interesse no empreendimento..."
                    value={step.messageTemplate}
                    onChange={(e) => updateStep(i, 'messageTemplate', e.target.value)} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary"
            onClick={() => mutation.mutate()}
            disabled={!name || !targetStages.length || steps.some((s) => !s.messageTemplate) || mutation.isPending}>
            {mutation.isPending ? 'Criando...' : 'Criar Sequência'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pending Lead Card ─────────────────────────────────────────────────────────

function PendingLeadCard({ lead }: { lead: PendingFollowUpLead }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [sending, setSending] = useState(false);

  const handleSuggest = async () => {
    setSuggestLoading(true);
    try {
      // Usa o endpoint de sugestão do inbox
      const res = await fetch(`/api/inbox/${lead.id}/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      setSuggestion(data.suggestion || '');
    } catch { setSuggestion(''); }
    finally { setSuggestLoading(false); }
  };

  const handleSend = async () => {
    if (!suggestion.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/inbox/${lead.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: suggestion }),
      });
      setSuggestion('');
      qc.invalidateQueries({ queryKey: ['follow-up-pending'] });
    } catch { }
    finally { setSending(false); }
  };

  const urgencyColor = (lead.daysSinceLastMessage ?? 0) >= 7 ? 'var(--danger)'
    : (lead.daysSinceLastMessage ?? 0) >= 3 ? 'var(--warning)'
    : 'var(--text-muted)';

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
            {(lead.name || lead.phone)[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>{lead.name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem nome</span>}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lead.phone} · {lead.source}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StageBadge stage={lead.stage} />
          <span style={{ fontSize: 12, color: urgencyColor, fontWeight: 600 }}>
            {lead.daysSinceLastMessage !== null ? `${lead.daysSinceLastMessage}d sem resposta` : 'Nunca respondeu'}
          </span>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => navigate(`/leads/${lead.id}`)}>
            Ver Lead
          </button>
        </div>
      </div>

      {/* Última mensagem */}
      {lead.messages?.[0] && (
        <div style={{ background: 'var(--bg)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          <span style={{ fontWeight: 500 }}>{lead.messages[0].direction === 'SENT' ? '✓ Você: ' : '← Lead: '}</span>
          {lead.messages[0].content.slice(0, 100)}{lead.messages[0].content.length > 100 ? '…' : ''}
        </div>
      )}

      {lead.inActiveSequence && (
        <div style={{ fontSize: 11, color: 'var(--primary)', marginBottom: 10 }}>
          ⚡ Em sequência automática: {lead.leadFollowUps[0]?.sequence?.name}
        </div>
      )}

      {/* Sugestão de resposta */}
      {suggestion ? (
        <div>
          <textarea
            className="form-textarea"
            style={{ minHeight: 70, fontSize: 13, marginBottom: 8 }}
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={handleSend} disabled={sending}>
              <Send size={13} /> {sending ? 'Enviando...' : 'Enviar'}
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setSuggestion('')}>
              Descartar
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={handleSuggest} disabled={suggestLoading}>
              <Sparkles size={13} /> Gerar outra
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--primary)', borderColor: 'var(--primary)' }}
          onClick={handleSuggest} disabled={suggestLoading}>
          {suggestLoading
            ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> Gerando...</>
            : <><Sparkles size={13} /> Sugerir resposta com IA</>
          }
        </button>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FollowUp() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'sequences' | 'warming'>('pending');
  const [showCreate, setShowCreate] = useState(false);
  const [daysFilter, setDaysFilter] = useState(2);

  const poll = usePollingInterval(30_000);

  const { data: stats } = useQuery({
    queryKey: ['follow-up-stats'],
    queryFn: () => followUpApi.stats().then((r) => r.data),
    refetchInterval: poll,
  });

  const { data: warmingStats } = useQuery({
    queryKey: ['warming-flow-stats'],
    queryFn: () => warmingFlowApi.stats().then((r) => r.data),
    refetchInterval: poll,
  });

  const { data: warmingLeads = [], isLoading: warmingLoading } = useQuery({
    queryKey: ['warming-flow-leads'],
    queryFn: () => warmingFlowApi.leads().then((r) => r.data),
    refetchInterval: poll,
    enabled: tab === 'warming',
  });

  const { data: pending = [], isLoading: pendingLoading } = useQuery({
    queryKey: ['follow-up-pending', daysFilter],
    queryFn: () => followUpApi.pending(daysFilter).then((r) => r.data),
    refetchInterval: poll,
    enabled: tab === 'pending',
  });

  const { data: sequences = [], isLoading: seqLoading } = useQuery({
    queryKey: ['follow-up-sequences'],
    queryFn: () => followUpApi.sequences.list().then((r) => r.data),
    enabled: tab === 'sequences',
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => followUpApi.sequences.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['follow-up-sequences'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => followUpApi.sequences.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['follow-up-sequences'] }),
  });

  const cancelWarmingMutation = useMutation({
    mutationFn: (leadId: string) => warmingFlowApi.cancel(leadId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warming-flow-leads'] }),
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Follow-up</h1>
        {tab === 'sequences' && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Nova Sequência
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        {[
          { label: 'Em sequências ativas', value: stats?.active ?? 0, color: 'var(--primary)', icon: <Play size={16} /> },
          { label: 'Para enviar agora', value: stats?.pendingNow ?? 0, color: 'var(--warning)', icon: <Clock size={16} /> },
          { label: 'Aquecimento ativo', value: warmingStats?.active ?? 0, color: '#f59e0b', icon: <span style={{ fontSize: 16 }}>🔥</span> },
          { label: 'Opt-out', value: warmingStats?.optOut ?? 0, color: 'var(--danger)', icon: <span style={{ fontSize: 16 }}>🚫</span> },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color }}>{icon}</span>
            <div>
              <div className="stat-label">{label}</div>
              <div className="stat-value" style={{ color, fontSize: 22 }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[
          { key: 'pending', label: `Pendentes Manuais ${(pending as any[]).length > 0 ? `(${(pending as any[]).length})` : ''}` },
          { key: 'sequences', label: `Sequências Automáticas ${(sequences as any[]).length > 0 ? `(${(sequences as any[]).length})` : ''}` },
          { key: 'warming', label: `🔥 Aquecimento ${warmingStats?.active ? `(${warmingStats.active})` : ''}` },
        ].map(({ key, label }) => (
          <button key={key}
            onClick={() => setTab(key as any)}
            style={{
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              color: tab === key ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: tab === key ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: tab === key ? 600 : 400, fontSize: 14, marginBottom: -1,
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Aquecimento */}
      {tab === 'warming' && (
        <div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
            <h3 style={{ fontWeight: 600, marginBottom: 4, fontSize: 15 }}>🔥 Fluxo de Aquecimento</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              Leads sem nome recebem automaticamente uma pergunta de apresentação. A IA analisa a resposta e conduz o fluxo: coleta o nome → avança para WARMING, ou pergunta sobre opt-in → respeita a decisão.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Em andamento', value: warmingStats?.active ?? 0, color: 'var(--warning)', desc: 'Aguardando resposta' },
              { label: 'Concluídos', value: warmingStats?.completed ?? 0, color: 'var(--success)', desc: 'Nome coletado ou opt-in' },
              { label: 'Opt-out', value: warmingStats?.optOut ?? 0, color: 'var(--danger)', desc: 'Não quer receber mensagens' },
            ].map(({ label, value, color, desc }) => (
              <div key={label} className="stat-card">
                <div className="stat-label">{label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color, margin: '4px 0' }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</div>
              </div>
            ))}
          </div>

          {warmingLoading ? (
            <div className="loading">Carregando...</div>
          ) : (warmingLeads as any[]).length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔥</div>
              <div className="empty-state-text">Nenhum fluxo de aquecimento ativo</div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 14 }}>
                Leads em aquecimento ({(warmingLeads as any[]).length})
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Lead</th>
                    <th>Lista</th>
                    <th>Stage</th>
                    <th>Passo</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(warmingLeads as any[]).map((flow: any) => (
                    <tr key={flow.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{flow.lead?.name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem nome</span>}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{flow.lead?.phone}</div>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{flow.lead?.source}</td>
                      <td>
                        {flow.lead?.stage && <span className={`badge badge-${flow.lead.stage.toLowerCase()}`}>{flow.lead.stage}</span>}
                      </td>
                      <td>
                        <span style={{ fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px' }}>
                          {flow.step === 1 ? '📝 Perguntando nome' : '✅ Perguntando opt-in'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => { if (confirm('Cancelar fluxo de aquecimento?')) cancelWarmingMutation.mutate(flow.lead?.id); }}
                        >
                          Cancelar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Pendentes */}
      {tab === 'pending' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Leads sem resposta há mais de</span>
            <select className="form-select" style={{ width: 80 }} value={daysFilter} onChange={(e) => setDaysFilter(Number(e.target.value))}>
              {[1, 2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>{d}d</option>)}
            </select>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>com stage HOT, Quente ou Morno</span>
          </div>

          {pendingLoading ? (
            <div className="loading">Carregando...</div>
          ) : pending.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <div className="empty-state-text">Nenhum lead pendente — tudo em dia!</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(pending as PendingFollowUpLead[]).map((lead) => (
                <PendingLeadCard key={lead.id} lead={lead} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Sequências */}
      {tab === 'sequences' && (
        <div>
          {seqLoading ? (
            <div className="loading">Carregando...</div>
          ) : sequences.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔄</div>
              <div className="empty-state-text">Nenhuma sequência criada</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(sequences as FollowUpSequence[]).map((seq) => (
                <div key={seq.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 16 }}>{seq.name}</span>
                        <span style={{
                          padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                          background: seq.active ? '#1a3a2a' : 'var(--bg)',
                          color: seq.active ? 'var(--success)' : 'var(--text-muted)',
                          border: `1px solid ${seq.active ? 'var(--success)' : 'var(--border)'}`,
                        }}>
                          {seq.active ? '● Ativa' : '○ Pausada'}
                        </span>
                      </div>

                      {seq.description && (
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{seq.description}</div>
                      )}

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {seq.targetStages.map((stage) => <StageBadge key={stage} stage={stage} />)}
                        {seq.targetSources.map((s) => (
                          <span key={s} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>{s}</span>
                        ))}
                      </div>

                      {/* Steps timeline */}
                      <div style={{ display: 'flex', gap: 0, alignItems: 'center', flexWrap: 'wrap' }}>
                        {seq.steps.map((step, i) => (
                          <div key={step.id} style={{ display: 'flex', alignItems: 'center' }}>
                            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                              <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Passo {step.order}</span>
                              <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                                {step.delayDays === 0 ? 'imediato' : `+${step.delayDays}d`}
                              </span>
                            </div>
                            {i < seq.steps.length - 1 && (
                              <div style={{ width: 20, height: 1, background: 'var(--border)', margin: '0 4px' }} />
                            )}
                          </div>
                        ))}
                      </div>

                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                        {seq._count?.leadFollowUps ?? 0} leads inscritos
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginLeft: 16 }}>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 12 }}
                        onClick={() => toggleMutation.mutate(seq.id)}
                        title={seq.active ? 'Pausar' : 'Ativar'}
                      >
                        {seq.active ? <Pause size={14} /> : <Play size={14} />}
                        {seq.active ? 'Pausar' : 'Ativar'}
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '6px 10px' }}
                        onClick={() => { if (confirm('Deletar esta sequência?')) deleteMutation.mutate(seq.id); }}
                        aria-label="Deletar sequência"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showCreate && <CreateSequenceModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
