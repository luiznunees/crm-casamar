import { useState, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical, X, Plus, Type, Image, Mic, Video,
  FileText, BarChart2, Clock, Sparkles, Eye, EyeOff,
  ChevronDown, ChevronUp,
} from "lucide-react";

export type StepType = "text" | "image" | "audio" | "video" | "document" | "poll" | "delay";

export interface CampaignStep {
  id: string;
  type: StepType;
  delayAfter: number;
  content?: string;
  useAI?: boolean;
  base64?: string;
  mimetype?: string;
  caption?: string;
  fileName?: string;
  question?: string;
  optionYes?: string;
  optionNo?: string;
  tagOnYes?: string;
  seconds?: number;
}

const STEP_META: Record<StepType, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  text:     { icon: <Type size={14} />,      label: "Texto",     color: "#6366f1", bg: "#6366f111" },
  image:    { icon: <Image size={14} />,     label: "Imagem",    color: "#f59e0b", bg: "#f59e0b11" },
  audio:    { icon: <Mic size={14} />,       label: "Audio",     color: "#10b981", bg: "#10b98111" },
  video:    { icon: <Video size={14} />,     label: "Video",     color: "#3b82f6", bg: "#3b82f611" },
  document: { icon: <FileText size={14} />,  label: "Documento", color: "#8b5cf6", bg: "#8b5cf611" },
  poll:     { icon: <BarChart2 size={14} />, label: "Enquete",   color: "#ec4899", bg: "#ec489911" },
  delay:    { icon: <Clock size={14} />,     label: "Delay",     color: "#64748b", bg: "#64748b11" },
};

function uid() { return Math.random().toString(36).slice(2, 10); }

