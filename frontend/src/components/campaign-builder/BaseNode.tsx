import { Handle, Position } from '@xyflow/react';
import { Users } from 'lucide-react';

interface BaseNodeProps {
  data: any;
  type: string;
  icon: any;
  title: string;
  selected?: boolean;
}

export default function BaseNode({ data, type, icon, title, selected }: BaseNodeProps) {
  // O contador virá do estado global injetado pelo Heatmap no Builder
  const count = data.executionCount || 0;

  return (
    <div className={`cb-custom-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      
      <div className="cb-node-header">
        <div className="cb-node-type-icon">{icon}</div>
        <div className="cb-node-title">{title}</div>
        
        {/* Item 4: Badge de Heatmap Pulsante */}
        {count > 0 && (
          <div className="cb-node-heatmap-badge">
            <Users size={10} />
            {count}
            <div className="cb-pulse-ring"></div>
          </div>
        )}
      </div>

      <div className="cb-node-body">
        <div className="cb-node-content">
          {data.content ? (
            <span className="truncate">{data.content}</span>
          ) : (
            <span className="cb-text-muted italic">Vazio</span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} />

      <style>{`
        .cb-node-heatmap-badge {
          margin-left: auto;
          background: var(--cb-primary);
          color: white;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 4px;
          position: relative;
          box-shadow: 0 0 10px var(--cb-primary-glow);
        }
        .cb-pulse-ring {
          position: absolute;
          width: 100%;
          height: 100%;
          border: 2px solid var(--cb-primary);
          border-radius: 10px;
          left: 0;
          top: 0;
          animation: heatmapPulse 2s infinite;
          pointer-events: none;
        }
        @keyframes heatmapPulse {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        .truncate {
          display: block;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 180px;
        }
      `}</style>
    </div>
  );
}
