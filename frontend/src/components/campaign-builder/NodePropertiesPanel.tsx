import { X, Sparkles, AlertCircle, Info } from 'lucide-react';
import { type Node } from '@xyflow/react';

interface NodePropertiesPanelProps {
  node: Node | null;
  onUpdate: (id: string, data: any) => void;
  onClose: () => void;
}

export default function NodePropertiesPanel({ node, onUpdate, onClose }: NodePropertiesPanelProps) {
  if (!node) return null;

  const handleChange = (field: string, value: any) => {
    onUpdate(node.id, { ...node.data, [field]: value });
  };

  return (
    <div className="cb-properties-panel">
      <div className="cb-properties-header">
        <div className="cb-properties-title">
          <span className="cb-node-type-label">{node.type?.toUpperCase()}</span>
          <h3>Configurações</h3>
        </div>
        <button onClick={onClose} className="cb-close-btn"><X size={18} /></button>
      </div>

      <div className="cb-properties-content">
        {/* Renderização condicional por tipo de nó */}
        {node.type === 'text' && (
          <>
            <div className="cb-field">
              <label>Conteúdo da Mensagem</label>
              <textarea 
                className="cb-input" 
                rows={6}
                value={(node.data.content as string) || ''}
                onChange={(e) => handleChange('content', e.target.value)}
                placeholder="Olá {{nome}}, tudo bem?..."
              />
              <p className="cb-field-help">Use {"{{nome}}"} para personalizar.</p>
            </div>
            <div className="cb-field-row">
              <label className="cb-switch-label">
                <input 
                  type="checkbox" 
                  checked={!!node.data.useAI}
                  onChange={(e) => handleChange('useAI', e.target.checked)}
                />
                <Sparkles size={14} color="var(--cb-primary)" /> Usar IA para variar texto
              </label>
            </div>
          </>
        )}

        {node.type === 'delay' && (
          <>
            <div className="cb-field">
              <label>Tempo de Espera (segundos)</label>
              <input 
                type="number" 
                className="cb-input"
                value={(node.data.seconds as number) || 30}
                onChange={(e) => handleChange('seconds', parseInt(e.target.value))}
              />
            </div>
            <div className="cb-info-box">
              <Info size={14} />
              <span>Evite delays menores que 15s para reduzir riscos de banimento.</span>
            </div>
          </>
        )}

        {node.type === 'condition' && (
          <>
            <div className="cb-field">
              <label>Campo do Lead</label>
              <select 
                className="cb-input"
                value={(node.data.field as string) || 'stage'}
                onChange={(e) => handleChange('field', e.target.value)}
              >
                <option value="stage">Stage Atual</option>
                <option value="engagementScore">Score de Engajamento</option>
                <option value="tags">Etiquetas</option>
              </select>
            </div>
            <div className="cb-field">
              <label>Operador</label>
              <select 
                className="cb-input"
                value={(node.data.operator as string) || 'equals'}
                onChange={(e) => handleChange('operator', e.target.value)}
              >
                <option value="equals">Igual a</option>
                <option value="contains">Contém</option>
                <option value="greaterThan">Maior que</option>
              </select>
            </div>
            <div className="cb-field">
              <label>Valor</label>
              <input 
                type="text" 
                className="cb-input"
                value={(node.data.value as string) || ''}
                onChange={(e) => handleChange('value', e.target.value)}
              />
            </div>
          </>
        )}

        {/* Mensagem de Validação se estiver incompleto */}
        {(!node.data.content && node.type === 'text') && (
          <div className="cb-validation-error">
            <AlertCircle size={14} />
            <span>Este bloco precisa de conteúdo para ser enviado.</span>
          </div>
        )}
      </div>

      <style>{`
        .cb-properties-panel {
          width: 320px;
          background: var(--cb-panel-bg);
          backdrop-filter: blur(16px);
          border-left: 1px solid var(--cb-border);
          display: flex;
          flex-direction: column;
          z-index: 100;
          animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .cb-properties-header {
          padding: 20px;
          border-bottom: 1px solid var(--cb-border);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .cb-properties-title h3 {
          margin: 4px 0 0;
          font-size: 16px;
          font-weight: 700;
        }
        .cb-node-type-label {
          font-size: 10px;
          font-weight: 800;
          color: var(--cb-primary);
          letter-spacing: 1px;
        }
        .cb-properties-content {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
        }
        .cb-field-help {
          font-size: 11px;
          color: var(--cb-text-muted);
          margin-top: 4px;
        }
        .cb-switch-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          padding: 12px;
          background: rgba(255,255,255,0.03);
          border-radius: 8px;
          margin-top: 8px;
        }
        .cb-info-box {
          display: flex;
          gap: 8px;
          padding: 12px;
          background: rgba(124, 106, 247, 0.1);
          border-radius: 8px;
          color: var(--cb-primary);
          font-size: 11px;
          margin-top: 16px;
          line-height: 1.4;
        }
        .cb-validation-error {
          display: flex;
          gap: 8px;
          padding: 12px;
          background: rgba(239, 68, 68, 0.1);
          border-radius: 8px;
          color: var(--cb-danger);
          font-size: 11px;
          margin-top: 20px;
          border: 1px solid rgba(239, 68, 68, 0.2);
        }
        .cb-close-btn {
          background: transparent;
          border: none;
          color: var(--cb-text-muted);
          cursor: pointer;
          padding: 4px;
        }
      `}</style>
    </div>
  );
}
