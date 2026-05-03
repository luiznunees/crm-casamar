import { ReactFlow, Background, Controls, MiniMap, Panel } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { type Node, type Edge, type OnNodesChange, type OnEdgesChange, type OnConnect } from '@xyflow/react';
import { nodeTypes } from './nodes/index';

interface CampaignCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
}

export default function CampaignCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onDrop,
  onDragOver,
}: CampaignCanvasProps) {
  return (
    <div className="cb-canvas" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#7c6af7', strokeWidth: 3 },
        }}
      >
        <Background color="rgba(124, 106, 247, 0.1)" gap={32} size={1.5} />
        <Controls 
          style={{ 
            background: 'var(--cb-panel-bg)', 
            border: '1px solid var(--cb-border)',
            borderRadius: '8px',
            overflow: 'hidden'
          }} 
        />
        <MiniMap 
          style={{ 
            background: 'var(--cb-panel-bg)', 
            border: '1px solid var(--cb-border)',
            borderRadius: '12px'
          }}
          maskColor="rgba(0,0,0,0.4)"
          nodeColor="#7c6af7"
        />
        <Panel position="top-right">
          <div style={{ 
            background: 'rgba(16, 185, 129, 0.1)', 
            border: '1px solid var(--cb-success)',
            color: 'var(--cb-success)',
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: 700,
            backdropFilter: 'blur(8px)'
          }}>
            FLUXO ATIVO
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
