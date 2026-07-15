'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtData, fmtPct } from '@/lib/contrato';

const FREQ: Record<string, string> = {
  diaria: 'Diária (dias úteis)', semanal: 'Semanal', quinzenal: 'Quinzenal',
  mensal: 'Mensal', trimestral: 'Trimestral',
};
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function RotinasClient({ rotinasIniciais, ocorrencias, obras, pessoas, papel }:
  { rotinasIniciais: any[]; ocorrencias: any[]; obras: any[]; pessoas: any[]; papel: string }) {
  const [rotinas, setRotinas] = useState(rotinasIniciais);
  const [ocs, setOcs] = useState(ocorrencias);
  const [novo, setNovo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const supabase = supabaseBrowser();
  const podeGerir = ['admin', 'contratante'].includes(papel);
  const hoje = new Date().toISOString().slice(0, 10);

  const [f, setF] = useState({
    titulo: '', detalhe: '', obra_id: '', frequencia: 'semanal',
    dia_semana: '1', dia_mes: '5', prioridade: 'media', responsavel_id: '',
  });

  const pendentes = ocs.filter(o => o.status === 'pendente');
  const noPrazo = ocs.filter(o => o.status === 'concluida' && o.concluida_em && o.concluida_em.slice(0, 10) <= o.vencimento).length;
  const concluidas = ocs.filter(o => o.status === 'concluida').length;
  const aderencia = concluidas ? noPrazo / concluidas * 100 : 0;

  async function criar() {
    if (!f.titulo.trim()) { alert('Informe o título da rotina.'); return; }
    setOcupado(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('rotinas').insert({
      titulo: f.titulo.trim(), detalhe: f.detalhe.trim() || null,
      obra_id: f.obra_id ? Number(f.obra_id) : null,
      frequencia: f.frequencia,
      dia_semana: ['semanal', 'quinzenal'].includes(f.frequencia) ? Number(f.dia_semana) : null,
      dia_mes: ['mensal', 'trimestral'].includes(f.frequencia) ? Number(f.dia_mes) : null,
      prioridade: f.prioridade, responsavel_id: f.responsavel_id || null, criado_por: user?.id,
    }).select().single();
    setOcupado(false);
    if (error) { alert(error.message); return; }
    setRotinas(r => [...r, data]);
    setF({ ...f, titulo: '', detalhe: '' });
    setNovo(false);
  }

  async function alternar(r: any) {
    const { error } = await supabase.from('rotinas').update({ ativo: !r.ativo }).eq('id', r.id);
    if (!error) setRotinas(rs => rs.map(x => x.id === r.id ? { ...x, ativo: !x.ativo } : x));
  }

  async function gerar() {
    setOcupado(true);
    const { data, error } = await supabase.rpc('gerar_ocorrencias', { p_dias: 30 });
    setOcupado(false);
    if (error) { alert(error.message); return; }
    alert(`${data} ocorrência(s) gerada(s) para os próximos 30 dias.`);
    location.reload();
  }

  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="kpi blu"><div className="lbl">Rotinas ativas</div><div className="val">{rotinas.filter(r => r.ativo).length}</div></div>
        <div className="kpi wrn"><div className="lbl">Ocorrências pendentes</div><div className="val">{pendentes.length}</div></div>
        <div className="kpi acc"><div className="lbl">Atrasadas</div><div className="val">{pendentes.filter(o => o.vencimento < hoje).length}</div></div>
        <div className="kpi okk"><div className="lbl">Aderência (concluídas no prazo)</div><div className="val">{fmtPct(aderencia)}</div><div className="foot">{noPrazo} de {concluidas}</div></div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="hd">
          <h3>Rotinas cadastradas</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {podeGerir && <button className="btn sec" onClick={gerar} disabled={ocupado}>Gerar ocorrências (30 dias)</button>}
            {podeGerir && <button className="btn" onClick={() => setNovo(n => !n)}>{novo ? 'Fechar' : '+ Nova rotina'}</button>}
          </div>
        </div>

        {novo && podeGerir && (
          <div className="bd" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="form-grid">
              <div className="fg" style={{ gridColumn: 'span 2' }}><label>Título</label>
                <input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: Enviar medição para aprovação" /></div>
              <div className="fg"><label>Obra</label>
                <select value={f.obra_id} onChange={e => setF({ ...f, obra_id: e.target.value })}>
                  <option value="">Empresa (todas)</option>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.codigo}</option>)}
                </select></div>
              <div className="fg"><label>Responsável</label>
                <select value={f.responsavel_id} onChange={e => setF({ ...f, responsavel_id: e.target.value })}>
                  <option value="">— não definido —</option>
                  {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome ?? p.email}</option>)}
                </select></div>
              <div className="fg"><label>Frequência</label>
                <select value={f.frequencia} onChange={e => setF({ ...f, frequencia: e.target.value })}>
                  {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
              {['semanal', 'quinzenal'].includes(f.frequencia) && (
                <div className="fg"><label>Dia da semana</label>
                  <select value={f.dia_semana} onChange={e => setF({ ...f, dia_semana: e.target.value })}>
                    {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select></div>
              )}
              {['mensal', 'trimestral'].includes(f.frequencia) && (
                <div className="fg"><label>Dia do mês</label>
                  <input type="number" min={1} max={28} value={f.dia_mes} onChange={e => setF({ ...f, dia_mes: e.target.value })} /></div>
              )}
              <div className="fg"><label>Prioridade</label>
                <select value={f.prioridade} onChange={e => setF({ ...f, prioridade: e.target.value })}>
                  <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
                </select></div>
              <div className="fg full"><label>Detalhe</label>
                <input value={f.detalhe} onChange={e => setF({ ...f, detalhe: e.target.value })} placeholder="O que precisa ser feito, referência contratual..." /></div>
              <div className="fg" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={criar} disabled={ocupado}>Cadastrar rotina</button></div>
            </div>
          </div>
        )}

        <div className="bd tblwrap">
          <p className="hint" style={{ marginBottom: 10 }}>Rotinas geram ocorrências automáticas que aparecem em <b>Meu Dia</b>. Clique em "Gerar ocorrências" após cadastrar novas.</p>
          <table>
            <thead><tr><th>Rotina</th><th>Obra</th><th>Frequência</th><th>Responsável</th><th>Prioridade</th><th>Situação</th>{podeGerir && <th>Ação</th>}</tr></thead>
            <tbody>
              {rotinas.map(r => (
                <tr key={r.id} style={!r.ativo ? { opacity: .5 } : undefined}>
                  <td><b>{r.titulo}</b>{r.detalhe && <div className="hint">{r.detalhe}</div>}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{r.obra_id ? (obras.find(o => o.id === r.obra_id)?.codigo ?? '—') : 'Empresa'}</td>
                  <td>{FREQ[r.frequencia]}{r.dia_semana != null ? ` · ${DIAS[r.dia_semana]}` : ''}{r.dia_mes ? ` · dia ${r.dia_mes}` : ''}</td>
                  <td>{pessoas.find(p => p.id === r.responsavel_id)?.nome ?? '—'}</td>
                  <td>{r.prioridade === 'alta' ? <span className="stamp st-risk">ALTA</span> : r.prioridade === 'media' ? <span className="stamp st-valid">MÉDIA</span> : <span className="stamp st-pend">BAIXA</span>}</td>
                  <td>{r.ativo ? <span className="stamp st-ok"><span className="dot" />ATIVA</span> : <span className="stamp st-pend"><span className="dot" />PAUSADA</span>}</td>
                  {podeGerir && <td><button className="mini" onClick={() => alternar(r)}>{r.ativo ? 'pausar' : 'reativar'}</button></td>}
                </tr>
              ))}
              {rotinas.length === 0 && <tr><td colSpan={podeGerir ? 7 : 6} className="hint">Nenhuma rotina cadastrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="hd"><h3>Histórico recente de ocorrências</h3></div>
        <div className="bd tblwrap">
          <table>
            <thead><tr><th className="num">Vencimento</th><th>Rotina</th><th>Status</th><th>Concluída em</th></tr></thead>
            <tbody>
              {ocs.slice(0, 30).sort((a, b) => b.vencimento.localeCompare(a.vencimento)).map(o => {
                const r = rotinas.find(x => x.id === o.rotina_id);
                const atras = o.status === 'pendente' && o.vencimento < hoje;
                return (
                  <tr key={o.id} style={atras ? { background: 'var(--risk-soft)' } : undefined}>
                    <td className="num">{fmtData(o.vencimento)}</td>
                    <td>{r?.titulo ?? '—'}</td>
                    <td>{o.status === 'concluida'
                      ? <span className="stamp st-ok"><span className="dot" />CONCLUÍDA</span>
                      : atras ? <span className="stamp st-risk"><span className="dot" />ATRASADA</span>
                      : <span className="stamp st-pend"><span className="dot" />PENDENTE</span>}</td>
                    <td className="num">{o.concluida_em ? fmtData(o.concluida_em.slice(0, 10)) : '—'}</td>
                  </tr>
                );
              })}
              {ocs.length === 0 && <tr><td colSpan={4} className="hint">Nenhuma ocorrência gerada ainda. Clique em "Gerar ocorrências (30 dias)".</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
