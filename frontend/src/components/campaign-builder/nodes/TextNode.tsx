import { Handle, Position, NodeProps } from '@xyflow/react';
import type { TextNodeData } from '../../../types/campaign';

export default function TextNode({ data, selected }: NodeProps) {
  const d = data as unknown as TextNodeData;
  return (
    <div className={`cb-node node-text ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="cb-node-header">
        <span className="icon">💬</span>
        Texto
      </div>
      <div className="cb-node-body">
        <label>Mensagem</label>
        <textarea
          defaultValue={d.content || ''}
          rows={3}
          placeholder="Digite a mensagem ou instrução para a IA..."
          readOnly
        />
        {d.useAI && (
          <span style={{ fontSize: 10, color: '#7c6af7', marginTop: 4, display: 'block' }}>
            🤖 IA vai variar esta mensagem
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
