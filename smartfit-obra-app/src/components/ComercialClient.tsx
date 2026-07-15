'use client';
import { useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtBRL, fmtData } from '@/lib/contrato';

const ESTAGIOS = [
  { id: 'contato',    label: 'Contato',    prob: 10 },
  { id: 'premissas',  label: 'Premissas',  prob: 25 },
  { id: 'orcamento',  label: 'Orçamento',  prob: 40 },
  { id: 'proposta',   label: 'Proposta',   prob: 60 },
  { id: 'negociacao', label: 'Negociação', prob: 80 },
];
const ORIGENS: Record<string, string> = {
  indicacao: 'Indicação', rfp_rede: 'RFP de rede', prospeccao: 'Prospecção ativa',
  recorrente: 'Cliente recorrente', outro: 'Outro',
};

export default function ComercialClient({ iniciais, ganhas, perdidas }:
  { iniciais: any[]; ganhas: any[]; perdidas: any[] }) {
  const [ops, setOps] = useState(iniciais);
  const [nova, setNova] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [f, setF] = useState({ titulo: '', cliente: '', origem: 'indicacao', tipo_obra: 'galpao_metalico', local: '', valor_estimado: '', data_decisao: '', prazo_proposta: '' });
  const supabase = supabaseBrowser();

  const funil = useMemo(() => ESTAGIOS.map(e => {
    const lista = ops.filter(o => o.estagio === e.id);
    const valor = lista.reduce((s, o) => s + Number(o.valor_estimado || 0), 0);
    const pond = lista.reduce((s, o) => s + Number(o.valor_estimado || 0) * Number(o.probabilidade) / 100, 0);
    return { ...e, lista, valor, pond };
  }), [ops]);

  const totalPond = funil.reduce((s, e) => s + e.pond, 0);
  const totalPipe = funil.reduce((s, e) => s + e.valor, 0);
  const taxaGanho = (ganhas.length + perdidas.length) > 0
    ? Math.round(ganhas.length / (ganhas.length + perdidas.length) * 100) : null;

  async function criar() {
    if (!f.titulo.trim() || !f.cliente.trim()) { alert('Informe o título e o cliente.'); return; }
    setOcupado(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ano = new Date().getFullYear();
      const { count } = await supabase.from('oportunidades').select('*', { count: 'exact', head: true });
      const codigo = `OP-${ano}-${String((count ?? 0) + 1).padStart(3, '0')}`;
      const { data, error } = await supabase.from('oportunidades').insert({
        codigo, titulo: f.titulo.trim(), cliente: f.cliente.trim(), origem: f.origem,
        tipo_obra: f.tipo_obra, local: f.local || null,
        valor_estimado: f.valor_estimado ? Number(f.valor_estimado) : null,
        data_decisao: f.data_decisao || null, prazo_proposta: f.prazo_proposta || null,
        responsavel_id: user?.id, criado_por: user?.id, probabilidade: 10,
      }).select().single();
      if (error) throw new Error(error.message);
      setOps(o => [data, ...o]);
      setF({ ...f, titulo: '', cliente: '', local: '', valor_estimado: '', data_decisao: '', prazo_proposta: '' });
      setNova(false);
    } catch (e: any) { alert(e.message); }
    setOcupado(false);
  }

  async function mover(op: any, estagio: string) {
    const prob = ESTAGIOS.find(e => e.id === estagio)?.prob ?? op.probabilidade;
    const { error } = await supabase.from('oportunidades')
      .update({ estagio, probabilidade: prob, atualizado_em: new Date().toISOString() }).eq('id', op.id);
    if (error) { alert(error.message); return; }
    setOps(l => l.map(x => x.id === op.id ? { ...x, estagio, probabilidade: prob } : x));
  }

  async function perder(op: any) {
    const motivo = prompt(`Por que perdeu "${op.titulo}"?\n\nO motivo alimenta a análise do advisor — seja específico.`);
    if (!motivo) return;
    const { error } = await supabase.from('oportunidades')
      .update({ estagio: 'perdida', probabilidade: 0, motivo_perda: motivo }).eq('id', op.id);
    if (error) { alert(error.message); return; }
    setOps(l => l.filter(x => x.id !== op.id));
  }

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <>
      <section className="cock-hero">
        <div className="saud">Comercial</div>
        <div className="resumo">
          {ops.length ? <>{ops.length} oportunidade(s) em jogo · <b>{fmtBRL(totalPond)}</b> ponderado de <b>{fmtBRL(totalPipe)}</b> em pipeline.</>
                      : <>Pipeline vazio. Toda margem começa aqui.</>}
        </div>
        <div className="cock-strip">
          <div className="it"><div className="n">{ops.length}</div><div className="l">Em aberto</div></div>
          <div className="it"><div className="n" style={{ fontSize: 15 }}>{fmtBRL(totalPond)}</div><div className="l">Ponderado</div></div>
          <div className="it"><div className="n">{ganhas.length}</div><div className="l">Assinadas</div></div>
          <div className={`it ${taxaGanho !== null && taxaGanho < 30 ? 'risco' : ''}`}>
            <div className="n">{taxaGanho !== null ? `${taxaGanho}%` : '—'}</div><div className="l">Taxa de ganho</div>
          </div>
        </div>
      </section>

      <div className="panel">
        <div className="hd">
          <h3>Funil</h3>
          <button className="btn" onClick={() => setNova(n => !n)}>{nova ? 'Fechar' : '+ Nova oportunidade'}</button>
        </div>

        {nova && (
          <div className="bd" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="form-grid">
              <div className="fg"><label>Título</label>
                <input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: BTS Smart Fit — Setor Bueno" /></div>
              <div className="fg"><label>Cliente</label>
                <input value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} /></div>
              <div className="fg"><label>Origem</label>
                <select value={f.origem} onChange={e => setF({ ...f, origem: e.target.value })}>
                  {Object.entries(ORIGENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
              <div className="fg"><label>Tipo de obra</label>
                <select value={f.tipo_obra} onChange={e => setF({ ...f, tipo_obra: e.target.value })}>
                  <option value="galpao_metalico">Galpão metálico</option>
                  <option value="bts_academia">BTS academia</option>
                  <option value="estrutura_avulsa">Estrutura avulsa</option>
                  <option value="servico">Serviço</option>
                </select></div>
              <div className="fg"><label>Local</label>
                <input value={f.local} onChange={e => setF({ ...f, local: e.target.value })} /></div>
              <div className="fg"><label>Valor estimado (R$)</label>
                <input type="number" value={f.valor_estimado} onChange={e => setF({ ...f, valor_estimado: e.target.value })} placeholder="chute inicial, refina depois" /></div>
              <div className="fg"><label>Prazo p/ entregar a proposta</label>
                <input type="date" value={f.prazo_proposta} onChange={e => setF({ ...f, prazo_proposta: e.target.value })} /></div>
              <div className="fg"><label>Decisão do cliente</label>
                <input type="date" value={f.data_decisao} onChange={e => setF({ ...f, data_decisao: e.target.value })} /></div>
            </div>
            <button className="btn" style={{ marginTop: 10 }} disabled={ocupado} onClick={criar}>
              {ocupado ? 'criando…' : 'Criar oportunidade'}
            </button>
          </div>
        )}

        <div className="bd">
          <div className="funil">
            {funil.map(e => (
              <div key={e.id} className="fase">
                <div className="fase-hd">
                  <span>{e.label}</span>
                  <span className="hint">{e.lista.length}</span>
                </div>
                <div className="fase-v">{e.valor ? fmtBRL(e.valor) : '—'}</div>
                <div className="fase-itens">
                  {e.lista.map(o => {
                    const atrasada = o.prazo_proposta && o.prazo_proposta < hoje && ['contato','premissas','orcamento'].includes(o.estagio);
                    return (
                      <div key={o.id} className={`op ${atrasada ? 'atraso' : ''}`}>
                        <a href={`/comercial/${o.id}`} className="op-t">{o.titulo}</a>
                        <div className="hint">{o.cliente} · {ORIGENS[o.origem]}</div>
                        {o.valor_estimado > 0 && <div className="op-v">{fmtBRL(o.valor_estimado)}</div>}
                        {atrasada && <div className="op-al">proposta vencida em {fmtData(o.prazo_proposta)}</div>}
                        <div className="op-acoes">
                          <select value={o.estagio} onChange={ev => mover(o, ev.target.value)}>
                            {ESTAGIOS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                          </select>
                          <button className="mini" onClick={() => perder(o)} title="Marcar como perdida">✕</button>
                        </div>
                      </div>
                    );
                  })}
                  {!e.lista.length && <div className="hint" style={{ padding: '8px 0' }}>—</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {(ganhas.length > 0 || perdidas.length > 0) && (
        <div className="panel">
          <div className="hd"><h3>Fechadas</h3></div>
          <div className="bd">
            <table className="tab">
              <thead><tr><th>Oportunidade</th><th>Cliente</th><th></th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
              <tbody>
                {ganhas.map(o => (
                  <tr key={o.id}>
                    <td><a href={`/comercial/${o.id}`}>{o.titulo}</a></td>
                    <td>{o.cliente}</td>
                    <td><span className="st st-ok">ASSINADA</span></td>
                    <td style={{ textAlign: 'right' }}>{fmtBRL(o.valor_estimado)}</td>
                  </tr>
                ))}
                {perdidas.map(o => (
                  <tr key={o.id} style={{ opacity: .65 }}>
                    <td><a href={`/comercial/${o.id}`}>{o.titulo}</a></td>
                    <td>{o.cliente}</td>
                    <td><span className="st st-risk">PERDIDA</span> <span className="hint">{o.motivo_perda}</span></td>
                    <td style={{ textAlign: 'right' }}>{fmtBRL(o.valor_estimado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
