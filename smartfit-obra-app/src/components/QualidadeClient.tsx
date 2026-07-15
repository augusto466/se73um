'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtData, fmtPct } from '@/lib/contrato';
import Anexos from './Anexos';

const RES: Record<string, [string, string]> = {
  em_andamento: ['EM ANDAMENTO', 'st-exec'],
  aprovado: ['APROVADO', 'st-ok'],
  aprovado_ressalvas: ['APROVADO C/ RESSALVAS', 'st-valid'],
  reprovado: ['REPROVADO', 'st-risk'],
};

export default function QualidadeClient({ modelos, inspecoesIniciais, eventos, obraId, papel }:
  { modelos: any[]; inspecoesIniciais: any[]; eventos: any[]; obraId: number; papel: string }) {
  const [insp, setInsp] = useState(inspecoesIniciais);
  const [aberta, setAberta] = useState<number | null>(null);
  const [nova, setNova] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const supabase = supabaseBrowser();
  const podeValidar = ['admin', 'contratante'].includes(papel);

  const [f, setF] = useState({ modelo_id: modelos[0]?.id ? String(modelos[0].id) : '', evento_id: '', local_servico: '' });

  const total = insp.length;
  const aprovadas = insp.filter(i => i.resultado === 'aprovado').length;
  const reprovadas = insp.filter(i => i.resultado === 'reprovado').length;
  const conformidade = total ? (aprovadas + insp.filter(i => i.resultado === 'aprovado_ressalvas').length) / total * 100 : 0;

  async function criar() {
    const mod = modelos.find(m => String(m.id) === f.modelo_id);
    if (!mod) { alert('Escolha um modelo de FVS.'); return; }
    setOcupado(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('fvs_inspecoes').insert({
      obra_id: obraId, modelo_id: mod.id, evento_id: f.evento_id || null,
      titulo: mod.titulo, disciplina: mod.disciplina, local_servico: f.local_servico.trim() || null,
      respostas: (mod.itens ?? []).map((i: any) => ({ descricao: i.descricao, norma: i.norma, resultado: '', observacao: '' })),
      resultado: 'em_andamento', inspecionado_por: user?.id,
    }).select().single();
    setOcupado(false);
    if (error) { alert(error.message); return; }
    setInsp(is => [data, ...is]);
    setNova(false); setAberta(data.id); setF({ ...f, local_servico: '' });
  }

  async function responder(i: any, idx: number, campo: string, valor: string) {
    const respostas = [...i.respostas];
    respostas[idx] = { ...respostas[idx], [campo]: valor };
    setInsp(is => is.map(x => x.id === i.id ? { ...x, respostas } : x));
    await supabase.from('fvs_inspecoes').update({ respostas }).eq('id', i.id);
  }

  async function finalizar(i: any) {
    const semResp = i.respostas.filter((r: any) => !r.resultado).length;
    if (semResp) { alert(`Faltam ${semResp} item(ns) sem resultado.`); return; }
    const nc = i.respostas.filter((r: any) => r.resultado === 'nc').length;
    let resultado = 'aprovado';
    if (nc > 0) {
      resultado = confirm(`${nc} item(ns) não conforme(s).\n\nOK = Aprovar com ressalvas (pendências a corrigir)\nCancelar = Reprovar`)
        ? 'aprovado_ressalvas' : 'reprovado';
    }
    const pend = i.respostas.filter((r: any) => r.resultado === 'nc').map((r: any) => `• ${r.descricao}${r.observacao ? ' — ' + r.observacao : ''}`).join('\n');
    setOcupado(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('fvs_inspecoes').update({
      resultado, pendencias: pend || null, inspecionado_por: user?.id, inspecionado_em: new Date().toISOString(),
    }).eq('id', i.id);
    setOcupado(false);
    if (error) { alert(error.message); return; }
    setInsp(is => is.map(x => x.id === i.id ? { ...x, resultado, pendencias: pend || null, inspecionado_em: new Date().toISOString() } : x));
  }

  async function validar(i: any) {
    setOcupado(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('fvs_inspecoes').update({
      validado_por: user?.id, validado_em: new Date().toISOString(),
    }).eq('id', i.id);
    setOcupado(false);
    if (error) { alert('Apenas contratante/admin validam.'); return; }
    setInsp(is => is.map(x => x.id === i.id ? { ...x, validado_em: new Date().toISOString() } : x));
  }

  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="kpi blu"><div className="lbl">Inspeções realizadas</div><div className="val">{total}</div></div>
        <div className="kpi okk"><div className="lbl">Aprovadas</div><div className="val">{aprovadas}</div></div>
        <div className="kpi acc"><div className="lbl">Reprovadas</div><div className="val">{reprovadas}</div></div>
        <div className="kpi wrn"><div className="lbl">Índice de conformidade</div><div className="val">{fmtPct(conformidade)}</div><div className="foot">aprovadas + com ressalvas</div></div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="hd">
          <h3>Fichas de Verificação de Serviço (FVS)</h3>
          <button className="btn" onClick={() => setNova(n => !n)}>{nova ? 'Fechar' : '+ Nova inspeção'}</button>
        </div>

        {nova && (
          <div className="bd" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="form-grid">
              <div className="fg" style={{ gridColumn: 'span 2' }}><label>Modelo de FVS</label>
                <select value={f.modelo_id} onChange={e => setF({ ...f, modelo_id: e.target.value })}>
                  {modelos.map(m => <option key={m.id} value={m.id}>{m.disciplina} · {m.titulo}</option>)}
                </select></div>
              <div className="fg"><label>Evento de medição</label>
                <select value={f.evento_id} onChange={e => setF({ ...f, evento_id: e.target.value })}>
                  <option value="">— sem vínculo —</option>
                  {eventos.map(e => <option key={e.id} value={e.id}>{e.id} · {e.etapa}</option>)}
                </select></div>
              <div className="fg"><label>Local / trecho</label>
                <input value={f.local_servico} onChange={e => setF({ ...f, local_servico: e.target.value })} placeholder="Ex.: Eixos 3–7, blocos B1 a B4" /></div>
              <div className="fg full" style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <button className="btn" onClick={criar} disabled={ocupado}>Iniciar inspeção</button></div>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>A FVS aprovada vira evidência técnica da medição vinculada (Cl. 3.4 — documentos obrigatórios).</p>
          </div>
        )}

        <div className="bd tblwrap">
          <table>
            <thead><tr><th>Inspeção</th><th>Disciplina</th><th>Evento</th><th>Local</th><th className="num">Data</th><th>Resultado</th><th>Validação</th></tr></thead>
            <tbody>
              {insp.map(i => {
                const [lbl, cls] = RES[i.resultado] ?? ['?', 'st-pend'];
                const nc = (i.respostas ?? []).filter((r: any) => r.resultado === 'nc').length;
                const feitos = (i.respostas ?? []).filter((r: any) => r.resultado).length;
                return (
                  <Frag key={i.id}>
                    <tr className="clickable" style={{ cursor: 'pointer' }} onClick={() => setAberta(a => a === i.id ? null : i.id)}>
                      <td><b>{i.titulo}</b><div className="hint">{feitos}/{(i.respostas ?? []).length} itens{nc > 0 ? ` · ${nc} NC` : ''}</div></td>
                      <td>{i.disciplina}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{i.evento_id ?? '—'}</td>
                      <td>{i.local_servico ?? '—'}</td>
                      <td className="num">{i.inspecionado_em ? fmtData(i.inspecionado_em.slice(0, 10)) : '—'}</td>
                      <td><span className={`stamp ${cls}`}><span className="dot" />{lbl}</span></td>
                      <td>{i.validado_em ? <span className="stamp st-ok"><span className="dot" />VALIDADA</span> : <span className="hint">—</span>}</td>
                    </tr>
                    {aberta === i.id && (
                      <tr className="detail-row"><td colSpan={7}>
                        {(i.respostas ?? []).map((r: any, idx: number) => (
                          <div key={idx} className="fvs-item">
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{idx + 1}. {r.descricao}</div>
                              {r.norma && r.norma !== '—' && <span className="clause">{r.norma}</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                              {[['c', 'C', 'st-ok'], ['nc', 'NC', 'st-risk'], ['na', 'N/A', 'st-pend']].map(([v, t, c]) => (
                                <button key={v}
                                  className={`mini ${r.resultado === v ? 'sel-' + v : ''}`}
                                  disabled={i.resultado !== 'em_andamento'}
                                  onClick={e => { e.stopPropagation(); responder(i, idx, 'resultado', v as string); }}
                                  style={r.resultado === v ? { background: v === 'c' ? 'var(--ok)' : v === 'nc' ? 'var(--risk)' : 'var(--gray)', color: '#fff', borderColor: 'transparent' } : undefined}>
                                  {t}
                                </button>
                              ))}
                            </div>
                            <input placeholder="observação" value={r.observacao ?? ''}
                              disabled={i.resultado !== 'em_andamento'}
                              onClick={e => e.stopPropagation()}
                              onChange={e => responder(i, idx, 'observacao', e.target.value)}
                              style={{ border: '1px solid var(--line-strong)', borderRadius: 4, padding: '5px 7px', width: 220, fontSize: 12 }} />
                          </div>
                        ))}
                        <div className="fg" style={{ marginTop: 10 }}><label>Evidências (fotos, laudos, certificados)</label>
                          <Anexos entidade="fvs" entidadeId={String(i.id)} obraId={obraId} /></div>
                        {i.pendencias && <div className="alert warn" style={{ marginTop: 10 }}><b>Pendências a corrigir</b><span style={{ whiteSpace: 'pre-wrap' }}>{i.pendencias}</span></div>}
                        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {i.resultado === 'em_andamento' && <button className="btn" disabled={ocupado} onClick={e => { e.stopPropagation(); finalizar(i); }}>Finalizar inspeção</button>}
                          {i.resultado !== 'em_andamento' && !i.validado_em && podeValidar && <button className="btn sec" disabled={ocupado} onClick={e => { e.stopPropagation(); validar(i); }}>✓ Validar (fiscalização)</button>}
                          {i.resultado !== 'em_andamento' && !podeValidar && !i.validado_em && <span className="hint">Aguardando validação da fiscalização.</span>}
                        </div>
                      </td></tr>
                    )}
                  </Frag>
                );
              })}
              {insp.length === 0 && <tr><td colSpan={7} className="hint">Nenhuma inspeção registrada nesta obra.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Frag({ children }: { children: React.ReactNode }) { return <>{children}</>; }
