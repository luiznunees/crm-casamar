import { Handle, Position, NodeProps } from '@xyflow/react';
import type { PollNodeData } from '../../../types/campaign';

export default function PollNode({ data, selected }: NodeProps) {
  const d = data as unknown as PollNodeData;
  return (
    <div className={`cb-node node-poll ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="cb-node-header">
        <span className="icon">📊</span>
        Enquete
      </div>
      <div className="cb-node-body">
        <label>Pergunta</label>
        <div style={{ fontSize: 11, color: '#e2e2ff', background: '#13131f', borderRadius: 6, padding: '6px 8px' }}>
          {d.question || 'Sem pergunta definida'}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <div style={{ flex: 1, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6, padding: '4px 8px', fontSize: 10, color: '#4ade80' }}>
            A: {d.optionA || 'Opção A'}
          </div>
          <div style={{ flex: 1, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '4px 8px', fontSize: 10, color: '#f87171' }}>
            B: {d.optionB || 'Opção B'}
          </div>
        </div>
      </div>
      <Handle type="source" id="a" position={Position.Bottom} style={{ left: '30%' }} />
      <Handle type="source" id="b" position={Position.Bottom} style={{ left: '70%' }} />
    </div>
  );
}
