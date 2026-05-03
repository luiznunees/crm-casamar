import { Handle, Position, NodeProps } from '@xyflow/react';
import type { ABTestNodeData } from '../../../types/campaign';

export default function ABTestNode({ data, selected }: NodeProps) {
  const d = data as unknown as ABTestNodeData;
  const pctA = d.percentA ?? 50;
  const pctB = 100 - pctA;
  return (
    <div className={`cb-node node-abTest ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="cb-node-header">
        <span className="icon">🧪</span>
        Teste A/B
      </div>
      <div className="cb-node-body">
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: pctA, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 6, padding: '6px 8px', textAlign: 'center', fontSize: 11 }}>
            <div style={{ color: '#818cf8', fontWeight: 700 }}>{pctA}%</div>
            <div style={{ color: '#a0a0c0', fontSize: 10 }}>{d.labelA || 'Variante A'}</div>
          </div>
          <div style={{ flex: pctB, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 6, padding: '6px 8px', textAlign: 'center', fontSize: 11 }}>
            <div style={{ color: '#fbbf24', fontWeight: 700 }}>{pctB}%</div>
            <div style={{ color: '#a0a0c0', fontSize: 10 }}>{d.labelB || 'Variante B'}</div>
          </div>
        </div>
      </div>
      <Handle type="source" id="a" position={Position.Bottom} style={{ left: '30%' }} />
      <Handle type="source" id="b" position={Position.Bottom} style={{ left: '70%' }} />
    </div>
  );
}
