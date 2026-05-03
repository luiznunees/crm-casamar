import { Handle, Position, NodeProps } from '@xyflow/react';
import type { AudioNodeData } from '../../../types/campaign';

export default function AudioNode({ data, selected }: NodeProps) {
  const d = data as unknown as AudioNodeData;
  return (
    <div className={`cb-node node-audio ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="cb-node-header">
        <span className="icon">🎵</span>
        Áudio
      </div>
      <div className="cb-node-body">
        {d.mediaUrl ? (
          <div style={{ fontSize: 11, color: '#4ade80' }}>
            ✅ {d.mediaUrl.split('/').pop()}
          </div>
        ) : (
          <div style={{ background: '#13131f', borderRadius: 6, padding: '14px', textAlign: 'center', color: '#505070', fontSize: 11 }}>
            🎤 Nenhum áudio selecionado
          </div>
        )}
        {d.applyNoise && (
          <span style={{ fontSize: 10, color: '#fb923c', marginTop: 4, display: 'block' }}>
            🔇 Ruído PCM ativado (anti-fingerprint)
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
