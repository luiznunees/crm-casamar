import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, Send, ExternalLink, RefreshCw, Sparkles, Paperclip, Zap } from 'lucide-react';
import { inboxApi, settingsApi, type Lead, type Message, type Stage, type MediaAttachment, type QuickReply } from '../api/client';
import { STAGE_LABELS, CHIP_COLORS } from '../constants';
import { StageBadge } from '../components/StageBadge';
import { ConversationSkeleton } from '../components/Skeleton';
import { MediaUploader } from '../components/MediaUploader';
import { useDebounce } from '../hooks/useDebounce';
import { usePollingInterval } from '../hooks/usePageVisible';

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function groupByDate(messages: Message[]): { date: string; messages: Message[] }[] {
  const groups: Record<string, Message[]> = {};
  for (const msg of messages) {
    const key = new Date(msg.sentAt).toDateString();
    if (!groups[key]) groups[key] = [];
    groups[key].push(msg);
  }
  return Object.entries(groups).map(([, msgs]) => ({
    date: formatDate(msgs[0].sentAt),
    messages: msgs,
  }));
}

// ── Memoized sub-components ───────────────────────────────────────────────────

const MessageBubble = memo(function MessageBubble({ msg, personaChip }: { msg: Message; personaChip?: number }) {
  const isSent = msg.direction === 'SENT';
  return (
    <div style={{ display: 'flex', justifyContent: isSent ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
      <div style={{ maxWidth: '70%' }}>
        <div style={{
          background: isSent ? 'var(--primary)' : 'var(--bg-card)',
          border: isSent ? 'none' : '1px solid var(--border)',
          borderRadius: isSent ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          padding: '8px 12px', fontSize: 14, lineHeight: 1.5,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {msg.content}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textAlign: isSent ? 'right' : 'left', paddingInline: 4 }}>
          {formatTime(msg.sentAt)}
          {isSent && msg.fromNumber && (
            <span style={{ marginLeft: 4, color: CHIP_COLORS[msg.fromNumber] }}>● chip {msg.fromNumber}</span>
          )}
        </div>
      </div>
    </div>
  );
});

const ConversationItem = memo(function ConversationItem({
  lead, isSelected, onClick,
}: { lead: Lead; isSelected: boolean; onClick: () => void }) {
  const lastMsg = lead.messages?.[0];
  const hasUnread = (lead.unreadCount || 0) > 0;

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px', cursor: 'pointer',
        background: isSelected ? 'var(--bg-hover)' : 'transparent',
        borderBottom: '1px solid var(--border)',
        borderLeft: isSelected ? '3px solid var(--primary)' : '3px solid transparent',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: CHIP_COLORS[lead.assignedNumber] || 'var(--text-muted)' }} title={`Chip ${lead.assignedNumber}`} />
          <span style={{ fontWeight: hasUnread ? 700 : 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.name || lead.phone}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(lead.lastMessageAt || lead.updatedAt)}</span>
          {hasUnread && (
            <span style={{ background: 'var(--success)', color: 'white', borderRadius: 999, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
              {lead.unreadCount}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {lastMsg ? `${lastMsg.direction === 'SENT' ? '✓ ' : ''}${lastMsg.content}` : lead.phone}
        </span>
        <StageBadge stage={lead.stage} />
      </div>
    </div>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

export default function Inbox() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [replyText, setReplyText] = useState('');
  const [mediaAttachments, setMediaAttachments] = useState<MediaAttachment[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [chipFilter, setChipFilter] = useState<number | undefined>();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const search = useDebounce(searchInput, 300);
  const pollList = usePollingInterval(5000);
  const pollMsgs = usePollingInterval(3000);

  // Quick replies
  const { data: quickReplies = [] } = useQuery({
    queryKey: ['quick-replies'],
    queryFn: () => settingsApi.quickReplies.list().then((r) => r.data),
    staleTime: 60_000,
  });

  // Lista de conversas
  const { data: leads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ['inbox', { search, chip: chipFilter, unreadOnly }],
    queryFn: () => inboxApi.list({ search: search || undefined, chip: chipFilter, unreadOnly }).then((r) => r.data),
    refetchInterval: pollList,
  });

  // Mensagens da conversa selecionada
  const { data: messages = [], isLoading: msgsLoading } = useQuery({
    queryKey: ['inbox-messages', selectedLead?.id],
    queryFn: () => inboxApi.messages(selectedLead!.id).then((r) => r.data),
    enabled: !!selectedLead,
    refetchInterval: pollMsgs,
  });

  // Scroll para o fim em novas mensagens
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Atualiza badge ao abrir conversa
  useEffect(() => {
    if (selectedLead) qc.invalidateQueries({ queryKey: ['inbox'] });
  }, [messages.length]);

  const replyMutation = useMutation({
    mutationFn: async (text: string) => {
      // Envia texto primeiro
      if (text.trim()) await inboxApi.reply(selectedLead!.id, text);
      // Depois envia cada mídia
      for (const att of mediaAttachments) {
        await inboxApi.sendMedia(selectedLead!.id, att);
      }
    },
    onMutate: async (text) => {
      await qc.cancelQueries({ queryKey: ['inbox-messages', selectedLead?.id] });
      const optimisticMsgs: Message[] = [];
      if (text.trim()) {
        optimisticMsgs.push({
          id: `optimistic-text-${Date.now()}`,
          leadId: selectedLead!.id,
          direction: 'SENT',
          content: text,
          type: 'TEXT',
          fromNumber: selectedLead!.assignedNumber,
          sentAt: new Date().toISOString(),
        });
      }
      mediaAttachments.forEach((att, i) => {
        const contentMap: Record<string, string> = {
          audio: '[Áudio enviado]',
          image: att.caption ? `[Imagem] ${att.caption}` : '[Imagem enviada]',
          video: att.caption ? `[Vídeo] ${att.caption}` : '[Vídeo enviado]',
          document: `[Documento] ${att.fileName || 'arquivo'}`,
        };
        optimisticMsgs.push({
          id: `optimistic-media-${Date.now()}-${i}`,
          leadId: selectedLead!.id,
          direction: 'SENT',
          content: contentMap[att.type],
          type: att.type === 'audio' ? 'AUDIO' : att.type === 'image' || att.type === 'video' ? 'IMAGE' : 'TEXT',
          fromNumber: selectedLead!.assignedNumber,
          sentAt: new Date().toISOString(),
        });
      });
      qc.setQueryData(['inbox-messages', selectedLead?.id], (old: Message[] = []) => [...old, ...optimisticMsgs]);
      setReplyText('');
      setMediaAttachments([]);
      return { optimisticIds: optimisticMsgs.map((m) => m.id) };
    },
    onError: (_err, _text, ctx) => {
      qc.setQueryData(['inbox-messages', selectedLead?.id], (old: Message[] = []) =>
        old.filter((m) => !ctx?.optimisticIds.includes(m.id))
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['inbox-messages', selectedLead?.id] });
      qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });

  const handleSend = useCallback(() => {
    const text = replyText.trim();
    if (!text && mediaAttachments.length === 0) return;
    if (replyMutation.isPending) return;
    replyMutation.mutate(text);
  }, [replyText, mediaAttachments, replyMutation]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const handleSuggest = useCallback(async () => {
    if (!selectedLead || suggestLoading) return;
    setSuggestLoading(true);
    try {
      const res = await inboxApi.suggest(selectedLead.id);
      setReplyText(res.data.suggestion);
      setTimeout(() => textareaRef.current?.focus(), 50);
    } catch (err) {
      console.error('Erro ao gerar sugestão', err);
    } finally {
      setSuggestLoading(false);
    }
  }, [selectedLead, suggestLoading]);

  const totalUnread = (leads as Lead[]).reduce((sum, l) => sum + (l.unreadCount || 0), 0);
  const grouped = groupByDate(messages as Message[]);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', gap: 0, margin: '-32px', overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
      <div style={{ width: 320, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontWeight: 700, fontSize: 16 }}>
              Inbox
              {totalUnread > 0 && (
                <span style={{ marginLeft: 8, background: 'var(--danger)', color: 'white', borderRadius: 999, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                  {totalUnread}
                </span>
              )}
            </h2>
            <button className="btn btn-ghost" style={{ padding: '4px 8px' }} aria-label="Atualizar"
              onClick={() => qc.invalidateQueries({ queryKey: ['inbox'] })}>
              <RefreshCw size={13} />
            </button>
          </div>

          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="form-input" style={{ paddingLeft: 28, fontSize: 13 }} placeholder="Buscar..."
              value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`btn ${unreadOnly ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 11, padding: '3px 8px' }}
              onClick={() => setUnreadOnly((v) => !v)}>
              Não lidos
            </button>
            {[1, 2].map((chip) => (
              <button key={chip}
                className={`btn ${chipFilter === chip ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => setChipFilter(chipFilter === chip ? undefined : chip)}>
                <span style={{ color: CHIP_COLORS[chip] }}>●</span> Chip {chip}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {leadsLoading
            ? Array.from({ length: 6 }).map((_, i) => <ConversationSkeleton key={i} />)
            : leads.length === 0
              ? <div className="empty-state" style={{ padding: 40 }}><div className="empty-state-icon">💬</div><div className="empty-state-text">Nenhuma conversa</div></div>
              : (leads as Lead[]).map((lead) => (
                <ConversationItem key={lead.id} lead={lead} isSelected={selectedLead?.id === lead.id}
                  onClick={() => setSelectedLead(lead)} />
              ))
          }
        </div>
      </div>

      {/* ── Chat ── */}
      {!selectedLead ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48 }}>💬</div>
          <div style={{ fontSize: 16 }}>Selecione uma conversa</div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>
                {(selectedLead.name || selectedLead.phone)[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>
                  {selectedLead.name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem nome</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{selectedLead.phone}</span>
                  <span>·</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: CHIP_COLORS[selectedLead.assignedNumber], display: 'inline-block' }} />
                    Chip {selectedLead.assignedNumber}
                  </span>
                  <span>·</span>
                  <StageBadge stage={selectedLead.stage} />
                  <span>·</span>
                  <span>{selectedLead.source}</span>
                </div>
              </div>
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => navigate(`/leads/${selectedLead.id}`)}>
              <ExternalLink size={14} /> Ver Lead
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {msgsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 20 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: i % 2 === 0 ? 'flex-end' : 'flex-start' }}>
                    <div style={{ width: `${40 + Math.random() * 30}%`, height: 40, borderRadius: 12, background: 'var(--bg-hover)', animation: 'shimmer 1.4s infinite' }} />
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 60 }}>Nenhuma mensagem ainda</div>
            ) : (
              grouped.map(({ date, messages: dayMsgs }) => (
                <div key={date}>
                  <div style={{ textAlign: 'center', margin: '16px 0 12px' }}>
                    <span style={{ background: 'var(--bg)', padding: '2px 12px', borderRadius: 999, fontSize: 11, color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      {date}
                    </span>
                  </div>
                  {dayMsgs.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply box */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            {/* Toolbar: sugestão IA + quick replies */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, color: suggestLoading ? 'var(--text-muted)' : 'var(--primary)', borderColor: 'var(--primary)' }}
                onClick={handleSuggest}
                disabled={suggestLoading}
                aria-label="Sugerir resposta com IA"
              >
                {suggestLoading
                  ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Gerando...</>
                  : <><Sparkles size={13} /> Sugerir com IA</>
                }
              </button>

              {/* Quick Replies */}
              <div style={{ position: 'relative' }}>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => setShowQuickReplies((v) => !v)}
                  aria-label="Respostas rápidas"
                >
                  <Zap size={13} /> Rápidas
                </button>
                {showQuickReplies && (quickReplies as QuickReply[]).length > 0 && (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 8, minWidth: 240, maxWidth: 320, maxHeight: 280,
                    overflowY: 'auto', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                  }}>
                    {(quickReplies as QuickReply[]).map((qr) => (
                      <div
                        key={qr.id}
                        onClick={() => {
                          setReplyText(qr.content);
                          setShowQuickReplies(false);
                          setTimeout(() => textareaRef.current?.focus(), 50);
                        }}
                        style={{
                          padding: '10px 14px', cursor: 'pointer',
                          borderBottom: '1px solid var(--border)',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>{qr.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {qr.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Mídia anexada */}
            {mediaAttachments.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <MediaUploader attachments={mediaAttachments} onChange={setMediaAttachments} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              {/* Botão de anexar */}
              <button
                className="btn btn-ghost"
                style={{ padding: '10px', flexShrink: 0 }}
                onClick={() => {
                  // Abre o uploader adicionando um arquivo vazio para trigger
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx';
                  input.multiple = true;
                  input.onchange = async (e) => {
                    const files = (e.target as HTMLInputElement).files;
                    if (!files) return;
                    const newAtts: MediaAttachment[] = [];
                    for (const file of Array.from(files)) {
                      const base64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve((reader.result as string).split(',')[1]);
                        reader.readAsDataURL(file);
                      });
                      const type = file.type.startsWith('audio/') ? 'audio'
                        : file.type.startsWith('image/') ? 'image'
                        : file.type.startsWith('video/') ? 'video'
                        : 'document';
                      newAtts.push({ type, base64, mimetype: file.type, caption: '', fileName: file.name });
                    }
                    setMediaAttachments((prev) => [...prev, ...newAtts]);
                  };
                  input.click();
                }}
                aria-label="Anexar mídia"
                title="Anexar imagem, vídeo, áudio ou documento"
              >
                <Paperclip size={16} />
              </button>

              <textarea
                ref={textareaRef}
                className="form-textarea"
                style={{
                  flex: 1, minHeight: 44, maxHeight: 120, resize: 'none', fontSize: 14, padding: '10px 12px',
                  borderColor: replyText ? 'var(--primary)' : undefined,
                  transition: 'border-color 0.15s',
                }}
                placeholder="Digite... (Enter envia, Shift+Enter nova linha)"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                className="btn btn-primary"
                style={{ padding: '10px 16px', flexShrink: 0 }}
                onClick={handleSend}
                disabled={(!replyText.trim() && mediaAttachments.length === 0) || replyMutation.isPending}
                aria-label="Enviar mensagem"
              >
                <Send size={16} />
              </button>
            </div>

            {replyMutation.isError && (
              <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
                {(replyMutation.error as any)?.response?.data?.error || 'Erro ao enviar'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
