import { Handle, Position, NodeProps } from '@xyflow/react';
import type { DelayNodeData } from '../../../types/campaign';

export default function DelayNode({ data, selected }: NodeProps) {
  const d = data as unknown as DelayNodeData;
  return (
    <div className={`cb-node node-delay ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="cb-node-header">
        <span className="icon">⏱️</span>
        Delay
      </div>
      <div className="cb-node-body">
        {d.mode === 'ai' ? (
          <span style={{ fontSize: 11, color: '#c084fc' }}>
            🤖 IA vai sugerir o delay ideal para este lead
          </span>
        ) : (
          <span style={{ fontSize: 11, color: '#a0a0c0' }}>
            ⏳ {d.minSeconds ?? 20}s — {d.maxSeconds ?? 60}s (aleatório)
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
