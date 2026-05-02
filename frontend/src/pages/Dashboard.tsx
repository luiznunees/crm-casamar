import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wifi, WifiOff, RefreshCw, QrCode, X } from 'lucide-react';
import { leadsApi, whatsappApi, type LeadStats } from '../api/client';
import { STAGE_LABELS, STAGE_COLORS } from '../constants';
import { usePollingInterval } from '../hooks/usePageVisible';
import { StatCardSkeleton } from '../components/Skeleton';

// ── QR Code Modal ─────────────────────────────────────────────────────────────

function QRCodeModal({ chip, onClose }: { chip: number; onClose: () => void }) {
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['whatsapp-qrcode', chip],
    queryFn: () => whatsappApi.qrcode(chip).then(r => r.data),
    refetchInterval: 20_000, // atualiza a cada 20s (QR expira)
    staleTime: 0,
  });

  const restartMutation = useMutation({
    mutationFn: () => whatsappApi.restart(chip),
    onSuccess: () => {
      setTimeout(() => {
        refetch();
        qc.invalidateQueries({ queryKey: ['whatsapp-status'] });
      }, 2000);
    },
  });

  const hasQR = data?.base64 || data?.qrcode;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 className="modal-title" style={{ margin: 0 }}>Conectar Chip {chip}</h2>
          <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={onClose}><X size={16} /></button>
        </div>

        {isLoading ? (
          <div style={{ padding: 40, color: 'var(--text-muted)' }}>Gerando QR Code...</div>
        ) : hasQR ? (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo → Escaneie o QR code
            </p>
            {data?.base64 ? (
              <img
                src={`data:image/png;base64,${data.base64.replace(/^data:image\/\w+;base64,/, '')}`}
                alt="QR Code WhatsApp"
                style={{ width: 260, height: 260, borderRadius: 8, border: '4px solid white', margin: '0 auto', display: 'block' }}
              />
            ) : (
              <div style={{ background: 'white', padding: 16, borderRadius: 8, display: 'inline-block', margin: '0 auto' }}>
                <code style={{ fontSize: 10, wordBreak: 'break-all', color: '#000' }}>{data?.qrcode}</code>
              </div>
            )}
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw size={13} /> {isFetching ? 'Atualizando...' : 'Atualizar QR'}
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>QR expira em ~60s — atualiza automaticamente</p>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Não foi possível gerar o QR code. Tente desconectar e reconectar o chip.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => restartMutation.mutate()}
              disabled={restartMutation.isPending}
            >
              <RefreshCw size={14} /> {restartMutation.isPending ? 'Desconectando...' : 'Desconectar e gerar novo QR'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chip Status Card ──────────────────────────────────────────────────────────

function ChipCard({ chip, status }: { chip: number; status: any }) {
  const [showQR, setShowQR] = useState(false);
  const qc = useQueryClient();

  const restartMutation = useMutation({
    mutationFn: () => whatsappApi.restart(chip),
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: ['whatsapp-status'] }), 2000);
      setShowQR(true);
    },
  });

  const connected = status?.connected;
  const chipColors = { 1: '#6366f1', 2: '#f59e0b' };
  const color = chipColors[chip as 1 | 2];

  return (
    <>
      <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: connected ? '#1a3a2a' : '#3a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {connected
            ? <Wifi size={18} color="var(--success)" />
            : <WifiOff size={18} color="var(--danger)" />
          }
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Chip {chip}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{status?.instance}</span>
          </div>
          <div style={{ fontSize: 12, marginTop: 2, color: connected ? 'var(--success)' : 'var(--danger)', fontWeight: 500 }}>
            {connected ? '● Conectado' : status ? '○ Desconectado' : 'Verificando...'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!connected && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '4px 10px', color: 'var(--primary)', borderColor: 'var(--primary)' }}
              onClick={() => setShowQR(true)}
              title="Escanear QR Code"
            >
              <QrCode size={13} /> Conectar
            </button>
          )}
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: '4px 8px' }}
            onClick={() => restartMutation.mutate()}
            disabled={restartMutation.isPending}
            title="Reconectar"
          >
            <RefreshCw size={13} style={{ animation: restartMutation.isPending ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {showQR && <QRCodeModal chip={chip} onClose={() => setShowQR(false)} />}
    </>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const pollStats = usePollingInterval(30_000);
  const pollWA = usePollingInterval(15_000);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['lead-stats'],
    queryFn: () => leadsApi.stats().then(r => r.data),
    refetchInterval: pollStats,
  });

  const { data: whatsappStatus } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: () => whatsappApi.status().then(r => r.data),
    refetchInterval: pollWA,
  });

  const s = stats as LeadStats | undefined;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      {/* WhatsApp Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
        {[1, 2].map(chip => (
          <ChipCard
            key={chip}
            chip={chip}
            status={(whatsappStatus as any)?.[`number${chip}`]}
          />
        ))}
      </div>

      {/* Lead Stats */}
      <div className="stat-grid">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <div className="stat-card">
              <div className="stat-label">Total de Leads</div>
              <div className="stat-value">{s?.total ?? 0}</div>
            </div>
            {(Object.keys(STAGE_LABELS) as Array<keyof typeof STAGE_LABELS>).map(stage => (
              <div key={stage} className="stat-card">
                <div className="stat-label">{STAGE_LABELS[stage]}</div>
                <div className="stat-value" style={{ color: STAGE_COLORS[stage] }}>
                  {s?.byStage?.[stage] ?? 0}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* By Source */}
      {s?.bySource && Object.keys(s.bySource).length > 0 && (
        <div className="card" style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Leads por Lista / Empreendimento</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(s.bySource)
              .sort(([, a], [, b]) => b - a)
              .map(([source, count]) => {
                const pct = s.total > 0 ? Math.round((count / s.total) * 100) : 0;
                return (
                  <div key={source}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 500 }}>{source}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{count} ({pct}%)</span>
                    </div>
                    <div style={{ background: 'var(--bg)', borderRadius: 4, height: 6 }}>
                      <div style={{ background: 'var(--primary)', width: `${pct}%`, height: '100%', borderRadius: 4, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
