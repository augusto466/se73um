'use client';
import { useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtData } from '@/lib/contrato';
import { DISCIPLINAS, subirArquivo, baixarArquivo, apagarArquivo, fmtTamanho, indexarNoAcervo } from '@/lib/arquivos';

export default function ProjetosClient({ projetosIniciais, obraId, papel }:
  { projetosIniciais: any[]; obraId: number; papel: string }) {
  const [projs, setProjs] = useState(projetosIniciais);
  const [novo, setNovo] = useState(false);
  const [verObsoletos, setVerObsoletos] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const supabase = supabaseBrowser();
  const ehAdmin = papel === 'admin';

  const [f, setF] = useState({
    disciplina: DISCIPLINAS[0], codigo: '', titulo: '', revisao: 'R00',
    data_emissao: new Date().toISOString().slice(0, 10), responsavel_tecnico: '', art_rrt: '', observacoes: '',
  });

  const vigentes = projs.filter(p => p.vigente);
  const obsoletos = projs.filter(p => !p.vigente);
  const lista = useMemo(() => {
    const base = verObsoletos ? projs : vigentes;
    return filtro ? base.filter(p => p.disciplina === filtro) : base;
  }, [projs, vigentes, verObsoletos, filtro]);

  const porDisciplina = useMemo(() => {
    const m: Record<string, any[]> = {};
    lista.forEach(p => { (m[p.disciplina] ??= []).push(p); });
    return m;
  }, [lista]);

  async function criar() {
    if (!f.titulo.trim()) { alert('Informe o título do projeto.'); return; }
    if (!arquivo) { alert('Selecione o arquivo do projeto.'); return; }
    setOcupado(true);
    try {
      const up = await subirArquivo(arquivo, `projetos/${obraId}`);
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('projetos').insert({
        obra_id: obraId, disciplina: f.disciplina, codigo: f.codigo.trim() || null,
        titulo: f.titulo.trim(), revisao: f.revisao.trim().toUpperCase() || 'R00',
        arquivo_path: up.path, arquivo_nome: up.nome, arquivo_tamanho: up.tamanho,
        data_emissao: f.data_emissao || null, responsavel_tecnico: f.responsavel_tecnico.trim() || null,
        art_rrt: f.art_rrt.trim() || null, observacoes: f.observacoes.trim() || null,
        vigente: true, criado_por: user?.id,
      }).select().single();
      if (error) throw new Error(error.message);
      indexarNoAcervo('projeto', data.id);
      // recarrega para refletir o trigger que obsoleta as anteriores
      const { data: todos } = await supabase.from('projetos').select('*').eq('obra_id', obraId)
        .order('disciplina').order('codigo').order('criado_em', { ascending: false });
      setProjs(todos ?? [data]);
      setF({ ...f, codigo: '', titulo: '', revisao: 'R00', art_rrt: '', observacoes: '' });
      setArquivo(null); setNovo(false);
    } catch (e: any) { alert(e.message); }
    setOcupado(false);
  }

  async function excluir(p: any) {
    if (!confirm(`Excluir "${p.titulo} ${p.revisao}"? O arquivo será removido.`)) return;
    const { error } = await supabase.from('projetos').delete().eq('id', p.id);
    if (error) { alert('Sem permissão (só admin ou quem enviou).'); return; }
    if (p.arquivo_path) await apagarArquivo(p.arquivo_path);
    setProjs(ps => ps.filter(x => x.id !== p.id));
  }

  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="kpi blu"><div className="lbl">Projetos vigentes</div><div className="val">{vigentes.length}</div></div>
        <div className="kpi"><div className="lbl">Disciplinas</div><div className="val">{new Set(vigentes.map(p => p.disciplina)).size}</div></div>
        <div className="kpi wrn"><div className="lbl">Revisões obsoletas</div><div className="val">{obsoletos.length}</div><div className="foot">arquivadas, não executar</div></div>
        <div className="kpi okk"><div className="lbl">Com ART/RRT</div><div className="val">{vigentes.filter(p => p.art_rrt).length}</div><div className="foot">de {vigentes.length}</div></div>
      </div>

      <div className="alert info" style={{ marginTop: 12 }}>
        <b>📐 Sempre execute pela revisão vigente</b>
        Ao subir uma revisão nova do mesmo projeto (mesma disciplina e código), a anterior é marcada como <b>obsoleta</b> automaticamente e sai da lista principal.
      </div>

      <div className="panel">
        <div className="hd">
          <h3>Biblioteca de projetos</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="hint" style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <input type="checkbox" checked={verObsoletos} onChange={e => setVerObsoletos(e.target.checked)} />
              mostrar obsoletos
            </label>
            <select value={filtro} onChange={e => setFiltro(e.target.value)}
              style={{ border: '1px solid var(--line-strong)', borderRadius: 4, padding: '6px 8px', background: 'var(--paper)' }}>
              <option value="">Todas as disciplinas</option>
              {DISCIPLINAS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <button className="btn" onClick={() => setNovo(n => !n)}>{novo ? 'Fechar' : '+ Enviar projeto / revisão'}</button>
          </div>
        </div>

        {novo && (
          <div className="bd" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="form-grid">
              <div className="fg"><label>Disciplina</label>
                <select value={f.disciplina} onChange={e => setF({ ...f, disciplina: e.target.value })}>
                  {DISCIPLINAS.map(d => <option key={d} value={d}>{d}</option>)}
                </select></div>
              <div className="fg"><label>Código</label><input value={f.codigo} onChange={e => setF({ ...f, codigo: e.target.value })} placeholder="Ex.: EST-03" /></div>
              <div className="fg" style={{ gridColumn: 'span 2' }}><label>Título</label><input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: Planta de fôrmas — pavimento térreo" /></div>
              <div className="fg"><label>Revisão</label><input value={f.revisao} onChange={e => setF({ ...f, revisao: e.target.value })} placeholder="R00" /></div>
              <div className="fg"><label>Data de emissão</label><input type="date" value={f.data_emissao} onChange={e => setF({ ...f, data_emissao: e.target.value })} /></div>
              <div className="fg"><label>Responsável técnico</label><input value={f.responsavel_tecnico} onChange={e => setF({ ...f, responsavel_tecnico: e.target.value })} /></div>
              <div className="fg"><label>ART / RRT</label><input value={f.art_rrt} onChange={e => setF({ ...f, art_rrt: e.target.value })} /></div>
              <div className="fg" style={{ gridColumn: 'span 2' }}><label>Arquivo (PDF, DWG, imagem — até 50 MB)</label>
                <input type="file" onChange={e => setArquivo(e.target.files?.[0] ?? null)} /></div>
              <div className="fg" style={{ gridColumn: 'span 2' }}><label>Observações</label><input value={f.observacoes} onChange={e => setF({ ...f, observacoes: e.target.value })} placeholder="O que mudou nesta revisão..." /></div>
              <div className="fg" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={criar} disabled={ocupado}>{ocupado ? 'Enviando…' : 'Enviar'}</button></div>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>Para publicar uma revisão, use a <b>mesma disciplina e código</b> e informe a nova revisão (ex.: R01).</p>
          </div>
        )}

        <div className="bd">
          {Object.keys(porDisciplina).length === 0 && <p className="hint">Nenhum projeto enviado nesta obra.</p>}
          {Object.entries(porDisciplina).map(([disc, itens]) => (
            <div key={disc} style={{ marginBottom: 18 }}>
              <h2 className="sec" style={{ marginTop: 0 }}>{disc} · {itens.length}</h2>
              <div className="tblwrap"><table>
                <thead><tr><th>Código</th><th>Título</th><th>Revisão</th><th className="num">Emissão</th><th>RT / ART</th><th className="num">Arquivo</th><th>Ações</th></tr></thead>
                <tbody>
                  {itens.map(p => (
                    <tr key={p.id} className={!p.vigente ? 'obsoleta' : ''}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{p.codigo ?? '—'}</td>
                      <td><b>{p.titulo}</b>{p.observacoes && <div className="hint">{p.observacoes}</div>}</td>
                      <td>
                        <span className="tag-rev">{p.revisao}</span>{' '}
                        {p.vigente
                          ? <span className="stamp st-ok"><span className="dot" />VIGENTE</span>
                          : <span className="stamp st-risk"><span className="dot" />OBSOLETA</span>}
                      </td>
                      <td className="num">{fmtData(p.data_emissao)}</td>
                      <td className="hint">{p.responsavel_tecnico ?? '—'}{p.art_rrt ? ` · ${p.art_rrt}` : ''}</td>
                      <td className="num">{fmtTamanho(p.arquivo_tamanho)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {p.arquivo_path && <button className="mini" onClick={() => baixarArquivo(p.arquivo_path)}>abrir</button>}{' '}
                        <button className="mini danger" onClick={() => excluir(p)}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
