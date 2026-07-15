'use client';
import { useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtData } from '@/lib/contrato';
import { TIPOS_DOC, subirArquivo, baixarArquivo, apagarArquivo, fmtTamanho, validadeSit } from '@/lib/arquivos';

export default function DocumentosClient({ docsIniciais, obras, papel }:
  { docsIniciais: any[]; obras: any[]; papel: string }) {
  const [docs, setDocs] = useState(docsIniciais);
  const [novo, setNovo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const supabase = supabaseBrowser();
  const ehAdmin = papel === 'admin';

  const [f, setF] = useState({
    obra_id: '', tipo: 'certidao', titulo: '', emissor: '', numero: '',
    emissao: '', validade: '', clausula: '', observacoes: '',
  });

  const vencidos = docs.filter(d => validadeSit(d.validade).dias !== null && validadeSit(d.validade).dias! < 0);
  const vencendo = docs.filter(d => { const s = validadeSit(d.validade); return s.dias !== null && s.dias >= 0 && s.dias <= 30; });
  const semArquivo = docs.filter(d => !d.arquivo_path);

  const obraCod = (id: number | null) => id ? (obras.find(o => o.id === id)?.codigo ?? '—') : 'Empresa';

  async function criar() {
    if (!f.titulo.trim()) { alert('Informe o título do documento.'); return; }
    setOcupado(true);
    try {
      let up: any = null;
      if (arquivo) up = await subirArquivo(arquivo, `documentos/${f.obra_id || 'empresa'}`);
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('documentos').insert({
        obra_id: f.obra_id ? Number(f.obra_id) : null, tipo: f.tipo, titulo: f.titulo.trim(),
        emissor: f.emissor.trim() || null, numero: f.numero.trim() || null,
        emissao: f.emissao || null, validade: f.validade || null, clausula: f.clausula.trim() || null,
        observacoes: f.observacoes.trim() || null,
        arquivo_path: up?.path ?? null, arquivo_nome: up?.nome ?? null, arquivo_tamanho: up?.tamanho ?? null,
        criado_por: user?.id,
      }).select().single();
      if (error) throw new Error(error.message);
      setDocs(d => [...d, data]);
      setF({ ...f, titulo: '', emissor: '', numero: '', emissao: '', validade: '', observacoes: '' });
      setArquivo(null); setNovo(false);
    } catch (e: any) { alert(e.message); }
    setOcupado(false);
  }

  async function anexarEm(d: any, file: File) {
    setOcupado(true);
    try {
      const up = await subirArquivo(file, `documentos/${d.obra_id || 'empresa'}`);
      const { error } = await supabase.from('documentos').update({
        arquivo_path: up.path, arquivo_nome: up.nome, arquivo_tamanho: up.tamanho,
      }).eq('id', d.id);
      if (error) throw new Error(error.message);
      setDocs(ds => ds.map(x => x.id === d.id ? { ...x, arquivo_path: up.path, arquivo_nome: up.nome, arquivo_tamanho: up.tamanho } : x));
    } catch (e: any) { alert(e.message); }
    setOcupado(false);
  }

  async function editarValidade(d: any) {
    const v = prompt(`Validade de "${d.titulo}" (AAAA-MM-DD, vazio = sem validade):`, d.validade ?? '');
    if (v === null) return;
    const val = v.trim() || null;
    const { error } = await supabase.from('documentos').update({ validade: val }).eq('id', d.id);
    if (error) { alert(error.message); return; }
    setDocs(ds => ds.map(x => x.id === d.id ? { ...x, validade: val } : x));
  }

  async function excluir(d: any) {
    if (!confirm(`Excluir "${d.titulo}"?`)) return;
    const { error } = await supabase.from('documentos').delete().eq('id', d.id);
    if (error) { alert('Sem permissão.'); return; }
    if (d.arquivo_path) await apagarArquivo(d.arquivo_path);
    setDocs(ds => ds.filter(x => x.id !== d.id));
  }

  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="kpi blu"><div className="lbl">Documentos</div><div className="val">{docs.length}</div></div>
        <div className="kpi acc"><div className="lbl">Vencidos</div><div className="val">{vencidos.length}</div><div className="foot">Cl. 13.3: autoriza reter medição</div></div>
        <div className="kpi wrn"><div className="lbl">Vencendo em 30 dias</div><div className="val">{vencendo.length}</div></div>
        <div className="kpi"><div className="lbl">Sem arquivo anexado</div><div className="val">{semArquivo.length}</div></div>
      </div>

      {vencidos.length > 0 && (
        <div className="alert risk" style={{ marginTop: 12 }}>
          <b>⚠ {vencidos.length} documento(s) vencido(s)</b>
          A ausência ou irregularidade de documento autoriza a contratante a suspender medições e reter pagamentos (Cl. 13.3). Regularize antes da próxima medição.
        </div>
      )}

      <div className="panel">
        <div className="hd">
          <h3>Documentos contratuais e de regularidade</h3>
          <button className="btn" onClick={() => setNovo(n => !n)}>{novo ? 'Fechar' : '+ Novo documento'}</button>
        </div>

        {novo && (
          <div className="bd" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="form-grid">
              <div className="fg"><label>Tipo</label>
                <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>
                  {Object.entries(TIPOS_DOC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
              <div className="fg"><label>Obra</label>
                <select value={f.obra_id} onChange={e => setF({ ...f, obra_id: e.target.value })}>
                  <option value="">Empresa (todas)</option>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.codigo}</option>)}
                </select></div>
              <div className="fg" style={{ gridColumn: 'span 2' }}><label>Título</label><input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: Certidão de regularidade do FGTS" /></div>
              <div className="fg"><label>Emissor</label><input value={f.emissor} onChange={e => setF({ ...f, emissor: e.target.value })} /></div>
              <div className="fg"><label>Número</label><input value={f.numero} onChange={e => setF({ ...f, numero: e.target.value })} /></div>
              <div className="fg"><label>Emissão</label><input type="date" value={f.emissao} onChange={e => setF({ ...f, emissao: e.target.value })} /></div>
              <div className="fg"><label>Validade</label><input type="date" value={f.validade} onChange={e => setF({ ...f, validade: e.target.value })} /></div>
              <div className="fg"><label>Cláusula de referência</label><input value={f.clausula} onChange={e => setF({ ...f, clausula: e.target.value })} placeholder="Ex.: Cl. 13.2" /></div>
              <div className="fg" style={{ gridColumn: 'span 2' }}><label>Arquivo (opcional)</label><input type="file" onChange={e => setArquivo(e.target.files?.[0] ?? null)} /></div>
              <div className="fg" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={criar} disabled={ocupado}>{ocupado ? 'Enviando…' : 'Cadastrar'}</button></div>
            </div>
          </div>
        )}

        <div className="bd tblwrap">
          <p className="hint" style={{ marginBottom: 10 }}>Documentos com validade entram automaticamente no <b>Meu Dia</b> 30 dias antes de vencer.</p>
          <table>
            <thead><tr><th>Documento</th><th>Tipo</th><th>Obra</th><th className="num">Validade</th><th>Situação</th><th>Arquivo</th><th>Ações</th></tr></thead>
            <tbody>
              {docs.map(d => {
                const s = validadeSit(d.validade);
                return (
                  <tr key={d.id} style={s.dias !== null && s.dias < 0 ? { background: 'var(--risk-soft)' } : undefined}>
                    <td><b>{d.titulo}</b><div className="hint">{d.emissor ?? '—'}{d.numero ? ` · nº ${d.numero}` : ''}{d.clausula ? ' · ' : ''}{d.clausula && <span className="clause">{d.clausula}</span>}</div></td>
                    <td>{TIPOS_DOC[d.tipo] ?? d.tipo}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{obraCod(d.obra_id)}</td>
                    <td className="num">{fmtData(d.validade)}</td>
                    <td><span className={`stamp ${s.cls}`}><span className="dot" />{s.rotulo}</span></td>
                    <td>
                      {d.arquivo_path
                        ? <><button className="mini" onClick={() => baixarArquivo(d.arquivo_path)}>abrir</button> <span className="hint" style={{ fontSize: 11 }}>{fmtTamanho(d.arquivo_tamanho)}</span></>
                        : <label className="mini" style={{ display: 'inline-block' }}>📎 anexar
                            <input type="file" disabled={ocupado} onChange={e => { const file = e.target.files?.[0]; if (file) anexarEm(d, file); }} style={{ display: 'none' }} />
                          </label>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="mini" onClick={() => editarValidade(d)}>validade</button>{' '}
                      <button className="mini danger" onClick={() => excluir(d)}>×</button>
                    </td>
                  </tr>
                );
              })}
              {docs.length === 0 && <tr><td colSpan={7} className="hint">Nenhum documento cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
