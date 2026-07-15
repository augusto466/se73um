'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtBRL, fmtPct, fmtData } from '@/lib/contrato';
import { parseNum } from '@/lib/financeiro';

const fmtValor = (v: number, un: string) =>
  un === 'moeda' ? fmtBRL(v) : un === 'percentual' ? fmtPct(v) : un === 'dias' ? `${Math.round(v)} dias` : String(Math.round(v));

export default function MetasClient({ metasIniciais, obras, pessoas, papel }:
  { metasIniciais: any[]; obras: any[]; pessoas: any[]; papel: string }) {
  const [metas, setMetas] = useState(metasIniciais);
  const [nova, setNova] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const supabase = supabaseBrowser();
  const ehAdmin = papel === 'admin';
  const hoje = new Date().toISOString().slice(0, 10);

  const [f, setF] = useState({
    titulo: '', descricao: '', obra_id: '', unidade: 'numero', alvo: '', direcao: 'maior',
    periodo_inicio: hoje, periodo_fim: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    responsavel_id: '',
  });

  const atingimento = (m: any) => {
    const alvo = Number(m.alvo), real = Number(m.realizado);
    if (!alvo) return 0;
    return m.direcao === 'maior' ? real / alvo * 100 : (alvo / (real || alvo)) * 100;
  };
  const noAlvo = metas.filter(m => atingimento(m) >= 100).length;

  async function criar() {
    if (!f.titulo.trim() || !f.alvo) { alert('Informe título e alvo.'); return; }
    setOcupado(true);
    const { data, error } = await supabase.from('metas').insert({
      titulo: f.titulo.trim(), descricao: f.descricao.trim() || null,
      obra_id: f.obra_id ? Number(f.obra_id) : null, unidade: f.unidade,
      alvo: parseNum(f.alvo), direcao: f.direcao,
      periodo_inicio: f.periodo_inicio, periodo_fim: f.periodo_fim,
      responsavel_id: f.responsavel_id || null, fonte: 'manual',
    }).select().single();
    setOcupado(false);
    if (error) { alert(error.message); return; }
    setMetas(m => [...m, data]);
    setF({ ...f, titulo: '', descricao: '', alvo: '' });
    setNova(false);
  }

  async function atualizarRealizado(m: any) {
    const v = prompt(`Realizado atual de "${m.titulo}":`, String(m.realizado ?? 0).replace('.', ','));
    if (v === null) return;
    const n = parseNum(v);
    const { error } = await supabase.from('metas').update({ realizado: n }).eq('id', m.id);
    if (error) { alert(error.message); return; }
    setMetas(ms => ms.map(x => x.id === m.id ? { ...x, realizado: n } : x));
  }

  async function excluir(m: any) {
    if (!confirm(`Excluir a meta "${m.titulo}"?`)) return;
    const { error } = await supabase.from('metas').delete().eq('id', m.id);
    if (error) { alert(error.message); return; }
    setMetas(ms => ms.filter(x => x.id !== m.id));
  }

  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="kpi blu"><div className="lbl">Metas acompanhadas</div><div className="val">{metas.length}</div></div>
        <div className="kpi okk"><div className="lbl">No alvo</div><div className="val">{noAlvo}</div><div className="foot">atingimento ≥ 100%</div></div>
        <div className="kpi acc"><div className="lbl">Abaixo do alvo</div><div className="val">{metas.length - noAlvo}</div></div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="hd">
          <h3>Metas e indicadores</h3>
          {ehAdmin && <button className="btn" onClick={() => setNova(n => !n)}>{nova ? 'Fechar' : '+ Nova meta'}</button>}
        </div>

        {nova && ehAdmin && (
          <div className="bd" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="form-grid">
              <div className="fg" style={{ gridColumn: 'span 2' }}><label>Título</label>
                <input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: Prazo médio de resposta a pendências" /></div>
              <div className="fg"><label>Obra</label>
                <select value={f.obra_id} onChange={e => setF({ ...f, obra_id: e.target.value })}>
                  <option value="">Empresa (geral)</option>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.codigo}</option>)}
                </select></div>
              <div className="fg"><label>Responsável</label>
                <select value={f.responsavel_id} onChange={e => setF({ ...f, responsavel_id: e.target.value })}>
                  <option value="">— não definido —</option>
                  {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome ?? p.email}</option>)}
                </select></div>
              <div className="fg"><label>Unidade</label>
                <select value={f.unidade} onChange={e => setF({ ...f, unidade: e.target.value })}>
                  <option value="numero">Número</option><option value="percentual">Percentual</option>
                  <option value="moeda">R$</option><option value="dias">Dias</option>
                </select></div>
              <div className="fg"><label>Alvo</label><input value={f.alvo} onChange={e => setF({ ...f, alvo: e.target.value })} placeholder="0" /></div>
              <div className="fg"><label>Direção</label>
                <select value={f.direcao} onChange={e => setF({ ...f, direcao: e.target.value })}>
                  <option value="maior">Quanto maior, melhor</option><option value="menor">Quanto menor, melhor</option>
                </select></div>
              <div className="fg"><label>Início</label><input type="date" value={f.periodo_inicio} onChange={e => setF({ ...f, periodo_inicio: e.target.value })} /></div>
              <div className="fg"><label>Fim</label><input type="date" value={f.periodo_fim} onChange={e => setF({ ...f, periodo_fim: e.target.value })} /></div>
              <div className="fg" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={criar} disabled={ocupado}>Criar meta</button></div>
            </div>
          </div>
        )}

        <div className="bd">
          <p className="hint" style={{ marginBottom: 12 }}>Metas <b>automáticas</b> são calculadas pelo sistema a partir dos dados reais. As <b>manuais</b> você atualiza clicando no valor.</p>
          <div className="metas-grid">
            {metas.map(m => {
              const at = atingimento(m);
              const cor = at >= 100 ? 'var(--ok)' : at >= 70 ? 'var(--warn)' : 'var(--risk)';
              const vencida = m.periodo_fim < hoje;
              return (
                <div key={m.id} className="panel meta-card">
                  <div className="bd">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.titulo}</div>
                        <div className="hint">
                          {m.obra_id ? (obras.find(o => o.id === m.obra_id)?.codigo ?? '—') : 'Empresa'} ·{' '}
                          {m.fonte === 'automatica' ? '⚙ automática' : '✎ manual'} · até {fmtData(m.periodo_fim)}
                          {vencida ? ' · encerrada' : ''}
                        </div>
                      </div>
                      {ehAdmin && <button className="mini danger" onClick={() => excluir(m)}>×</button>}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '12px 0 6px' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: cor }}>
                        {fmtValor(Number(m.realizado), m.unidade)}
                      </span>
                      <span className="hint">de {fmtValor(Number(m.alvo), m.unidade)}</span>
                    </div>

                    <div className="bar" style={{ height: 10 }}>
                      <i style={{ width: `${Math.min(100, at)}%`, background: cor }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                      <span className="hint" style={{ color: cor, fontWeight: 600 }}>{fmtPct(at)} do alvo</span>
                      {m.fonte === 'manual' && ehAdmin && <button className="mini" onClick={() => atualizarRealizado(m)}>atualizar</button>}
                    </div>
                    {m.descricao && <p className="hint" style={{ marginTop: 8 }}>{m.descricao}</p>}
                  </div>
                </div>
              );
            })}
            {metas.length === 0 && <p className="hint">Nenhuma meta cadastrada.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