function WhatsAppPreview({ step }: { step: CampaignStep }) {
  const meta = STEP_META[step.type];
  if (step.type === "text") {
    return (
      <div style={{
        background: "#1a2a1a", borderRadius: "12px 12px 2px 12px",
        padding: "10px 14px", maxWidth: 260, fontSize: 13, lineHeight: 1.5,
        color: "#e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
      }}>
        {step.content || <span style={{ color: "#64748b", fontStyle: "italic" }}>Escreva a mensagem...</span>}
        <div style={{ fontSize: 10, color: "#64748b", textAlign: "right", marginTop: 4 }}>
          {step.useAI && <span style={{ color: "#6366f1", marginRight: 4 }}>✦ IA</span>}
          agora ✓✓
        </div>
      </div>
    );
  }
  if (step.type === "image") {
    return (
      <div style={{ borderRadius: "12px 12px 2px 12px", overflow: "hidden", maxWidth: 200, boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
        {step.base64 ? (
          <img src={`data:${step.mimetype};base64,${step.base64}`} style={{ width: "100%", display: "block" }} alt="preview" />
        ) : (
          <div style={{ background: "#1e293b", width: 200, height: 140, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", flexDirection: "column", gap: 8 }}>
            <Image size={32} />
            <span style={{ fontSize: 12 }}>Selecione uma imagem</span>
          </div>
        )}
        {step.caption && <div style={{ background: "#1a2a1a", padding: "6px 10px", fontSize: 12, color: "#e2e8f0" }}>{step.caption}</div>}
      </div>
    );
  }
  if (step.type === "audio") {
    return (
      <div style={{ background: "#1a2a1a", borderRadius: "12px 12px 2px 12px", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, maxWidth: 220, boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#10b98133", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Mic size={16} color="#10b981" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ height: 3, background: "#10b98133", borderRadius: 2, marginBottom: 4 }}>
            <div style={{ width: "40%", height: "100%", background: "#10b981", borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{step.base64 ? "Audio pronto" : "Selecione um audio"}</div>
        </div>
      </div>
    );
  }
  if (step.type === "poll") {
    return (
      <div style={{ background: "#1a2a1a", borderRadius: "12px 12px 2px 12px", padding: "12px 14px", maxWidth: 260, boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
        <div style={{ fontSize: 13, color: "#e2e8f0", marginBottom: 10, fontWeight: 500 }}>
          {step.question || <span style={{ color: "#64748b", fontStyle: "italic" }}>Pergunta da enquete...</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ background: "#6366f122", border: "1px solid #6366f144", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "#a5b4fc", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid #6366f1" }} />
            {step.optionYes || "Sim, quero acessar"}
          </div>
          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid #475569" }} />
            {step.optionNo || "Agora nao"}
          </div>
        </div>
      </div>
    );
  }
  if (step.type === "delay") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 12 }}>
        <Clock size={14} />
        <span>Aguarda {step.seconds || 30}s</span>
      </div>
    );
  }
  return (
    <div style={{ background: "#1a2a1a", borderRadius: "12px 12px 2px 12px", padding: "10px 14px", fontSize: 12, color: "#94a3b8", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
      {meta.icon} {meta.label} {step.fileName || ""}
    </div>
  );
}

function StepBlock({ step, onChange, onRemove, index, total }: {
  step: CampaignStep;
  onChange: (u: CampaignStep) => void;
  onRemove: () => void;
  index: number;
  total: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const [expanded, setExpanded] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const meta = STEP_META[step.type];
  const set = (p: Partial<CampaignStep>) => onChange({ ...step, ...p });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      set({ base64, mimetype: file.type, fileName: file.name });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, marginBottom: 0 }}>
      {/* Linha de conexao acima (exceto no primeiro) */}
      {index > 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "4px 0" }}>
          <div style={{ width: 2, height: 8, background: "#334155" }} />
          {step.delayAfter > 0 && (
            <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 20, padding: "2px 10px", fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={10} /> {step.delayAfter}s
            </div>
          )}
          <div style={{ width: 2, height: 8, background: "#334155" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#334155" }} />
        </div>
      )}

      {/* Card do bloco */}
      <div style={{
        background: "#0f172a",
        border: `1px solid ${meta.color}44`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: `0 0 0 1px ${meta.color}11, 0 4px 12px rgba(0,0,0,0.3)`,
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px",
          background: `${meta.color}11`,
          borderBottom: expanded ? `1px solid ${meta.color}22` : "none",
        }}>
          {/* Drag handle */}
          <div {...attributes} {...listeners} style={{ cursor: "grab", color: "#475569", display: "flex", touchAction: "none" }}>
            <GripVertical size={15} />
          </div>

          {/* Badge tipo */}
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            background: `${meta.color}22`, color: meta.color,
            borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700,
            border: `1px solid ${meta.color}33`,
          }}>
            {meta.icon} {meta.label.toUpperCase()}
          </div>

          {/* Numero do bloco */}
          <div style={{ fontSize: 11, color: "#475569" }}>#{index + 1}</div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            {/* Delay configuravel */}
            {step.type !== "delay" && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#1e293b", borderRadius: 6, padding: "3px 8px", border: "1px solid #334155" }}>
                <Clock size={11} color="#64748b" />
                <input
                  type="number" min={0} max={3600} value={step.delayAfter}
                  onChange={e => set({ delayAfter: Number(e.target.value) })}
                  style={{ width: 40, background: "none", border: "none", color: "#94a3b8", fontSize: 11, outline: "none" }}
                />
                <span style={{ fontSize: 11, color: "#475569" }}>s</span>
              </div>
            )}

            {/* Expandir/colapsar */}
            <button onClick={() => setExpanded(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", display: "flex", padding: 2 }}>
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {/* Remover */}
            <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", display: "flex", padding: 2 }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Corpo expandido */}
        {expanded && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {/* Coluna esquerda: editor */}
            <div style={{ padding: "14px", borderRight: "1px solid #1e293b" }}>
              {step.type === "text" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <textarea
                    style={{
                      width: "100%", minHeight: 90, background: "#1e293b", border: "1px solid #334155",
                      borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: 13,
                      resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.5,
                      boxSizing: "border-box",
                    }}
                    placeholder="Escreva a mensagem aqui..."
                    value={step.content || ""}
                    onChange={e => set({ content: e.target.value })}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12 }}>
                    <div style={{
                      width: 32, height: 18, borderRadius: 9, background: step.useAI ? "#6366f1" : "#334155",
                      position: "relative", transition: "background 0.2s", flexShrink: 0,
                    }} onClick={() => set({ useAI: !step.useAI })}>
                      <div style={{
                        width: 14, height: 14, borderRadius: "50%", background: "white",
                        position: "absolute", top: 2, left: step.useAI ? 16 : 2, transition: "left 0.2s",
                      }} />
                    </div>
                    <span style={{ color: step.useAI ? "#a5b4fc" : "#64748b" }}>
                      {step.useAI ? <><Sparkles size={11} style={{ display: "inline", marginRight: 3 }} />IA varia as palavras</> : "Texto exato"}
                    </span>
                  </label>
                </div>
              )}

              {(step.type === "image" || step.type === "video" || step.type === "audio" || step.type === "document") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <input ref={fileRef} type="file" style={{ display: "none" }}
                    accept={step.type === "image" ? "image/*" : step.type === "audio" ? "audio/*" : step.type === "video" ? "video/*" : "*/*"}
                    onChange={handleFile}
                  />
                  <button onClick={() => fileRef.current?.click()} style={{
                    background: "#1e293b", border: "2px dashed #334155", borderRadius: 8,
                    padding: "16px", cursor: "pointer", color: "#64748b", fontSize: 12,
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    transition: "border-color 0.2s",
                  }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = meta.color)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#334155")}
                  >
                    <div style={{ color: meta.color }}>{meta.icon}</div>
                    {step.base64 ? <span style={{ color: "#94a3b8" }}>{step.fileName || "Arquivo selecionado"}</span> : <span>Clique para selecionar</span>}
                  </button>
                  {(step.type === "image" || step.type === "video") && (
                    <input
                      style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", color: "#e2e8f0", fontSize: 12, outline: "none" }}
                      placeholder="Legenda (opcional)"
                      value={step.caption || ""}
                      onChange={e => set({ caption: e.target.value })}
                    />
                  )}
                </div>
              )}

              {step.type === "poll" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "8px 10px", color: "#e2e8f0", fontSize: 13, outline: "none" }}
                    placeholder="Pergunta da enquete"
                    value={step.question || ""}
                    onChange={e => set({ question: e.target.value })}
                  />
                  <input
                    style={{ background: "#6366f111", border: "1px solid #6366f133", borderRadius: 6, padding: "6px 10px", color: "#a5b4fc", fontSize: 12, outline: "none" }}
                    placeholder="Opcao Sim"
                    value={step.optionYes || "Sim, quero acessar"}
                    onChange={e => set({ optionYes: e.target.value })}
                  />
                  <input
                    style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", color: "#94a3b8", fontSize: 12, outline: "none" }}
                    placeholder="Opcao Nao"
                    value={step.optionNo || "Agora nao"}
                    onChange={e => set({ optionNo: e.target.value })}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: "#64748b" }}>Tag para Sim:</span>
                    <input
                      style={{ flex: 1, background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "4px 8px", color: "#e2e8f0", fontSize: 12, outline: "none" }}
                      placeholder="lista-vip"
                      value={step.tagOnYes || ""}
                      onChange={e => set({ tagOnYes: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {step.type === "delay" && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>Aguardar</span>
                  <input
                    type="number" min={1} max={3600}
                    style={{ width: 70, background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", color: "#e2e8f0", fontSize: 13, outline: "none" }}
                    value={step.seconds || 30}
                    onChange={e => set({ seconds: Number(e.target.value) })}
                  />
                  <span style={{ fontSize: 13, color: "#64748b" }}>segundos</span>
                </div>
              )}
            </div>

            {/* Coluna direita: preview WhatsApp */}
            <div style={{ padding: "14px", background: "#0a0f1a", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 10, color: "#334155", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Preview</div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <WhatsAppPreview step={step} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const ADD_BUTTONS: { type: StepType; label: string }[] = [
  { type: "text",     label: "Texto" },
  { type: "image",    label: "Imagem" },
  { type: "audio",    label: "Audio" },
  { type: "video",    label: "Video" },
  { type: "document", label: "Documento" },
  { type: "poll",     label: "Enquete" },
  { type: "delay",    label: "Delay" },
];

export function StepEditor({ steps, onChange }: { steps: CampaignStep[]; onChange: (s: CampaignStep[]) => void }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oi = steps.findIndex(s => s.id === active.id);
      const ni = steps.findIndex(s => s.id === over.id);
      onChange(arrayMove(steps, oi, ni));
    }
  };

  const addStep = (type: StepType) => {
    const defaults: Record<StepType, Partial<CampaignStep>> = {
      text:     { content: "", useAI: true },
      image:    {},
      audio:    {},
      video:    {},
      document: {},
      poll:     { question: "", optionYes: "Sim, quero acessar", optionNo: "Agora nao", tagOnYes: "lista-vip" },
      delay:    { seconds: 30 },
    };
    onChange([...steps, { id: uid(), type, delayAfter: type === "delay" ? 0 : 5, ...defaults[type] }]);
  };

  return (
    <div style={{ fontFamily: "inherit" }}>
      {steps.length === 0 ? (
        <div style={{
          border: "2px dashed #1e293b", borderRadius: 12, padding: "40px 20px",
          textAlign: "center", color: "#334155", marginBottom: 16,
          background: "#0a0f1a",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📱</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#475569", marginBottom: 6 }}>Monte a sequencia de envio</div>
          <div style={{ fontSize: 13, color: "#334155" }}>Adicione blocos abaixo. Arraste para reordenar.</div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <div style={{ paddingBottom: 8 }}>
              {steps.map((step, i) => (
                <StepBlock
                  key={step.id}
                  step={step}
                  index={i}
                  total={steps.length}
                  onChange={u => onChange(steps.map(s => s.id === step.id ? u : s))}
                  onRemove={() => onChange(steps.filter(s => s.id !== step.id))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Botoes de adicionar */}
      <div style={{ background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 11, color: "#334155", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
          + Adicionar bloco
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {ADD_BUTTONS.map(({ type, label }) => {
            const meta = STEP_META[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => addStep(type)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                  background: meta.bg, color: meta.color,
                  border: `1px solid ${meta.color}33`,
                  fontWeight: 600, transition: "all 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${meta.color}22`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = meta.bg; }}
              >
                {meta.icon} {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Resumo da sequencia */}
      {steps.length > 0 && (
        <div style={{ marginTop: 12, background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontSize: 11, color: "#334155", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
            Sequencia ({steps.length} bloco{steps.length !== 1 ? "s" : ""})
          </div>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
            {steps.map((step, i) => {
              const meta = STEP_META[step.type];
              return (
                <div key={step.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{
                    display: "flex", alignItems: "center", gap: 4,
                    background: meta.bg, color: meta.color,
                    borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600,
                    border: `1px solid ${meta.color}33`,
                  }}>
                    {meta.icon} {meta.label}
                  </span>
                  {i < steps.length - 1 && (
                    <span style={{ fontSize: 10, color: "#334155" }}>
                      {step.delayAfter > 0 ? `⏱${step.delayAfter}s` : ""} →
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
