import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, X } from 'lucide-react';
import { campaignsApi, tagsApi, type Campaign, type Stage, type CampaignStatus, type MediaAttachment, type Tag } from '../api/client';
import { STAGE_LABELS, CAMPAIGN_STATUS_LABELS, ORIGIN_COLORS } from '../constants';
import { StageBadge } from '../components/StageBadge';
import { StepEditor, type CampaignStep } from '../components/StepEditor';
import { useAllSources } from '../hooks/useAllSources';
import { useAllOrigins } from '../hooks/useAllOrigins';

function CreateCampaignModal({ onClose, allSources, allOrigins }: { onClose: () => void; allSources: string[]; allOrigins: string[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', targetStages: [] as Stage[], targetSources: [] as string[],
    targetOrigins: [] as string[],
    targetTags: [] as string[], targetTagsMatchAll: false,
    targetPreferredContact: [] as string[],
    scheduledAt: '',
    sendWindowStart: '', sendWindowEnd: '',
    sendWindowDays: [] as number[],
  });
  const [steps, setSteps] = useState<CampaignStep[]>([]);
  const [mediaAttachments, setMediaAttachments] = useState<MediaAttachment[]>([]);
  const [error, setError] = useState('');
  const [audience, setAudience] = useState<{ total: number; byStage: Record<string, number>; bySource: Record<string, number> } | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);

  const { data: allTags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: () => tagsApi.list().then(r => r.data),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: () => campaignsApi.create({
      ...form,
      steps: steps as any,
      scheduledAt: form.scheduledAt || undefined,
      sendWindowStart: form.sendWindowStart || undefined,
      sendWindowEnd: form.sendWindowEnd || undefined,
      sendWindowDays: form.sendWindowDays.length > 0 ? form.sendWindowDays : undefined,
      targetOrigins: form.targetOrigins.length > 0 ? form.targetOrigins : undefined,
      targetTags: form.targetTags.length > 0 ? form.targetTags : undefined,
      targetTagsMatchAll: form.targetTagsMatchAll,
      targetPreferredContact: form.targetPreferredContact.length > 0 ? form.targetPreferredContact : undefined,
    } as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); onClose(); },
    onError: (err: any) => setError(err?.response?.data?.error || 'Erro ao criar campanha'),
  });

  const toggleStage = (stage: Stage) =>
    setForm((f) => ({ ...f, targetStages: f.targetStages.includes(stage) ? f.targetStages.filter((s) => s !== stage) : [...f.targetStages, stage] }));
  const toggleSource = (source: string) =>
    setForm((f) => ({ ...f, targetSources: f.targetSources.includes(source) ? f.targetSources.filter((s) => s !== source) : [...f.targetSources, source] }));
  const toggleOrigin = (origin: string) =>
    setForm((f) => ({ ...f, targetOrigins: f.targetOrigins.includes(origin) ? f.targetOrigins.filter((o) => o !== origin) : [...f.targetOrigins, origin] }));
  const toggleTag = (tag: string) =>
    setForm((f) => ({ ...f, targetTags: f.targetTags.includes(tag) ? f.targetTags.filter((t) => t !== tag) : [...f.targetTags, tag] }));
  const toggleContact = (c: string) =>
    setForm((f) => ({ ...f, targetPreferredContact: f.targetPreferredContact.includes(c) ? f.targetPreferredContact.filter((x) => x !== c) : [...f.targetPreferredContact, c] }));
  const toggleDay = (day: number) =>
    setForm((f) => ({ ...f, sendWindowDays: f.sendWindowDays.includes(day) ? f.sendWindowDays.filter((d) => d !== day) : [...f.sendWindowDays, day] }));

  const previewAudience = async () => {
    setAudienceLoading(true);
    try {
      const res = await campaignsApi.previewAudience({
        targetStages: form.targetStages.length > 0 ? form.targetStages : undefined,
        targetSources: form.targetSources.length > 0 ? form.targetSources : undefined,
        targetTags: form.targetTags.length > 0 ? form.targetTags : undefined,
        targetPreferredContact: form.targetPreferredContact.length > 0 ? form.targetPreferredContact : undefined,
      });
      setAudience(res.data);
    } catch { setAudience(null); }
    finally { setAudienceLoading(false); }
  };

  const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const CONTACT_LABELS: Record<string, string> = { WHATSAPP: '💬 WhatsApp', AUDIO: '🎵 Áudio', CALL: '📞 Ligação' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '92vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Nova Campanha</h2>

        <div className="form-group">
          <label className="form-label">Nome *</label>
          <input className="form-input" placeholder="Ex: Lançamento Malibu — Semana 1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>

        {/* Segmentação */}
        <div className="card" style={{ marginBottom: 16, background: 'var(--bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>🎯 Segmentação</h4>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={previewAudience} disabled={audienceLoading}>
              {audienceLoading ? 'Calculando...' : '👁 Ver audiência'}
            </button>
          </div>

          {/* Audiência preview */}
          {audience && (
            <div style={{ background: audience.total > 0 ? '#1a3a2a' : '#3a1a1a', border: `1px solid ${audience.total > 0 ? 'var(--success)' : 'var(--danger)'}`, borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>
              <span style={{ color: audience.total > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                {audience.total > 0 ? `✅ ${audience.total} leads correspondem aos filtros` : '❌ Nenhum lead corresponde aos filtros'}
              </span>
              {audience.total > 0 && (
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {Object.entries(audience.byStage).map(([s, c]) => <span key={s}>{STAGE_LABELS[s as Stage]}: {c}</span>)}
                </div>
              )}
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Stages *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(Object.keys(STAGE_LABELS) as Stage[]).map((stage) => (
                <button key={stage} type="button"
                  className={`badge badge-${stage.toLowerCase()}`}
                  style={{ cursor: 'pointer', padding: '6px 12px', border: form.targetStages.includes(stage) ? '2px solid white' : '2px solid transparent' }}
                  onClick={() => toggleStage(stage)}>
                  {STAGE_LABELS[stage]}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Listas / Empreendimentos <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(vazio = todos)</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {allSources.map((source) => (
                <button key={source} type="button"
                  style={{ padding: '5px 10px', borderRadius: 6, border: form.targetSources.includes(source) ? '2px solid var(--primary)' : '2px solid var(--border)', background: form.targetSources.includes(source) ? 'var(--primary)' : 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}
                  onClick={() => toggleSource(source)}>
                  {source}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Origem <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(vazio = todas)</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {allOrigins.map((origin) => {
                const color = ORIGIN_COLORS[origin] || '#6366f1';
                const selected = form.targetOrigins.includes(origin);
                return (
                  <button key={origin} type="button" onClick={() => toggleOrigin(origin)}
                    style={{ padding: '5px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: selected ? 600 : 400,
                      border: `2px solid ${selected ? color : 'var(--border)'}`,
                      background: selected ? `${color}22` : 'transparent',
                      color: selected ? color : 'var(--text)' }}>
                    {origin}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="form-label" style={{ marginBottom: 0 }}>
                Etiquetas <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(vazio = todas)</span>
              </label>
              {form.targetTags.length > 1 && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Modo:</span>
                  <button type="button" onClick={() => setForm(f => ({ ...f, targetTagsMatchAll: false }))}
                    style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: !form.targetTagsMatchAll ? 700 : 400,
                      border: `1px solid ${!form.targetTagsMatchAll ? 'var(--primary)' : 'var(--border)'}`,
                      background: !form.targetTagsMatchAll ? 'var(--primary)' : 'transparent', color: 'var(--text)' }}>
                    OU (qualquer)
                  </button>
                  <button type="button" onClick={() => setForm(f => ({ ...f, targetTagsMatchAll: true }))}
                    style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: form.targetTagsMatchAll ? 700 : 400,
                      border: `1px solid ${form.targetTagsMatchAll ? '#10b981' : 'var(--border)'}`,
                      background: form.targetTagsMatchAll ? '#10b98122' : 'transparent', color: form.targetTagsMatchAll ? '#10b981' : 'var(--text)' }}>
                    E (todas)
                  </button>
                </div>
              )}
            </div>
            {(allTags as Tag[]).length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Nenhuma etiqueta criada ainda. Crie em Configurações → Etiquetas.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(allTags as Tag[]).map((tag) => {
                  const selected = form.targetTags.includes(tag.name);
                  return (
                    <button key={tag.id} type="button" onClick={() => toggleTag(tag.name)}
                      style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: selected ? 700 : 400,
                        background: selected ? `${tag.color}33` : 'transparent',
                        color: selected ? tag.color : 'var(--text-muted)',
                        border: `1px solid ${selected ? tag.color : 'var(--border)'}` }}>
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}
            {form.targetTags.length > 1 && (
              <div style={{ marginTop: 6, fontSize: 11, color: form.targetTagsMatchAll ? '#10b981' : 'var(--primary)' }}>
                {form.targetTagsMatchAll
                  ? `✅ Lead deve ter TODAS: ${form.targetTags.join(' + ')}`
                  : `🔀 Lead deve ter pelo menos uma: ${form.targetTags.join(' ou ')}`}
              </div>
            )}
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Contato Preferido <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(vazio = todos)</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(CONTACT_LABELS).map(([val, label]) => (
                <button key={val} type="button"
                  style={{ padding: '5px 12px', borderRadius: 6, border: form.targetPreferredContact.includes(val) ? '2px solid var(--primary)' : '2px solid var(--border)', background: form.targetPreferredContact.includes(val) ? 'var(--primary)' : 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}
                  onClick={() => toggleContact(val)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16, background: 'var(--bg)' }}>
          <h4 style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>📋 Sequência de Envio</h4>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Monte os blocos na ordem que serão enviados. Arraste para reordenar.
          </p>
          <StepEditor steps={steps} onChange={setSteps} />
        </div>

        {/* Janela de envio */}
        <div className="card" style={{ marginBottom: 16, background: 'var(--bg)' }}>
          <h4 style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>⏰ Janela de Envio</h4>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Distribui as mensagens dentro do horário configurado. O delay é calculado automaticamente.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Início</label>
              <input className="form-input" type="time" value={form.sendWindowStart} onChange={(e) => setForm((f) => ({ ...f, sendWindowStart: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Fim</label>
              <input className="form-input" type="time" value={form.sendWindowEnd} onChange={(e) => setForm((f) => ({ ...f, sendWindowEnd: e.target.value }))} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Dias da semana (vazio = todos)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {DAY_LABELS.map((label, day) => (
                <button key={day} type="button"
                  style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: form.sendWindowDays.includes(day) ? '2px solid var(--primary)' : '2px solid var(--border)', background: form.sendWindowDays.includes(day) ? 'var(--primary)' : 'transparent', color: 'var(--text)' }}
                  onClick={() => toggleDay(day)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {form.sendWindowStart && form.sendWindowEnd && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--primary)' }}>
              ℹ️ Mensagens distribuídas entre {form.sendWindowStart} e {form.sendWindowEnd}
              {form.sendWindowDays.length > 0 && ` · ${form.sendWindowDays.map((d) => DAY_LABELS[d]).join(', ')}`}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Agendar para (opcional)</label>
          <input className="form-input" type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))} />
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => mutation.mutate()}
            disabled={!form.name || !form.targetStages.length || steps.length === 0 || mutation.isPending}>
            {mutation.isPending ? 'Criando...' : 'Criar Campanha'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Campaigns() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const allSources = useAllSources();
  const allOrigins = useAllOrigins();

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => campaignsApi.list().then((r) => r.data),
  });

  const dispatchMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.dispatch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Campanhas</h1>
        <button className="btn btn-primary" onClick={() => navigate('/campanhas/nova')}>
          <Plus size={16} /> Nova Campanha
        </button>
      </div>


      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card" style={{ height: 90, background: 'var(--bg-card)', animation: 'shimmer 1.4s infinite' }} />
          ))}
        </div>
      ) : !campaigns?.length ? (
        <div className="empty-state"><div className="empty-state-icon">📣</div><div className="empty-state-text">Nenhuma campanha criada</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {campaigns.map((campaign: Campaign) => (
            <div key={campaign.id} className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/campaigns/${campaign.id}`)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 16 }}>{campaign.name}</span>
                    <span className={`badge badge-${campaign.status.toLowerCase()}`}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {campaign.targetStages.map((stage) => <StageBadge key={stage} stage={stage} />)}
                    {campaign.targetSources.map((source) => (
                      <span key={source} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>{source}</span>
                    ))}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    {campaign._count?.campaignLeads ?? 0} leads alvo
                    {campaign.scheduledAt && <span> · Agendada: {new Date(campaign.scheduledAt).toLocaleString('pt-BR')}</span>}
                    {campaign.sendWindowStart && campaign.sendWindowEnd && (
                      <span> · ⏰ {campaign.sendWindowStart}–{campaign.sendWindowEnd}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                  {(campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED') && (
                    <button className="btn btn-success" style={{ fontSize: 13 }}
                      onClick={() => { if (confirm('Disparar agora?')) dispatchMutation.mutate(campaign.id); }}
                      disabled={dispatchMutation.isPending}>
                      <Play size={14} /> Disparar
                    </button>
                  )}
                  {campaign.status === 'RUNNING' && (
                    <button className="btn btn-danger" style={{ fontSize: 13 }}
                      onClick={() => { if (confirm('Cancelar campanha?')) cancelMutation.mutate(campaign.id); }}>
                      <X size={14} /> Cancelar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}


    </div>
  );
}

