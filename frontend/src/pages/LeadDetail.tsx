import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, MessageSquare, Edit2, Check, X } from 'lucide-react';
import { leadsApi, messagesApi, type Stage, type Message } from '../api/client';

const STAGE_LABELS: Record<Stage, string> = {
  COLD: 'Frio',
  WARMING: 'Aquecendo',
  WARM: 'Morno',
  HOT: 'Quente',
  INTERESTED: 'Interessado',
};

const SOURCES = ['Iniciada', 'Malibu', 'Amari', 'Outro'];

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [manualTemplate, setManualTemplate] = useState('');
  const [showSendModal, setShowSendModal] = useState(false);

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsApi.get(id!).then((r) => r.data),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => leadsApi.update(id!, data as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead', id] }),
  });

  const updateNameMutation = useMutation({
    mutationFn: (name: string) => leadsApi.updateName(id!, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead', id] });
      setEditingName(false);
    },
  });

  const sendManualMutation = useMutation({
    mutationFn: () => messagesApi.sendManual(id!, manualTemplate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead', id] });
      setManualTemplate('');
      setShowSendModal(false);
    },
  });

  const sendNameRequestMutation = useMutation({
    mutationFn: () => messagesApi.sendNameRequest(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead', id] }),
  });

  if (isLoading) return <div className="loading">Carregando...</div>;
  if (!lead) return <div className="loading">Lead não encontrado</div>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={() => navigate('/leads')}>
            <ArrowLeft size={16} />
          </button>
          <h1 className="page-title">{lead.name || 'Lead sem nome'}</h1>
          <span className={`badge badge-${lead.stage.toLowerCase()}`}>{STAGE_LABELS[lead.stage]}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!lead.nameCollected && (
            <button
              className="btn btn-ghost"
              onClick={() => sendNameRequestMutation.mutate()}
              disabled={sendNameRequestMutation.isPending || lead.firstMessageSent}
              title={lead.firstMessageSent ? 'Já enviou mensagem de coleta de nome' : 'Enviar mensagem para coletar nome'}
            >
              {sendNameRequestMutation.isPending ? 'Enviando...' : '📝 Coletar Nome'}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowSendModal(true)}>
            <Send size={14} /> Enviar Mensagem
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 20 }}>
        {/* Lead Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h3 style={{ fontWeight: 600, marginBottom: 16 }}>Informações</h3>

            {/* Name */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Nome</div>
              {editingName ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="form-input"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && nameInput && updateNameMutation.mutate(nameInput)}
                  />
                  <button className="btn btn-success" style={{ padding: '6px 10px' }} onClick={() => nameInput && updateNameMutation.mutate(nameInput)}>
                    <Check size={14} />
                  </button>
                  <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={() => setEditingName(false)}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 500 }}>{lead.name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Não coletado</span>}</span>
                  <button className="btn btn-ghost" style={{ padding: '2px 6px' }} onClick={() => { setNameInput(lead.name || ''); setEditingName(true); }}>
                    <Edit2 size={12} />
                  </button>
                </div>
              )}
            </div>

            <InfoRow label="Telefone" value={lead.phone} />
            <InfoRow label="Email" value={lead.email || '—'} />
            <InfoRow label="Empreendimento" value={lead.source} />
            <InfoRow label="Número WhatsApp" value={`#${lead.assignedNumber}`} />
            <InfoRow label="Contato Preferido" value={lead.preferredContact} />
            <InfoRow label="Nome Coletado" value={lead.nameCollected ? '✅ Sim' : '❌ Não'} />
            <InfoRow label="Criado em" value={new Date(lead.createdAt).toLocaleString('pt-BR')} />

            {lead.tags.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Tags</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {lead.tags.map((tag) => (
                    <span key={tag} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Stage Update */}
          <div className="card">
            <h3 style={{ fontWeight: 600, marginBottom: 12 }}>Atualizar Stage</h3>
            <select
              className="form-select"
              value={lead.stage}
              onChange={(e) => updateMutation.mutate({ stage: e.target.value })}
            >
              {Object.entries(STAGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {/* Observations */}
          <div className="card">
            <h3 style={{ fontWeight: 600, marginBottom: 12 }}>Observações</h3>
            <ObservationsEditor
              value={lead.observations || ''}
              onSave={(obs) => updateMutation.mutate({ observations: obs })}
            />
          </div>
        </div>

        {/* Messages */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquare size={16} /> Histórico de Mensagens
          </h3>
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 500, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!lead.messages?.length ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                Nenhuma mensagem ainda
              </div>
            ) : (
              lead.messages.map((msg: Message) => (
                <MessageBubble key={msg.id} message={msg} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Send Manual Message Modal */}
      {showSendModal && (
        <div className="modal-overlay" onClick={() => setShowSendModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Enviar Mensagem Manual</h2>
            {!lead.nameCollected && (
              <div style={{ background: '#3a2a1a', border: '1px solid #f59e0b', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#fbbf24' }}>
                ⚠️ Este lead ainda não tem nome coletado. A mensagem será bloqueada pelo sistema.
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Instrução / Template para a IA</label>
              <textarea
                className="form-textarea"
                style={{ minHeight: 120 }}
                placeholder="Ex: Lembrar sobre o lançamento do Malibu, destacar as condições especiais de pagamento..."
                value={manualTemplate}
                onChange={(e) => setManualTemplate(e.target.value)}
              />
            </div>
            {sendManualMutation.isError && (
              <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>
                {(sendManualMutation.error as any)?.response?.data?.error || 'Erro ao enviar'}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowSendModal(false)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => sendManualMutation.mutate()}
                disabled={!manualTemplate || sendManualMutation.isPending}
              >
                {sendManualMutation.isPending ? 'Enviando...' : <><Send size={14} /> Enviar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{label}</span>
      <span style={{ fontWeight: 500, fontSize: 13 }}>{value}</span>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isSent = message.direction === 'SENT';
  return (
    <div style={{ display: 'flex', justifyContent: isSent ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '80%',
          background: isSent ? 'var(--primary)' : 'var(--bg-hover)',
          borderRadius: isSent ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
          padding: '10px 14px',
        }}
      >
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>{message.content}</div>
        <div style={{ fontSize: 11, color: isSent ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
          {new Date(message.sentAt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

function ObservationsEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  if (!editing) {
    return (
      <div>
        <p style={{ color: value ? 'var(--text)' : 'var(--text-muted)', fontStyle: value ? 'normal' : 'italic', fontSize: 13, marginBottom: 8 }}>
          {value || 'Nenhuma observação'}
        </p>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => { setText(value); setEditing(true); }}>
          <Edit2 size={12} /> Editar
        </button>
      </div>
    );
  }

  return (
    <div>
      <textarea className="form-textarea" value={text} onChange={(e) => setText(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => { onSave(text); setEditing(false); }}>Salvar</button>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditing(false)}>Cancelar</button>
      </div>
    </div>
  );
}
