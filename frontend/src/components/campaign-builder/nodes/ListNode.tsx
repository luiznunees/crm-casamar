import { Handle, Position, NodeProps } from '@xyflow/react';
import type { ListNodeData } from '../../../types/campaign';

export default function ListNode({ data, selected }: NodeProps) {
  const d = data as unknown as ListNodeData;
  return (
    <div className={`cb-node node-list ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="cb-node-header">
        <span className="icon">📋</span>
        Lista
      </div>
      <div className="cb-node-body">
        <label>Título</label>
        <div style={{ fontSize: 11, color: '#e2e2ff' }}>{d.title || 'Sem título'}</div>
        <label>Itens ({d.items?.length ?? 0})</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {(d.items || []).slice(0, 3).map((item, i) => (
            <div key={i} style={{ fontSize: 10, color: '#a0a0c0', background: '#13131f', borderRadius: 4, padding: '3px 6px' }}>
              {i + 1}. {item}
            </div>
          ))}
          {(d.items?.length ?? 0) > 3 && (
            <div style={{ fontSize: 10, color: '#505070' }}>+{d.items.length - 3} mais...</div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
