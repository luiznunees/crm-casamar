import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type OnConnect,
} from '@xyflow/react';
import { Save, Rocket, ArrowLeft, Eye, Sparkles, AlertTriangle } from 'lucide-react';
import CampaignCanvas from '../components/campaign-builder/CampaignCanvas';
import CampaignSidebar from '../components/campaign-builder/CampaignSidebar';
import NodePropertiesPanel from '../components/campaign-builder/NodePropertiesPanel';
import { campaignBuilderApi } from '../api/campaigns';


import type { CampaignNodeType, CampaignType } from '../types/campaign';
import '../components/campaign-builder/campaignBuilder.css';

let nodeIdCounter = 1;
const newId = () => `node_${Date.now()}_${nodeIdCounter++}`;

/** Dados padrão para cada tipo de nó ao arrastar da sidebar */
function defaultData(type: CampaignNodeType): Record<string, unknown> {
  switch (type) {
    case 'text':      return { content: '', useAI: false };
    case 'image':     return { mediaUrl: '', caption: '' };
    case 'video':     return { mediaUrl: '', caption: '' };
    case 'audio':     return { mediaUrl: '', applyNoise: false };
    case 'delay':     return { mode: 'fixed', minSeconds: 20, maxSeconds: 60 };
    case 'poll':      return { question: '', optionA: 'Sim', optionB: 'Não' };
    case 'list':      return { title: '', items: [] };
    case 'abTest':    return { percentA: 50, labelA: 'Variante A', labelB: 'Variante B' };
    case 'condition': return { field: 'stage', operator: 'equals', value: '' };
    default:          return {};
  }
}

interface CampaignBuilderProps {
  campaignType?: CampaignType;
}

export default function CampaignBuilder({ campaignType = 'FREE' }: CampaignBuilderProps) {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const [campaignName, setCampaignName] = useState('Nova Campanha');
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  // Novo estado de configurações integradas

  const [campaignSettings, setCampaignSettings] = useState({
    targetStages: [] as string[],
    targetSources: [] as string[],
    targetOrigins: [] as string[],
    targetTags: [] as string[],
    scheduledAt: '',
    sendWindowStart: '',
    sendWindowEnd: '',
  });

  const [saved, setSaved] = useState(false);

  const [dispatching, setDispatching] = useState(false);

  // Carrega campanha existente
  useQuery({
    queryKey: ['campaign', id],
    queryFn: () => campaignBuilderApi.get(id!).then((r) => r.data),
    enabled: !!id,
    onSuccess: (campaign) => {
      setCampaignName(campaign.name);
      setNodes((campaign.nodes as unknown as Node[]) ?? []);
      setEdges((campaign.edges as unknown as Edge[]) ?? []);
      
      // Carrega configurações existentes se houver
      if (campaign.targetFilter || campaign.scheduledAt) {
        setCampaignSettings({
          targetStages: (campaign.targetStages as string[]) || [],
          targetSources: (campaign.targetSources as string[]) || [],
          targetOrigins: (campaign.targetOrigins as string[]) || [],
          targetTags: (campaign.targetTags as string[]) || [],
          scheduledAt: campaign.scheduledAt ? new Date(campaign.scheduledAt).toISOString().slice(0, 16) : '',
          sendWindowStart: campaign.sendWindowStart || '',
          sendWindowEnd: campaign.sendWindowEnd || '',
        });
      }
    },

  } as any);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: campaignName,
        type: campaignType,
        nodes: nodes as any,
        edges: edges as any,
        ...campaignSettings, // Inclui filtros e agendamento
      };

      if (id) {
        return campaignBuilderApi.update(id, payload).then((r) => r.data);
      }
      return campaignBuilderApi.create(payload).then((r) => r.data);
    },
    onSuccess: (campaign) => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      if (!id) navigate(`/campanhas/${campaign.id}/editar`, { replace: true });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  const dispatchMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('Salve primeiro');
      return campaignBuilderApi.dispatch(id).then((r) => r.data);
    },
    onSuccess: () => {
      setDispatching(true);
      navigate(`/campanhas/${id}`);
    },
  });

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onUpdateNodeData = useCallback((id: string, data: any) => {
    setNodes((nds) => nds.map((node) => (node.id === id ? { ...node, data } : node)));
  }, [setNodes]);

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  // Item 3: Validação do Fluxo
  const validationErrors = nodes.filter(n => {
    if (n.type === 'text' && !n.data.content) return true;
    if (n.type === 'image' && !n.data.mediaUrl && !n.data.base64) return true;
    return false;
  });
  // Item 4: Heatmap — Listener de Status Real-time
  useEffect(() => {
    if (!id || !dispatching) return;

    const ev = new EventSource(`/api/campaigns/${id}/status`);
    ev.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.nodeStats) {
        setNodes(nds => nds.map(node => ({
          ...node,
          data: {
            ...node.data,
            executionCount: data.nodeStats[node.id] || 0
          }
        })));
      }
    };
    return () => ev.close();
  }, [id, dispatching, setNodes]);

  const onDragOver = useCallback((e: React.DragEvent) => {

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('application/reactflow') as CampaignNodeType;
      if (!type) return;

      const wrapper = reactFlowWrapper.current;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      const position = {
        x: e.clientX - rect.left - 110,
        y: e.clientY - rect.top - 40,
      };

      const newNode: Node = {
        id: newId(),
        type,
        position,
        data: defaultData(type),
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  const onDragStart = useCallback((e: React.DragEvent, type: CampaignNodeType) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  return (
    <div className="cb-layout" ref={reactFlowWrapper}>
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="cb-toolbar">
        <button
          className="cb-toolbar-btn save"
          onClick={() => navigate('/campanhas')}
          title="Voltar"
        >
          <ArrowLeft size={14} />
        </button>

        <input
          className="cb-toolbar-name"
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          placeholder="Nome da campanha..."
          maxLength={80}
        />

        <button
          className="cb-toolbar-btn save"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          title="Salvar"
        >
          <Save size={14} className={saveMutation.isPending ? 'animate-spin' : ''} />
          {saveMutation.isPending ? 'Sincronizando…' : saved ? '✓ Atualizado' : 'Salvar Fluxo'}
        </button>

        {id && (
          <button
            className="cb-toolbar-btn save"
            onClick={() => navigate(`/campanhas/${id}`)}
            title="Preview"
          >
            <Sparkles size={14} /> Inteligência
          </button>
        )}


        <button
          className="cb-toolbar-btn dispatch"
          onClick={() => dispatchMutation.mutate()}
          disabled={!id || dispatchMutation.isPending || dispatching}
          title={!id ? 'Salve primeiro para disparar' : 'Disparar campanha'}
        >
          <Rocket size={14} />
          {dispatchMutation.isPending ? 'Disparando…' : 'Disparar'}
        </button>
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="cb-body">
        <CampaignSidebar 
          onDragStart={onDragStart} 
          campaignSettings={campaignSettings}
          setCampaignSettings={setCampaignSettings}
        />
        <CampaignCanvas

          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onDrop={onDrop}
          onDragOver={onDragOver}
        />
        <NodePropertiesPanel 
          node={selectedNode} 
          onUpdate={onUpdateNodeData}
          onClose={() => setSelectedNodeId(null)}
        />
      </div>

    </div>
  );
}
