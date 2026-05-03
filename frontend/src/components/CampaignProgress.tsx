import { useState, useEffect } from 'react';
import { type CampaignStatus } from '../api/client';

interface CampaignStatusEvent {
  status: CampaignStatus;
  totalSent: number;
  totalPending: number;
  totalFailed: number;
  ts: number;
}

interface CampaignProgressProps {
  campaignId: string;
  initialStatus: CampaignStatus;
  totalLeads: number;
}

export default function CampaignProgress({ campaignId, initialStatus, totalLeads }: CampaignProgressProps) {
  const [data, setData] = useState<CampaignStatusEvent>({
    status: initialStatus,
    totalSent: 0,
    totalPending: totalLeads,
    totalFailed: 0,
    ts: Date.now(),
  });

  useEffect(() => {
    if (initialStatus !== 'RUNNING') return;

    // Conecta ao SSE
    const eventSource = new EventSource(`/api/campaigns/${campaignId}/status`);

    eventSource.addEventListener('status', (event) => {
      try {
        const payload = JSON.parse(event.data) as CampaignStatusEvent;
        setData(payload);
      } catch (err) {
        console.error('Erro ao processar evento de status', err);
      }
    });

    eventSource.addEventListener('error', (err) => {
      console.warn('Erro na conexão SSE de status', err);
      // O EventSource tentará reconectar automaticamente.
    });

    return () => {
      eventSource.close();
    };
  }, [campaignId, initialStatus]);

  const processed = data.totalSent + data.totalFailed;
  const progress = totalLeads > 0 ? Math.round((processed / totalLeads) * 100) : 0;

  return (
    <div className="card" style={{ border: data.status === 'RUNNING' ? '1.5px solid var(--primary)' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontWeight: 600, margin: 0 }}>Progresso</h3>
        {data.status === 'RUNNING' && (
          <span style={{ fontSize: 11, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="pulse-dot" /> AO VIVO
          </span>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
          <span style={{ color: 'var(--text-muted)' }}>Concluído</span>
          <span style={{ fontWeight: 700 }}>{progress}%</span>
        </div>
        <div style={{ background: 'var(--bg)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
          <div 
            style={{ 
              background: progress === 100 ? 'var(--success)' : 'var(--primary)', 
              width: `${progress}%`, 
              height: '100%', 
              transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: data.status === 'RUNNING' ? '0 0 8px var(--primary)' : 'none'
            }} 
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { label: 'Enviados', value: data.totalSent, color: 'var(--success)' },
          { label: 'Falhas', value: data.totalFailed, color: 'var(--danger)' },
          { label: 'Pendentes', value: data.totalPending, color: 'var(--text-muted)' },
          { label: 'Total', value: totalLeads, color: 'var(--text)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--bg)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontWeight: 700, color, fontSize: 16 }}>{value}</div>
          </div>
        ))}
      </div>

      {data.status === 'RUNNING' && (
        <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>
          Atualizado via Stream em tempo real
        </div>
      )}

      <style>{`
        .pulse-dot {
          width: 8px;
          height: 8px;
          background: var(--success);
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
      `}</style>
    </div>
  );
}
