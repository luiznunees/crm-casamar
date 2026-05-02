import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Play, X, FlaskConical, Check } from 'lucide-react';
import { campaignsApi, campaignTestApi, leadsApi, type Stage, type CampaignStatus, type Lead } from '../api/client';
import { STAGE_LABELS, CAMPAIGN_STATUS_LABELS } from '../constants';
import { StageBadge } from '../components/StageBadge';
import { usePollingInterval } from '../hooks/usePageVisible';

const LEAD_STATUS_COLORS: Record<string, string> = {
  PENDING: '#94a3b8', SENT: '#22c55e', FAILED: '#ef4444', SKIPPED: '#f59e0b',
};

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showTestModal, setShowTestModal] = useState(false);

  const { data: campaign, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => campaignsApi.get(id!).then((r) => r.data),
    enabled: !!id,
    // Só faz polling quando campanha está rodando
    refetchInterval: (query) => {
      const status = (query.state.data as any)?.status;
      return status === 'RUNNING' ? usePollingInterval(5000) : false;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['campaign-stats', id],
    queryFn: () => campaignsApi.stats(id!).then((r) => r.data),
    enabled: !!id,
    refetchInterval: campaign?.status === 'RUNNING' ? 5000 : false,
  });

  const dispatchMutation = useMutation({
    mutationFn: () => campaignsApi.dispatch(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', id] }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => campaignsApi.cancel(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', id] }),
  });

  if (isLoading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card" style={{ height: 120, animation: 'shimmer 1.4s infinite' }} />
      ))}
    </div>
  );
  if (!campaign) return <div className="loading">Campanha não encontrada</div>;

  const totalLeads = campaign.campaignLeads?.length ?? 0;
  const sent = stats?.SENT ?? 0;
  const failed = stats?.FAILED ?? 0;
  const pending = stats?.PENDING ?? 0;
  const skipped = stats?.SKIPPED ?? 0;
  const processed = sent + failed + skipped;
  const progress = totalLeads > 0 ? Math.round((processed / totalLeads) * 100) : 0;

  return (
    <>
      <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={() => navigate('/campaigns')}><ArrowLeft size={16} /></button>
          <h1 className="page-title">{campaign.name}</h1>
          <span className={`badge badge-${campaign.status.toLowerCase()}`}>{CAMPAIGN_STATUS_LABELS[campaign.status as CampaignStatus]}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED') && (
            <>
              <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setShowTestModal(true)}>
                <FlaskConical size={14} /> Testar
              </button>
              <button className="btn btn-success" onClick={() => { if (confirm('Disparar agora?')) dispatchMutation.mutate(); }} disabled={dispatchMutation.isPending}>
                <Play size={14} /> Disparar Agora
              </button>
            </>
          )}
          {campaign.status === 'RUNNING' && (
            <button className="btn btn-danger" onClick={() => { if (confirm('Cancelar?')) cancelMutation.mutate(); }}>
              <X size={14} /> Cancelar
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Detalhes */}
          <div className="card">
            <h3 style={{ fontWeight: 600, marginBottom: 16 }}>Detalhes</h3>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Stages Alvo</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {campaign.targetStages.map((stage: Stage) => <StageBadge key={stage} stage={stage} />)}
              </div>
            </div>
            {campaign.targetSources.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Empreendimentos</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {campaign.targetSources.map((s: string) => (
                    <span key={s} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>{s}</span>
                  ))}
                </div>
              </div>
            )}
            {campaign.scheduledAt && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Agendada para</div>
                <div style={{ fontWeight: 500 }}>{new Date(campaign.scheduledAt).toLocaleString('pt-BR')}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Template</div>
              <div style={{ background: 'var(--bg)', borderRadius: 6, padding: 10, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{campaign.messageTemplate}</div>
            </div>
          </div>

          {/* Progresso */}
          <div className="card">
            <h3 style={{ fontWeight: 600, marginBottom: 16 }}>Progresso {campaign.status === 'RUNNING' && <span style={{ fontSize: 11, color: 'var(--success)', marginLeft: 6 }}>● ao vivo</span>}</h3>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>Progresso</span>
                <span style={{ fontWeight: 600 }}>{progress}%</span>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 4, height: 8 }}>
                <div style={{ background: progress === 100 ? 'var(--success)' : 'var(--primary)', width: `${progress}%`, height: '100%', borderRadius: 4, transition: 'width 0.5s' }} />
              </div>
            </div>
            {[
              { label: 'Total', value: totalLeads, color: 'var(--text)' },
              { label: 'Enviados', value: sent, color: 'var(--success)' },
              { label: 'Pendentes', value: pending, color: 'var(--text-muted)' },
              { label: 'Falhas', value: failed, color: 'var(--danger)' },
              { label: 'Pulados', value: skipped, color: 'var(--warning)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{label}</span>
                <span style={{ fontWeight: 600, color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Leads */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
            Leads da Campanha ({totalLeads})
          </div>
          {!campaign.campaignLeads?.length ? (
            <div className="empty-state"><div className="empty-state-text">Nenhum lead associado ainda</div></div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Lead</th><th>Telefone</th><th>Stage</th><th>Status</th><th>Enviado em</th></tr>
              </thead>
              <tbody>
                {campaign.campaignLeads.map((cl: any) => (
                  <tr key={cl.id}>
                    <td style={{ fontWeight: 500 }}>{cl.lead.name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem nome</span>}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{cl.lead.phone}</td>
                    <td><StageBadge stage={cl.lead.stage as Stage} /></td>
                    <td><span style={{ color: LEAD_STATUS_COLORS[cl.status] || 'var(--text-muted)', fontWeight: 600, fontSize: 12 }}>{cl.status}</span></td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{cl.sentAt ? new Date(cl.sentAt).toLocaleString('pt-BR') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>

    {showTestModal && <TestModal campaignId={id!} onClose={() => setShowTestModal(false)} />}
    </>
  );
}

function TestModal({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: leadsData } = useQuery({
    queryKey: ['leads-for-test'],
    queryFn: () => leadsApi.list({ limit: 50 }).then((r) => r.data),
  });

  const toggle = (id: string) =>
    setSelectedIds((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length < 5 ? [...s, id] : s);

  const runTest = async () => {
    if (!selectedIds.length) return;
    setLoading(true);
    try {
      const res = await campaignTestApi.test(campaignId, selectedIds);
      setResults((res.data as any).results);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao testar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">🧪 Modo de Teste</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Selecione até 5 leads para receber a mensagem de teste antes do disparo completo.
        </p>

        {!results ? (
          <>
            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16 }}>
              {leadsData?.leads.map((lead: Lead) => (
                <div key={lead.id}
                  onClick={() => toggle(lead.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    cursor: 'pointer', borderBottom: '1px solid var(--border)',
                    background: selectedIds.includes(lead.id) ? 'rgba(99,102,241,0.1)' : 'transparent',
                  }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 4, border: `2px solid ${selectedIds.includes(lead.id) ? 'var(--primary)' : 'var(--border)'}`,
                    background: selectedIds.includes(lead.id) ? 'var(--primary)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {selectedIds.includes(lead.id) && <Check size={11} color="white" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{lead.name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem nome</span>}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lead.phone} · {lead.source}</div>
                  </div>
                  <StageBadge stage={lead.stage} />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              {selectedIds.length}/5 leads selecionados
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              <button className="btn btn-primary" onClick={runTest} disabled={!selectedIds.length || loading}>
                <FlaskConical size={14} /> {loading ? 'Enviando...' : 'Enviar Teste'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {results.map((r: any) => {
                const lead = leadsData?.leads.find((l: Lead) => l.id === r.leadId);
                return (
                  <div key={r.leadId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg)', borderRadius: 8 }}>
                    <span style={{ fontSize: 16 }}>{r.success ? '✅' : r.skipped ? '⏭️' : '❌'}</span>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{lead?.name || lead?.phone}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.success ? 'Enviado com sucesso' : r.reason}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setResults(null)}>← Testar novamente</button>
              <button className="btn btn-primary" onClick={onClose}>Fechar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
