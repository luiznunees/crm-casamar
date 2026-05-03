import { Handle, Position, NodeProps } from '@xyflow/react';
import type { ConditionNodeData } from '../../../types/campaign';

const fieldLabels: Record<string, string> = {
  stage: 'Stage',
  engagementScore: 'Score',
  tags: 'Tags',
  origin: 'Origem',
};

const operatorLabels: Record<string, string> = {
  equals: '=',
  greaterThan: '>',
  contains: 'contém',
};

export default function ConditionNode({ data, selected }: NodeProps) {
  const d = data as unknown as ConditionNodeData;
  return (
    <div className={`cb-node node-condition ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="cb-node-header">
        <span className="icon">🔀</span>
        Condição
      </div>
      <div className="cb-node-body">
        <div style={{
          background: '#13131f', borderRadius: 6, padding: '8px 10px',
          fontSize: 12, color: '#e2e2ff', textAlign: 'center',
          border: '1px solid #313147',
        }}>
          <span style={{ color: '#f472b6' }}>{fieldLabels[d.field] ?? d.field}</span>
          {' '}
          <span style={{ color: '#7070a0' }}>{operatorLabels[d.operator] ?? d.operator}</span>
          {' '}
          <span style={{ color: '#e2e2ff' }}>"{d.value}"</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 10, color: '#4ade80' }}>✓ Verdadeiro</span>
          <span style={{ fontSize: 10, color: '#f87171' }}>✗ Falso</span>
        </div>
      </div>
      <Handle type="source" id="true" position={Position.Bottom} style={{ left: '30%' }} />
      <Handle type="source" id="false" position={Position.Bottom} style={{ left: '70%' }} />
    </div>
  );
}
