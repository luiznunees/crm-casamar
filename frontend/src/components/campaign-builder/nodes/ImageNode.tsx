import { Handle, Position, NodeProps } from '@xyflow/react';
import type { ImageNodeData } from '../../../types/campaign';

export default function ImageNode({ data, selected }: NodeProps) {
  const d = data as unknown as ImageNodeData;
  return (
    <div className={`cb-node node-image ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="cb-node-header">
        <span className="icon">🖼️</span>
        Imagem
      </div>
      <div className="cb-node-body">
        {d.mediaUrl ? (
          <img
            src={d.mediaUrl}
            alt="preview"
            style={{ width: '100%', borderRadius: 6, maxHeight: 80, objectFit: 'cover' }}
          />
        ) : (
          <div style={{ background: '#13131f', borderRadius: 6, padding: '14px', textAlign: 'center', color: '#505070', fontSize: 11 }}>
            📎 Nenhuma imagem selecionada
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
