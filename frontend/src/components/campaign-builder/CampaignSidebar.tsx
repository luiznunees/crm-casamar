import { useState } from 'react';
import { 
  Type, Image, Video, Music, Clock, 
  ListChecks, Layers, Split, Filter, 
  Settings, Target, Calendar, Users, Loader2
} from 'lucide-react';
import { type CampaignNodeType } from '../../types/campaign';
import { useQuery } from '@tanstack/react-query';
import { campaignsApi } from '../../api/client';
import { useAllSources } from '../../hooks/useAllSources';
import { useAllOrigins } from '../../hooks/useAllOrigins';


interface CampaignSidebarProps {
  onDragStart: (e: React.DragEvent, type: CampaignNodeType) => void;
  // Novos props para integrar segmentação
  campaignSettings: any;
  setCampaignSettings: (settings: any) => void;
}

export default function CampaignSidebar({ onDragStart, campaignSettings, setCampaignSettings }: CampaignSidebarProps) {
  const [activeTab, setActiveTab] = useState<'nodes' | 'settings'>('nodes');
  const allSources = useAllSources();
  const allOrigins = useAllOrigins();

  // Item 1: Audience Preview Dinâmico
  const { data: audience, isLoading: audienceLoading } = useQuery({
    queryKey: ['audience-preview', campaignSettings],
    queryFn: () => campaignsApi.previewAudience({
      targetStages: campaignSettings.targetStages,
      targetSources: campaignSettings.targetSources,
      targetOrigins: campaignSettings.targetOrigins,
    }).then(r => r.data),
    staleTime: 5000,
  });


  const nodeTypes: { type: CampaignNodeType; icon: any; label: string; desc: string }[] = [
    { type: 'text', icon: <Type size={18} />, label: 'Texto', desc: 'Mensagem simples ou com IA' },
    { type: 'image', icon: <Image size={18} />, label: 'Imagem', desc: 'Foto com legenda' },
    { type: 'video', icon: <Video size={18} />, label: 'Vídeo', desc: 'Vídeo curto' },
    { type: 'audio', icon: <Music size={18} />, label: 'Áudio', desc: 'Grave ou envie PTT' },
    { type: 'delay', icon: <Clock size={18} />, label: 'Delay', desc: 'Pausa entre blocos' },
    { type: 'poll', icon: <ListChecks size={18} />, label: 'Enquete', desc: 'Pergunta com opções' },
    { type: 'list', icon: <Layers size={18} />, label: 'Lista', desc: 'Menu de opções' },
    { type: 'abTest', icon: <Split size={18} />, label: 'Teste A/B', desc: 'Divide audiência' },
    { type: 'condition', icon: <Filter size={18} />, label: 'Condição', desc: 'Se stage = Quente...' },
  ];

  return (
    <div className="cb-sidebar">
      <div className="cb-sidebar-tabs">
        <button 
          className={`cb-sidebar-tab ${activeTab === 'nodes' ? 'active' : ''}`}
          onClick={() => setActiveTab('nodes')}
        >
          <Plus size={14} /> Blocos
        </button>
        <button 
          className={`cb-sidebar-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings size={14} /> Ajustes
        </button>
      </div>

      <div className="cb-sidebar-content">
        {/* Item 1: Contador Global de Audiência */}
        <div className="cb-audience-counter">
          <div className="cb-audience-info">
            <Users size={14} />
            <span>Audiência Estimada</span>
          </div>
          <div className="cb-audience-value">
            {audienceLoading ? <Loader2 className="animate-spin" size={16} /> : (audience?.total || 0)}
            <small>leads</small>
          </div>
        </div>

        {activeTab === 'nodes' ? (

          <div className="cb-nodes-list">
            <p className="cb-section-title">Arraste para o canvas</p>
            {nodeTypes.map((n) => (
              <div
                key={n.type}
                className="cb-node-item"
                draggable
                onDragStart={(e) => onDragStart(e, n.type)}
              >
                <div className="cb-node-icon">{n.icon}</div>
                <div className="cb-node-info">
                  <div className="cb-node-label">{n.label}</div>
                  <div className="cb-node-desc">{n.desc}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="cb-settings-form">
            <p className="cb-section-title">🎯 Público Alvo</p>
            {/* Aqui entrarão os filtros que você enviou */}
            <div className="cb-field">
              <label><Target size={12} /> Stages</label>
              <div className="cb-tags-grid">
                {['COLD', 'WARMING', 'WARM', 'HOT', 'INTERESTED'].map(s => (
                  <button 
                    key={s}
                    className={`cb-tag ${campaignSettings.targetStages.includes(s) ? 'active' : ''}`}
                    onClick={() => {
                      const current = campaignSettings.targetStages;
                      setCampaignSettings({
                        ...campaignSettings,
                        targetStages: current.includes(s) ? current.filter((x: any) => x !== s) : [...current, s]
                      });
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <p className="cb-section-title">⏰ Agendamento</p>
            <div className="cb-field">
              <label><Calendar size={12} /> Data/Hora</label>
              <input 
                type="datetime-local" 
                className="cb-input"
                value={campaignSettings.scheduledAt}
                onChange={(e) => setCampaignSettings({...campaignSettings, scheduledAt: e.target.value})}
              />
            </div>

            <div className="cb-field">
              <label><Clock size={12} /> Janela de Envio</label>
              <div className="cb-row">
                <input 
                  type="time" 
                  className="cb-input" 
                  value={campaignSettings.sendWindowStart}
                  onChange={(e) => setCampaignSettings({...campaignSettings, sendWindowStart: e.target.value})}
                />
                <span>até</span>
                <input 
                  type="time" 
                  className="cb-input"
                  value={campaignSettings.sendWindowEnd}
                  onChange={(e) => setCampaignSettings({...campaignSettings, sendWindowEnd: e.target.value})}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Plus({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  );
}
