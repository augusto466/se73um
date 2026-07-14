'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { DOCS_PADRAO, MESES, STATUS_LABEL, fmtBRL } from '@/lib/contrato';

type Evento = any;

export default function EventosClient({ eventosIniciais, papel }: { eventosIniciais: Evento[]; papel: string }) {
  const [eventos, setEventos] = useState<Evento[]>(eventosIniciais);
  const [aberto, setAberto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const supabase = supabaseBrowser();
  const podeValidar = papel === 'contratante' || papel === 'admin';

  async function audit(acao: string, id: string, detalhe: any) {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('auditoria').insert({ usuario: user?.id, acao, entidade: 'eventos', entidade_id: id, detalhe });
  }

  async function mudarStatus(ev: Evento, novo: string, glosa = 0) {
    setOcupado(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('eventos')
      .update({ status: novo, valor_glosa: glosa, atualizado_por: user?.id, atualizado_em: new Date().toISOString() })
      .eq('id', ev.id);
    if (error) { alert('Sem permissão para esta transição (perfil ' + papel + ').'); setOcupado(false); return; }
    await audit('mudanca_status', ev.id, { de: ev.status, para: novo, glosa });
    // dispara e-mail automático conforme o evento
    if (novo === 'validacao' || novo === 'aprovado' || novo === 'glosado') {
      fetch('/api/notificar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: novo === 'validacao' ? 'submetida' : 'decidida', eventoId: ev.id }),
      }).catch(() => {});
    }
    setEventos(evts => evts.map(e => e.id === ev.id ? { ...e, status: novo, valor_glosa: glosa } : e));
    setOcupado(false);
  }

  async function aprovarComGlosa(ev: Evento) {
    const v = prompt(`Valor da glosa para ${ev.id} (Cl. 3.3 — fundamentação técnica objetiva).\nValor da etapa: ${fmtBRL(Number(ev.valor_bruto))}`, '0');
    if (v === null) return;
    const glosa = Number(v.replace(/\./g, '').replace(',', '.')) || 0;
    await mudarStatus(ev, 'glosado', glosa);
  }

  async function toggleDoc(ev: Evento, i: number, val: boolean) {
    const docs = [...ev.docs]; docs[i] = val;
    const { error } = await supabase.from('eventos').update({ docs }).eq('id', ev.id);
    if (!error) setEventos(evts => evts.map(e => e.id === ev.id ? { ...e, docs } : e));
  }

  return (
    <div className="panel">
      <div className="hd">
        <h3>Cronograma de eventos de medição — E01–E25</h3>
        <span className="hint">A aprovação de medição não implica aceitação definitiva (Cl. 3.4.1)</span>
      </div>
      <div className="bd tblwrap">
        <table>
          <thead><tr><th>Evento</th><th>Mês</th><th>Etapa / descrição</th><th className="num">Valor bruto</th><th>Dossiê</th><th>Status</th></tr></thead>
          <tbody>
            {eventos.map(ev => {
              const [lbl, cls] = STATUS_LABEL[ev.status] ?? ['?', 'st-pend'];
              const docsOk = (ev.docs ?? []).filter(Boolean).length;
              const mes = MESES.find(m => m.id === ev.mes);
              return (
                <FragmentRow key={ev.id}>
                  <tr style={{cursor:'pointer'}} onClick={() => setAberto(a => a === ev.id ? null : ev.id)}>
                    <td style={{fontFamily:'var(--mono)',fontWeight:600}}>{ev.id}</td>
                    <td style={{fontFamily:'var(--mono)',fontSize:11.5}}>M{String(ev.mes).padStart(2,'0')} · {mes?.ref}</td>
                    <td><b>{ev.etapa}</b><div className="hint">{ev.descricao}</div></td>
                    <td className="num">{fmtBRL(Number(ev.valor_bruto))}</td>
                    <td><div className="bar"><i className={docsOk === 7 ? 'g' : ''} style={{width:`${docsOk/7*100}%`}} /></div><div className="hint" style={{fontFamily:'var(--mono)',fontSize:10,marginTop:2}}>{docsOk}/7 docs</div></td>
                    <td><span className={`stamp ${cls}`}><span className="dot" />{lbl}</span></td>
                  </tr>
                  {aberto === ev.id && (
                    <tr><td colSpan={6} style={{background:'var(--paper-2)'}}>
                      <div className="detail" style={{border:0,padding:4}}>
                        <div>
                          <div className="fg"><label>Critério de aceite</label><p style={{fontSize:13}}>{ev.criterio}</p></div>
                          <div className="fg" style={{marginTop:10}}><label>Documentos obrigatórios (Cl. 3.4)</label>
                            <div className="doclist">
                              {DOCS_PADRAO.map((d, i) => (
                                <label key={i} className={`docchk ${ev.docs?.[i] ? 'done' : ''}`}>
                                  <input type="checkbox" checked={!!ev.docs?.[i]}
                                    onChange={e => toggleDoc(ev, i, e.target.checked)}
                                    onClick={e => e.stopPropagation()} /> {d}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div>
                          <table>
                            <tbody>
                              <tr><td>Tipo de medição</td><td className="num">{ev.tipo}</td></tr>
                              <tr><td>Aprovação por</td><td className="num">{ev.aprova}</td></tr>
                              <tr><td>Valor bruto</td><td className="num">{fmtBRL(Number(ev.valor_bruto))}</td></tr>
                              {Number(ev.valor_glosa) > 0 && <tr><td>(−) Glosa aplicada</td><td className="num" style={{color:'var(--risk)'}}>{fmtBRL(Number(ev.valor_glosa))}</td></tr>}
                              <tr><td>Retenção 10%</td><td className="num" style={{color:'var(--warn)'}}>{fmtBRL((Number(ev.valor_bruto)-Number(ev.valor_glosa||0)) * 0.1)}</td></tr>
                              <tr><td><b>Líquido a pagar</b></td><td className="num"><b>{fmtBRL((Number(ev.valor_bruto)-Number(ev.valor_glosa||0)) * 0.9)}</b></td></tr>
                            </tbody>
                          </table>
                          <div style={{marginTop:10,display:'flex',gap:6,flexWrap:'wrap'}}>
                            {!podeValidar && ev.status === 'pendente' && <button className="mini" disabled={ocupado} onClick={() => mudarStatus(ev, 'execucao')}>▶ Iniciar execução</button>}
                            {!podeValidar && ev.status === 'execucao' && <button className="mini" disabled={ocupado} onClick={() => mudarStatus(ev, 'validacao')}>⇧ Submeter para validação (notifica fiscalização)</button>}
                            {podeValidar && ev.status === 'validacao' && <>
                              <button className="mini" disabled={ocupado} onClick={() => mudarStatus(ev, 'aprovado')}>✓ Aprovar medição (notifica todos)</button>
                              <button className="mini danger" disabled={ocupado} onClick={() => aprovarComGlosa(ev)}>✕ Aprovar com glosa</button>
                            </>}
                            {podeValidar && ['aprovado','glosado'].includes(ev.status) && <button className="mini" disabled={ocupado} onClick={() => mudarStatus(ev, 'validacao')}>↺ Reabrir análise</button>}
                          </div>
                          <p className="hint" style={{marginTop:6}}>Transições registradas na trilha de auditoria com usuário, data e hora.</p>
                        </div>
                      </div>
                    </td></tr>
                  )}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) { return <>{children}</>; }
