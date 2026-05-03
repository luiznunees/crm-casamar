import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Play, Plus, X, RefreshCw } from 'lucide-react';
import { aiConfigApi, leadsApi, importApi, type AIConfig, type LeadStats } from '../api/client';
import { SOURCES } from '../constants';

const STAGE_OPTIONS = ['COLD', 'WARMING', 'WARM', 'HOT', 'INTERESTED'];

function useAllSources() {
  const { data: stats } = useQuery({ queryKey: ['lead-stats'], queryFn: () => leadsApi.stats().then(r => r.data), staleTime: 30_000 });
  const { data: lists = [] } = useQuery({ queryKey: ['lead-lists'], queryFn: () => importApi.lists.list().then(r => r.data), staleTime: 30_000 });
  const fromStats = Object.keys((stats as LeadStats | undefined)?.bySource || {});
  const fromLists = (lists as any[]).map((l: any) => l.name);
  return Array.from(new Set([...SOURCES, ...fromStats, ...fromLists])).sort();
}

export default function AISettings() {
  const qc = useQueryClient();
  const allSources = useAllSources();

  const { data: config, isLoading } = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => aiConfigApi.get().then((r) => r.data),
  });

  const [form, setForm] = useState<Partial<AIConfig>>({});
  const [newForbidden, setNewForbidden] = useState('');
  const [newMustInclude, setNewMustInclude] = useState('');

  // Preview state
  const [previewTemplate, setPreviewTemplate] = useState('Apresentar o empreendimento, destacar diferenciais e convidar para uma visita.');
  const [previewName, setPreviewName] = useState('João');
  const [previewSource, setPreviewSource] = useState('Malibu');
  const [previewStage, setPreviewStage] = useState('WARM');
  const [previewBlocks, setPreviewBlocks] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  // Sync form when config loads
  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: () => aiConfigApi.update(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-config'] });
    },
  });

  const set = (key: keyof AIConfig, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  const addForbidden = () => {
    const word = newForbidden.trim();
    if (!word) return;
    set('forbiddenWords', [...(form.forbiddenWords || []), word]);
    setNewForbidden('');
  };

  const removeForbidden = (word: string) =>
    set('forbiddenWords', (form.forbiddenWords || []).filter((w) => w !== word));

  const addMustInclude = () => {
    const item = newMustInclude.trim();
    if (!item) return;
    set('mustInclude', [...(form.mustInclude || []), item]);
    setNewMustInclude('');
  };

  const removeMustInclude = (item: string) =>
    set('mustInclude', (form.mustInclude || []).filter((i) => i !== item));

  const runPreview = async () => {
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewBlocks([]);
    try {
      const res = await aiConfigApi.preview(previewTemplate, {
        name: previewName,
        source: previewSource,
        stage: previewStage,
      });
      setPreviewBlocks(res.data.blocks);
    } catch (err: any) {
      setPreviewError(err?.response?.data?.error || 'Erro ao gerar preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  if (isLoading) return <div className="loading">Carregando...</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Configurações de IA</h1>
        <button
          className="btn btn-primary"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          <Save size={15} />
          {saveMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>

      {saveMutation.isSuccess && (
        <div style={{ background: '#1a3a2a', border: '1px solid var(--success)', borderRadius: 8, padding: '10px 16px', marginBottom: 20, color: 'var(--success)', fontSize: 13 }}>
          ✅ Configurações salvas com sucesso!
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Coluna esquerda — Persona e Regras */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Persona */}
          <div className="card">
            <h3 style={{ fontWeight: 600, marginBottom: 16 }}>🧑‍💼 Persona da Consultora</h3>
            <div className="form-group">
              <label className="form-label">Nome da consultora</label>
              <input
                className="form-input"
                placeholder="Ex: Ana"
                value={form.personaName || ''}
                onChange={(e) => set('personaName', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Cargo / papel</label>
              <input
                className="form-input"
                placeholder="Ex: consultora imobiliária especialista"
                value={form.personaRole || ''}
                onChange={(e) => set('personaRole', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Nome da empresa</label>
              <input
                className="form-input"
                placeholder="Ex: Imobiliária Premium"
                value={form.companyName || ''}
                onChange={(e) => set('companyName', e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Assinatura (ao final de cada mensagem)</label>
              <input
                className="form-input"
                placeholder="Ex: Att, Ana | Imobiliária Premium 🏠"
                value={form.signatureTemplate || ''}
                onChange={(e) => set('signatureTemplate', e.target.value)}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Deixe vazio para não usar assinatura</span>
            </div>
          </div>

          {/* Tom e Estilo */}
          <div className="card">
            <h3 style={{ fontWeight: 600, marginBottom: 16 }}>🎨 Tom e Estilo</h3>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Instruções de tom e estilo</label>
              <textarea
                className="form-textarea"
                style={{ minHeight: 100 }}
                placeholder={`Ex:\n- Tom descontraído mas profissional\n- Use emojis com moderação (máximo 2)\n- Frases curtas, diretas\n- Evite linguagem muito formal`}
                value={form.toneInstructions || ''}
                onChange={(e) => set('toneInstructions', e.target.value)}
              />
            </div>
          </div>

          {/* Limite de caracteres */}
          <div className="card">
            <h3 style={{ fontWeight: 600, marginBottom: 16 }}>📏 Limite de Caracteres</h3>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Máximo de caracteres por mensagem</label>
              <input
                className="form-input"
                type="number"
                min={50}
                max={1000}
                value={form.maxLength || 300}
                onChange={(e) => set('maxLength', Number(e.target.value))}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Recomendado: 200–400 para WhatsApp</span>
            </div>
          </div>

          {/* Mensagens em blocos */}
          <div className="card">
            <h3 style={{ fontWeight: 600, marginBottom: 4 }}>✂️ Mensagens em Blocos</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Divide a mensagem em partes curtas enviadas separadamente, simulando uma conversa humana.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.splitMessages ?? true}
                  onChange={(e) => set('splitMessages', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
                />
                <span style={{ fontWeight: 500 }}>Ativar envio em blocos</span>
              </label>
            </div>

            {form.splitMessages && (
              <>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">Delay entre blocos (segundos)</label>
                  <input
                    className="form-input"
                    type="number"
                    min={1}
                    max={30}
                    value={form.blockDelaySeconds ?? 3}
                    onChange={(e) => set('blockDelaySeconds', Number(e.target.value))}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Recomendado: 2–5 segundos</span>
                </div>

                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Estrutura gerada:</div>
                  <div>📩 <strong>Bloco 1</strong> — Saudação curta ("Oi João, bom dia! 👋")</div>
                  <div style={{ color: 'var(--primary)', fontSize: 11, margin: '2px 0 2px 20px' }}>⏱ {form.blockDelaySeconds ?? 3}s</div>
                  <div>📩 <strong>Bloco 2</strong> — Contexto / gancho principal</div>
                  <div style={{ color: 'var(--primary)', fontSize: 11, margin: '2px 0 2px 20px' }}>⏱ {form.blockDelaySeconds ?? 3}s</div>
                  <div>📩 <strong>Bloco 3</strong> — CTA / próximo passo</div>
                  {form.signatureTemplate && (
                    <>
                      <div style={{ color: 'var(--primary)', fontSize: 11, margin: '2px 0 2px 20px' }}>⏱ {form.blockDelaySeconds ?? 3}s</div>
                      <div>📩 <strong>Bloco 4</strong> — Assinatura</div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Coluna direita — Regras, Palavras, Elementos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Regras globais */}
          <div className="card">
            <h3 style={{ fontWeight: 600, marginBottom: 4 }}>📋 Regras Globais Obrigatórias</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Instruções que a IA SEMPRE deve seguir em qualquer mensagem gerada.
            </p>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <textarea
                className="form-textarea"
                style={{ minHeight: 120 }}
                placeholder={`Ex:\n- Sempre mencionar que temos condições especiais de lançamento\n- Nunca citar preço sem antes perguntar o interesse\n- Sempre convidar para uma visita ao stand\n- Mencionar que as unidades são limitadas`}
                value={form.globalRules || ''}
                onChange={(e) => set('globalRules', e.target.value)}
              />
            </div>
          </div>

          {/* Elementos obrigatórios */}
          <div className="card">
            <h3 style={{ fontWeight: 600, marginBottom: 4 }}>✅ Elementos Obrigatórios</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Itens que devem aparecer em toda mensagem gerada.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {(form.mustInclude || []).map((item) => (
                <span
                  key={item}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#1a3a2a', border: '1px solid var(--success)', borderRadius: 6, padding: '3px 8px', fontSize: 12, color: 'var(--success)' }}
                >
                  {item}
                  <button onClick={() => removeMustInclude(item)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                    <X size={11} />
                  </button>
                </span>
              ))}
              {(form.mustInclude || []).length === 0 && (
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Nenhum elemento obrigatório</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input"
                placeholder="Ex: CTA para visita ao stand"
                value={newMustInclude}
                onChange={(e) => setNewMustInclude(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMustInclude()}
              />
              <button className="btn btn-ghost" onClick={addMustInclude}>
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Palavras proibidas */}
          <div className="card">
            <h3 style={{ fontWeight: 600, marginBottom: 4 }}>🚫 Palavras Proibidas</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Palavras que a IA nunca deve usar.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {(form.forbiddenWords || []).map((word) => (
                <span
                  key={word}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#3a1a1a', border: '1px solid var(--danger)', borderRadius: 6, padding: '3px 8px', fontSize: 12, color: 'var(--danger)' }}
                >
                  {word}
                  <button onClick={() => removeForbidden(word)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                    <X size={11} />
                  </button>
                </span>
              ))}
              {(form.forbiddenWords || []).length === 0 && (
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Nenhuma palavra proibida</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input"
                placeholder="Ex: barato, promoção, urgente"
                value={newForbidden}
                onChange={(e) => setNewForbidden(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addForbidden()}
              />
              <button className="btn btn-ghost" onClick={addForbidden}>
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Preview / Teste */}
      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ fontWeight: 600, marginBottom: 4 }}>🧪 Testar Personalização de Mensagem</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Escreva a mensagem como você quer que chegue. A IA vai personalizar o nome e dividir em blocos.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Sua mensagem</label>
            <textarea
              className="form-textarea"
              style={{ minHeight: 70 }}
              placeholder={"Oi! Estou montando uma lista VIP com oportunidades no litoral. Posso te incluir?"}
              value={previewTemplate}
              onChange={(e) => setPreviewTemplate(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Nome do lead (mock)</label>
            <input className="form-input" value={previewName} onChange={(e) => setPreviewName(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Empreendimento</label>
            <select className="form-select" value={previewSource} onChange={(e) => setPreviewSource(e.target.value)}>
              {allSources.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Stage</label>
            <select className="form-select" value={previewStage} onChange={(e) => setPreviewStage(e.target.value)}>
              {STAGE_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={runPreview} disabled={previewLoading || !previewTemplate}>
            {previewLoading ? <><RefreshCw size={14} className="spin" /> Gerando...</> : <><Play size={14} /> Gerar Preview</>}
          </button>
          {previewBlocks.length > 0 && (
            <button className="btn btn-ghost" onClick={runPreview} disabled={previewLoading}>
              <RefreshCw size={14} /> Gerar Novamente
            </button>
          )}
        </div>

        {previewError && (
          <div style={{ background: '#3a1a1a', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 14px', color: 'var(--danger)', fontSize: 13 }}>
            ❌ {previewError}
          </div>
        )}

        {previewBlocks.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {previewBlocks.length} mensagem(ns) gerada(s) — como vai aparecer no WhatsApp:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {previewBlocks.map((block, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 4 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    {i < previewBlocks.length - 1 && (form.blockDelaySeconds ?? 3) > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                        ⏱ {form.blockDelaySeconds ?? 3}s
                      </div>
                    )}
                  </div>
                  <div style={{
                    background: 'var(--primary)',
                    borderRadius: '12px 12px 2px 12px',
                    padding: '10px 14px',
                    maxWidth: '80%',
                    fontSize: 14,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {block}
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 4, textAlign: 'right' }}>
                      {block.length} chars
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
