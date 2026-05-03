import { Handle, Position, NodeProps } from '@xyflow/react';
import type { VideoNodeData } from '../../../types/campaign';

export default function VideoNode({ data, selected }: NodeProps) {
  const d = data as unknown as VideoNodeData;
  return (
    <div className={`cb-node node-video ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="cb-node-header">
        <span className="icon">🎬</span>
        Vídeo
      </div>
      <div className="cb-node-body">
        {d.mediaUrl ? (
          <div style={{ fontSize: 11, color: '#4ade80', wordBreak: 'break-all' }}>
            ✅ {d.mediaUrl.split('/').pop()}
          </div>
        ) : (
          <div style={{ background: '#13131f', borderRadius: 6, padding: '14px', textAlign: 'center', color: '#505070', fontSize: 11 }}>
            📎 Nenhum vídeo selecionado
          </div>
        )}
        {d.caption && (
          <>
            <label>Caption</label>
            <span style={{ fontSize: 11, color: '#a0a0c0' }}>{d.caption}</span>
          </>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
