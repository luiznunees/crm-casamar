import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Upload, FileText, Table, Hash } from 'lucide-react';
import { importApi, type LeadList, type ImportResult, type ExtractResult, type CSVPreviewResult } from '../api/client';
import { STAGE_LABELS, SOURCES } from '../constants';
import type { Stage } from '../api/client';

const COLORS = ['#6366f1','#f59e0b','#22c55e','#ef4444','#3b82f6','#ec4899'];

function Opts({ source, setSource, stage, setStage, tags, setTags, lists, onNew }: any) {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [nm, setNm] = useState('');
  const [col, setCol] = useState('#6366f1');
  const save = async () => {
    if (!nm.trim()) return;
    await importApi.lists.create({ name: nm.trim(), color: col });
    qc.invalidateQueries({ queryKey: ['lead-lists'] });
    onNew(nm.trim()); setSource(nm.trim()); setNm(''); setShow(false);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <label className="form-label" style={{ margin: 0 }}>Lista / Empreendimento *</label>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setShow((v: boolean) => !v)}><Plus size={11} /> Nova lista</button>
        </div>
        {show && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input className="form-input" style={{ fontSize: 13 }} placeholder="Nome da lista" value={nm} onChange={e => setNm(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} autoFocus />
              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={save}>Criar</button>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setShow(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>{COLORS.map(c => <button key={c} type="button" onClick={() => setCol(c)} style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', outline: col === c ? '3px solid white' : 'none' }} />)}</div>
          </div>
        )}
        <select className="form-select" value={source} onChange={e => setSource(e.target.value)}>
          <option value="">Selecione...</option>
          {lists.map((l: LeadList) => <option key={l.id} value={l.name}>{l.name}{l.leadCount > 0 ? ` (${l.leadCount})` : ''}</option>)}
          {SOURCES.map((s: string) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
        <span>🔀</span><div><span style={{ fontWeight: 500, color: 'var(--text)' }}>Chip automático</span><span style={{ marginLeft: 8 }}>— distribuído entre chip 1 e 2 aleatoriamente</span></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Stage inicial</label>
          <select className="form-select" value={stage} onChange={e => setStage(e.target.value as Stage)}>{Object.entries(STAGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l as string}</option>)}</select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Tags</label>
          <input className="form-input" placeholder="vip, feira" value={tags} onChange={e => setTags(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: ImportResult }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        {[['Total', result.total, 'var(--text)'],['Importados', result.imported,'var(--success)'],['Duplicados', result.duplicates,'var(--warning)'],['Inválidos', result.invalid,'var(--danger)']].map(([l,v,c]) => (
          <div key={l as string} className="stat-card" style={{ padding: 12 }}><div className="stat-label">{l as string}</div><div style={{ fontSize: 24, fontWeight: 700, color: c as string }}>{v as number}</div></div>
        ))}
      </div>
      <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
        {result.leads.slice(0,50).map((lead, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
            <span style={{ fontWeight: 500 }}>{lead.phone}</span>
            {lead.name && <span style={{ color: 'var(--text-muted)' }}>{lead.name}</span>}
            <span style={{ marginLeft: 'auto', color: lead.status === 'imported' ? 'var(--success)' : lead.status === 'duplicate' ? 'var(--warning)' : 'var(--danger)' }}>{lead.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PDFTab({ lists }: { lists: LeadList[] }) {
  const [file, setFile] = useState<File|null>(null);
  const [ext, setExt] = useState<ExtractResult|null>(null);
  const [res, setRes] = useState<ImportResult|null>(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState('');
  const [stage, setStage] = useState<Stage>('COLD');
  const [tags, setTags] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const opts = { source, assignedNumber: 1 as const, stage, tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [] };
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Faça upload de um PDF ou TXT. O sistema extrai automaticamente todos os números de telefone brasileiros.</p>
      <div onClick={() => ref.current?.click()} style={{ border: `2px dashed ${file ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: file ? 'rgba(99,102,241,0.05)' : 'transparent', marginBottom: 16 }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFile(f); setExt(null); setRes(null); } }}>
        <FileText size={32} style={{ color: file ? 'var(--primary)' : 'var(--text-muted)', marginBottom: 8 }} />
        <div style={{ fontWeight: 500, marginBottom: 4 }}>{file ? file.name : 'Arraste um PDF ou clique para selecionar'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>PDF, TXT — máx. 10MB</div>
        <input ref={ref} type="file" accept=".pdf,.txt" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setExt(null); setRes(null); } }} />
      </div>
      {file && !ext && !res && <button className="btn btn-ghost" style={{ marginBottom: 16 }} onClick={async () => { setLoading(true); try { setExt((await importApi.pdf.extract(file!)).data); } catch (e: any) { alert(e?.response?.data?.error || 'Erro'); } finally { setLoading(false); } }} disabled={loading}><Upload size={14} /> {loading ? 'Extraindo...' : 'Extrair Telefones'}</button>}
      {ext && !res && ext.totalFound > 0 && (
        <div>
          <div style={{ background: '#1a3a2a', border: '1px solid var(--success)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--success)' }}>✅ <strong>{ext.totalFound}</strong> telefones encontrados em "{ext.fileName}"</div>
          <div style={{ maxHeight: 100, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 6 }}>{ext.phones.map(p => <span key={p} style={{ background: 'var(--bg-hover)', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>{p}</span>)}</div>
          <div className="card" style={{ marginBottom: 16 }}><h4 style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Configurar importação</h4><Opts source={source} setSource={setSource} stage={stage} setStage={setStage} tags={tags} setTags={setTags} lists={lists} onNew={setSource} /></div>
          <button className="btn btn-primary" onClick={async () => { setLoading(true); try { setRes((await importApi.pdf.import(file!, opts)).data); } catch (e: any) { alert(e?.response?.data?.error || 'Erro'); } finally { setLoading(false); } }} disabled={!source || loading}><Upload size={14} /> {loading ? 'Importando...' : `Importar ${ext.totalFound} leads`}</button>
        </div>
      )}
      {res && <ResultCard result={res} />}
    </div>
  );
}

function CSVTab({ lists }: { lists: LeadList[] }) {
  const [file, setFile] = useState<File|null>(null);
  const [prev, setPrev] = useState<CSVPreviewResult|null>(null);
  const [res, setRes] = useState<ImportResult|null>(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState('');
  const [stage, setStage] = useState<Stage>('COLD');
  const [tags, setTags] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const opts = { source, assignedNumber: 1 as const, stage, tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [] };
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Importe um CSV com colunas: <code style={{ background: 'var(--bg)', padding: '1px 4px', borderRadius: 3 }}>telefone, nome, email, observacoes</code></p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Primeira linha = cabeçalho. Separador: vírgula ou ponto-e-vírgula.</p>
      <div onClick={() => ref.current?.click()} style={{ border: `2px dashed ${file ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: file ? 'rgba(99,102,241,0.05)' : 'transparent', marginBottom: 16 }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFile(f); setPrev(null); setRes(null); } }}>
        <Table size={32} style={{ color: file ? 'var(--primary)' : 'var(--text-muted)', marginBottom: 8 }} />
        <div style={{ fontWeight: 500, marginBottom: 4 }}>{file ? file.name : 'Arraste um CSV ou clique para selecionar'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>CSV — máx. 10MB</div>
        <input ref={ref} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setPrev(null); setRes(null); } }} />
      </div>
      {file && !prev && !res && <button className="btn btn-ghost" style={{ marginBottom: 16 }} onClick={async () => { setLoading(true); try { setPrev((await importApi.csv.preview(file!)).data); } catch (e: any) { alert(e?.response?.data?.error || 'Erro'); } finally { setLoading(false); } }} disabled={loading}><Upload size={14} /> {loading ? 'Processando...' : 'Visualizar CSV'}</button>}
      {prev && !res && (
        <div>
          <div style={{ background: '#1a3a2a', border: '1px solid var(--success)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--success)' }}>✅ <strong>{prev.totalFound}</strong> registros válidos encontrados</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
            <table className="table" style={{ fontSize: 12 }}><thead><tr><th>Telefone</th><th>Nome</th><th>Email</th></tr></thead><tbody>{prev.preview.map((r, i) => <tr key={i}><td>{r.phone}</td><td style={{ color: 'var(--text-muted)' }}>{r.name || '—'}</td><td style={{ color: 'var(--text-muted)' }}>{r.email || '—'}</td></tr>)}</tbody></table>
            {prev.totalFound > 10 && <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>Mostrando 10 de {prev.totalFound}</div>}
          </div>
          <div className="card" style={{ marginBottom: 16 }}><h4 style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Configurar importação</h4><Opts source={source} setSource={setSource} stage={stage} setStage={setStage} tags={tags} setTags={setTags} lists={lists} onNew={setSource} /></div>
          <button className="btn btn-primary" onClick={async () => { setLoading(true); try { setRes((await importApi.csv.import(file!, opts)).data); } catch (e: any) { alert(e?.response?.data?.error || 'Erro'); } finally { setLoading(false); } }} disabled={!source || loading}><Upload size={14} /> {loading ? 'Importando...' : `Importar ${prev.totalFound} leads`}</button>
        </div>
      )}
      {res && <ResultCard result={res} />}
    </div>
  );
}

function BulkTab({ lists }: { lists: LeadList[] }) {
  const [text, setText] = useState('');
  const [res, setRes] = useState<ImportResult|null>(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState('');
  const [stage, setStage] = useState<Stage>('COLD');
  const [tags, setTags] = useState('');
  const cnt = (text.match(/\b\d{10,11}\b/g) || []).length;
  const opts = { source, assignedNumber: 1 as const, stage, tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [] };
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Cole uma lista de números, texto de WhatsApp, planilha copiada — o sistema extrai os telefones automaticamente.</p>
      <div className="form-group">
        <label className="form-label">Cole o texto aqui {cnt > 0 && <span style={{ marginLeft: 8, color: 'var(--primary)', fontWeight: 600 }}>{cnt} número(s) detectado(s)</span>}</label>
        <textarea className="form-textarea" style={{ minHeight: 160, fontFamily: 'monospace', fontSize: 12 }} placeholder={'Cole qualquer texto com números:\n\n(51) 99999-9999\n51988887777'} value={text} onChange={e => { setText(e.target.value); setRes(null); }} />
      </div>
      <div className="card" style={{ marginBottom: 16 }}><h4 style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Configurar importação</h4><Opts source={source} setSource={setSource} stage={stage} setStage={setStage} tags={tags} setTags={setTags} lists={lists} onNew={setSource} /></div>
      <button className="btn btn-primary" onClick={async () => { setLoading(true); try { setRes((await importApi.bulk(text, opts)).data); } catch (e: any) { alert(e?.response?.data?.error || 'Erro'); } finally { setLoading(false); } }} disabled={!text || !source || cnt === 0 || loading}><Upload size={14} /> {loading ? 'Importando...' : `Importar ${cnt} número(s)`}</button>
      {res && <ResultCard result={res} />}
    </div>
  );
}

function ListsTab() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState('#6366f1');
  const { data: lists = [], isLoading } = useQuery({ queryKey: ['lead-lists'], queryFn: () => importApi.lists.list().then(r => r.data) });
  return (
    <div>
      <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Gerenciar Listas</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Crie listas para organizar seus leads por origem.</p>
      <div className="card" style={{ marginBottom: 20 }}>
        <h4 style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Nova Lista</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Nome *</label><input className="form-input" placeholder="Ex: Feira do Imóvel Março" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Descrição</label><input className="form-input" placeholder="Opcional" value={desc} onChange={e => setDesc(e.target.value)} /></div>
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Cor</label>
          <div style={{ display: 'flex', gap: 8 }}>{COLORS.map(c => <button key={c} type="button" onClick={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', outline: color === c ? '3px solid white' : 'none', boxShadow: color === c ? `0 0 0 5px ${c}40` : 'none' }} />)}</div>
        </div>
        <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={async () => { if (!name.trim()) return; await importApi.lists.create({ name: name.trim(), description: desc, color }); qc.invalidateQueries({ queryKey: ['lead-lists'] }); setName(''); setDesc(''); }} disabled={!name.trim()}><Plus size={13} /> Criar Lista</button>
      </div>
      {isLoading ? <div className="loading">Carregando...</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(lists as LeadList[]).map((l: LeadList) => (
            <div key={l.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{l.name}</div>{l.description && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.description}</div>}</div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg)', borderRadius: 999, padding: '2px 8px' }}>{l.leadCount} leads</span>
              <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={async () => { if (!confirm(`Deletar "${l.name}"?`)) return; await importApi.lists.delete(l.id); qc.invalidateQueries({ queryKey: ['lead-lists'] }); }}><Trash2 size={13} /></button>
            </div>
          ))}
          {(lists as LeadList[]).length === 0 && <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">Nenhuma lista criada</div></div>}
        </div>
      )}
    </div>
  );
}

export default function Import() {
  const [tab, setTab] = useState<'pdf'|'csv'|'bulk'|'lists'>('pdf');
  const { data: lists = [] } = useQuery({ queryKey: ['lead-lists'], queryFn: () => importApi.lists.list().then(r => r.data) });
  const tabs = [{ key: 'pdf', label: 'PDF / Texto', icon: <FileText size={15} /> },{ key: 'csv', label: 'CSV / Planilha', icon: <Table size={15} /> },{ key: 'bulk', label: 'Colar Números', icon: <Hash size={15} /> },{ key: 'lists', label: 'Gerenciar Listas', icon: <Plus size={15} /> }];
  return (
    <div>
      <div className="page-header"><h1 className="page-title">Importar Leads</h1><span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{(lists as LeadList[]).length} lista(s)</span></div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {tabs.map(({ key, label, icon }) => <button key={key} onClick={() => setTab(key as any)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', color: tab === key ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === key ? '2px solid var(--primary)' : '2px solid transparent', fontWeight: tab === key ? 600 : 400, fontSize: 14, marginBottom: -1 }}>{icon}{label}</button>)}
      </div>
      {tab === 'pdf' && <PDFTab lists={lists as LeadList[]} />}
      {tab === 'csv' && <CSVTab lists={lists as LeadList[]} />}
      {tab === 'bulk' && <BulkTab lists={lists as LeadList[]} />}
      {tab === 'lists' && <ListsTab />}
    </div>
  );
}
