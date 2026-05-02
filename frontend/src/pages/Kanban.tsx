import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { leadsApi, type Lead, type Stage } from '../api/client';
import { STAGE_LABELS, STAGE_COLORS } from '../constants';
import { usePollingInterval } from '../hooks/usePageVisible';

const STAGES: Stage[] = ['COLD', 'WARMING', 'WARM', 'HOT', 'INTERESTED'];

function LeadCard({ lead, onDragStart }: { lead: Lead; onDragStart: (e: React.DragEvent, lead: Lead) => void }) {
  const navigate = useNavigate();
  const daysSince = lead.lastMessageAt
    ? Math.floor((Date.now() - new Date(lead.lastMessageAt).getTime()) / 86400000)
    : null;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      onClick={() => navigate(`/leads/${lead.id}`)}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'grab',
        transition: 'box-shadow 0.15s, transform 0.15s',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLDivElement).style.transform = 'none';
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lead.name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 400 }}>Sem nome</span>}
        </div>
        {lead.unreadCount > 0 && (
          <span style={{ background: 'var(--success)', color: 'white', borderRadius: 999, padding: '1px 5px', fontSize: 10, fontWeight: 700, flexShrink: 0, marginLeft: 4 }}>
            {lead.unreadCount}
          </span>
        )}
      </div>

      {/* Phone */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{lead.phone}</div>

      {/* Source */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>
          {lead.source}
        </span>
        {daysSince !== null && (
          <span style={{ fontSize: 10, color: daysSince >= 7 ? 'var(--danger)' : daysSince >= 3 ? 'var(--warning)' : 'var(--text-muted)' }}>
            {daysSince === 0 ? 'hoje' : `${daysSince}d`}
          </span>
        )}
      </div>

      {/* Tags */}
      {lead.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 6 }}>
          {lead.tags.slice(0, 3).map((tag) => (
            <span key={tag} style={{ fontSize: 10, background: 'var(--bg-hover)', borderRadius: 3, padding: '1px 5px', color: 'var(--text-muted)' }}>
              {tag}
            </span>
          ))}
          {lead.tags.length > 3 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{lead.tags.length - 3}</span>}
        </div>
      )}

      {/* Chip indicator */}
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: lead.assignedNumber === 1 ? '#6366f1' : '#f59e0b', display: 'inline-block' }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>chip {lead.assignedNumber}</span>
      </div>
    </div>
  );
}

function KanbanColumn({
  stage, leads, onDrop, onDragOver, onDragLeave, isDragOver,
}: {
  stage: Stage;
  leads: Lead[];
  onDrop: (e: React.DragEvent, stage: Stage) => void;
  onDragOver: (e: React.DragEvent, stage: Stage) => void;
  onDragLeave: () => void;
  isDragOver: boolean;
}) {
  const [dragLead, setDragLead] = useState<Lead | null>(null);

  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    e.dataTransfer.setData('leadId', lead.id);
    e.dataTransfer.setData('fromStage', lead.stage);
    setDragLead(lead);
  };

  return (
    <div
      style={{
        flex: '0 0 220px',
        display: 'flex',
        flexDirection: 'column',
        background: isDragOver ? 'rgba(99,102,241,0.08)' : 'var(--bg)',
        border: `2px solid ${isDragOver ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 10,
        transition: 'all 0.15s',
        minHeight: 400,
      }}
      onDrop={(e) => onDrop(e, stage)}
      onDragOver={(e) => onDragOver(e, stage)}
      onDragLeave={onDragLeave}
    >
      {/* Column header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: STAGE_COLORS[stage], display: 'inline-block' }} />
            <span style={{ fontWeight: 600, fontSize: 13 }}>{STAGE_LABELS[stage]}</span>
          </div>
          <span style={{ background: 'var(--bg-hover)', borderRadius: 999, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>
            {leads.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div style={{ flex: 1, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        {leads.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '20px 0', opacity: 0.5 }}>
            Arraste leads aqui
          </div>
        )}
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onDragStart={handleDragStart} />
        ))}
      </div>
    </div>
  );
}

export default function Kanban() {
  const qc = useQueryClient();
  const poll = usePollingInterval(30_000);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);
  const [sourceFilter, setSourceFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['leads-kanban', sourceFilter],
    queryFn: () => leadsApi.list({ limit: 200, source: sourceFilter || undefined }).then((r) => r.data),
    refetchInterval: poll,
  });

  const moveMutation = useMutation({
    mutationFn: ({ leadId, stage }: { leadId: string; stage: Stage }) =>
      leadsApi.update(leadId, { stage }),
    onMutate: async ({ leadId, stage }) => {
      await qc.cancelQueries({ queryKey: ['leads-kanban'] });
      const prev = qc.getQueryData(['leads-kanban', sourceFilter]);
      qc.setQueryData(['leads-kanban', sourceFilter], (old: any) => ({
        ...old,
        leads: old?.leads?.map((l: Lead) => l.id === leadId ? { ...l, stage } : l) ?? [],
      }));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['leads-kanban', sourceFilter], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['leads-kanban'] }),
  });

  const handleDrop = (e: React.DragEvent, targetStage: Stage) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('leadId');
    const fromStage = e.dataTransfer.getData('fromStage') as Stage;
    setDragOverStage(null);
    if (leadId && fromStage !== targetStage) {
      moveMutation.mutate({ leadId, stage: targetStage });
    }
  };

  const handleDragOver = (e: React.DragEvent, stage: Stage) => {
    e.preventDefault();
    setDragOverStage(stage);
  };

  const leads = data?.leads ?? [];

  // Group by stage
  const byStage = STAGES.reduce((acc, stage) => {
    acc[stage] = leads.filter((l) => l.stage === stage);
    return acc;
  }, {} as Record<Stage, Lead[]>);

  const sources = [...new Set(leads.map((l) => l.source))].sort();

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Kanban</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select className="form-select" style={{ width: 160 }} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="">Todos os empreendimentos</option>
            {sources.map((s) => <option key={s}>{s}</option>)}
          </select>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{leads.length} leads</span>
        </div>
      </div>

      {isLoading ? (
        <div className="loading">Carregando...</div>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16, alignItems: 'flex-start' }}>
          {STAGES.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              leads={byStage[stage]}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={() => setDragOverStage(null)}
              isDragOver={dragOverStage === stage}
            />
          ))}
        </div>
      )}
    </div>
  );
}
