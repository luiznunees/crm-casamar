import { useRef, useState } from 'react';
import { Paperclip, X, Music, Image, Video, FileText } from 'lucide-react';
import type { MediaAttachment } from '../api/client';

interface Props {
  attachments: MediaAttachment[];
  onChange: (attachments: MediaAttachment[]) => void;
  maxFiles?: number;
}

const ACCEPT = 'image/*,video/*,audio/*,.pdf,.doc,.docx';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  audio:    <Music size={14} />,
  image:    <Image size={14} />,
  video:    <Video size={14} />,
  document: <FileText size={14} />,
};

function getMediaType(mime: string): MediaAttachment['type'] {
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

import { uploadApi } from '../api/client';

export function MediaUploader({ attachments, onChange, maxFiles = 5 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLoading(true);

    const newAttachments: MediaAttachment[] = [];

    try {
      for (const file of Array.from(files)) {
        if (attachments.length + newAttachments.length >= maxFiles) break;

        // Faz o upload real do arquivo para o S3 via backend
        const { url } = await uploadApi.uploadMedia(file);

        newAttachments.push({
          type: getMediaType(file.type),
          mediaUrl: url,
          mimetype: file.type,
          caption: '',
          fileName: file.name,
        });
      }
      onChange([...attachments, ...newAttachments]);
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      // Evento global para ser tratado pelo App/Toast
      window.dispatchEvent(new CustomEvent('api-error-500'));
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = (index: number) => {
    onChange(attachments.filter((_, i) => i !== index));
  };

  const updateCaption = (index: number, caption: string) => {
    onChange(attachments.map((a, i) => i === index ? { ...a, caption } : a));
  };

  return (
    <div>
      {/* Botão de adicionar */}
      {attachments.length < maxFiles && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: 12, marginBottom: attachments.length > 0 ? 10 : 0 }}
          onClick={() => inputRef.current?.click()}
          disabled={loading}
        >
          <Paperclip size={13} />
          {loading ? 'Carregando...' : 'Anexar mídia'}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Lista de anexos */}
      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {attachments.map((att, i) => (
            <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: att.type !== 'audio' && att.type !== 'document' ? 6 : 0 }}>
                <span style={{ color: 'var(--primary)' }}>{TYPE_ICONS[att.type]}</span>
                <span style={{ fontSize: 12, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {att.fileName}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {att.type.toUpperCase()}
                </span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
                  aria-label="Remover anexo"
                >
                  <X size={13} />
                </button>
              </div>
              {/* Caption para imagem e vídeo */}
              {(att.type === 'image' || att.type === 'video') && (
                <input
                  className="form-input"
                  style={{ fontSize: 12, padding: '4px 8px' }}
                  placeholder="Legenda (opcional)"
                  value={att.caption || ''}
                  onChange={(e) => updateCaption(i, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
