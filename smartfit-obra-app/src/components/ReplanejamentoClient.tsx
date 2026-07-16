'use client';
import { useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtBRL, fmtData } from '@/lib/contrato';

type Ev = any;

export default function ReplanejamentoClient({ eventos, deps, revisoes, obra, papel }:
  { eventos: Ev[]; deps: any[]; revisoes: any[]; obra: any; papel: string }) {
  const [ajustes, setAjustes] = useState<Record<string, string>>({});
  const [impacto, setImpacto] = useState<any>(null);
  const [motivo, setMotivo] = useState('');
  const [detalhe, setDetalhe] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [revs, setRevs] = useState(revisoes);
  const [verRevs, setVerRevs] = useState(false);
  const [verBase, setVerBase] = useState(false);
  const [base, setBase] = useState<Record<string, { inicio?: string; fim?: string; critico?: boolean }>>({});
  const gestor = ['admin', 'contratante'].includes(papel);
  const supabase = supabaseBrowser();

  async function gravarBaseline() {
    const lista = Object.entries(base)
      .filter(([, v]) => v.inicio && v.fim)
      .map(([evento_id, v]) => ({ evento_id, inicio: v.inicio, fim: v.fim, critico: !!v.critico }));
    if (!lista.length) { alert('Preencha início e fim de ao menos um evento.'); return; }
    if (!confirm(`Gravar o baseline de ${lista.length} evento(s)?\n\nUma vez gravado, o banco não permite alterar. Confira as datas antes.`)) return;
    setOcupado(true);
    try {
      const r = await fetch('/api/replanejamento/baseline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obra_id: obra.id, datas: lista }),
      });
      const j = await r.json();
      if (j.erro) { alert(j.erro); setOcupado(false); return; }
      alert(`Baseline gravado: ${j.gravados} evento(s).${j.aviso ? '\n\n' + j.aviso : ''}`);
      location.reload();
    } catch (e: any) { alert('Falha: ' + e.message); }
    setOcupado(false);
  }

  const semData = eventos.filter(e => !e.base_inicio && !e.prev_inicio).length;
  const temAjuste = Object.values(ajustes).some(v => v);

  const vigente = (e: Ev) => e.prev_inicio ?? e.base_inicio;
  const desvio = (e: Ev) => {
    const p = vigente(e);
    if (!e.base_inicio || !p) return 0;
    return Math.round((new Date(p + 'T12:00:00').getTime() - new Date(e.base_inicio + 'T12:00:00').getTime()) / 86400000);
  };

  // curva S acumulada: baseline x replanejado (usa o impacto quando há simulação)
  const curva = useMemo(() => {
    const meses = new Map<string, { base: number; prev: number }>();
    for (const e of eventos) {
      const v = Number(e.valor_bruto);
      const mb = e.base_inicio?.slice(0, 7);
      const sim = impacto?.diff?.find((d: any) => d.evento_id === e.id);
      const mp = (sim?.para_inicio ?? vigente(e))?.slice(0, 7);
      if (mb) { const r = meses.get(mb) ?? { base: 0, prev: 0 }; r.base += v; meses.set(mb, r); }
      if (mp) { const r = meses.get(mp) ?? { base: 0, prev: 0 }; r.prev += v; meses.set(mp, r); }
    }
    const ord = Array.from(meses.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    let ab = 0, ap = 0;
    return ord.map(([m, r]) => { ab += r.base; ap += r.prev; return { mes: m, base: ab, prev: ap, mesBase: r.base, mesPrev: r.prev }; });
  }, [eventos, impacto]);

  const totalCurva = curva.length ? Math.max(curva[curva.length - 1].base, curva[curva.length - 1].prev) : 0;

  async function simular(aplicar = false) {
    const lista = Object.entries(ajustes).filter(([, v]) => v).map(([evento_id, novo_inicio]) => ({ evento_id, novo_inicio }));
    if (!lista.length) { alert('Informe ao menos uma nova data.'); return; }
    if (aplicar && motivo.trim().length < 5) { alert('Descreva o motivo da revisão — é o que sustenta a discussão contratual depois.'); return; }
    setOcupado(true);
    try {
      const r = await fetch('/api/replanejamento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obra_id: obra.id, ajustes: lista, aplicar, motivo, detalhe }),
      });
      const j = await r.json();
      if (j.erro) { alert(j.erro); setOcupado(false); return; }
      setImpacto(j.impacto);
      if (aplicar) {
        alert(`Revisão R${String(j.revisao.numero).padStart(2, '0')} registrada. O cronograma contratual segue intacto.`);
        location.reload();
      }
    } catch (e: any) { alert('Falha: ' + e.message); }
    setOcupado(false);
  }

  return (
    <>
      <section className="cock-hero">
        <div className="saud">Replanejamento</div>
        <div className="resumo">
          O cronograma contratual não muda. Aqui você move as datas previstas e vê o impacto antes de decidir.
        </div>
      </section>

      {semData > 0 && (
        <div className="panel" style={{ borderLeft: '3px solid var(--brand)' }}>
          <div className="hd">
            <h3>Datas do baseline contratual</h3>
            {gestor && <button className="btn" onClick={() => setVerBase(v => !v)}>{verBase ? 'Fechar' : 'Preencher datas'}</button>}
          </div>
          <div className="bd">
            <p className="hint">
              {semData} de {eventos.length} evento(s) sem data contratual. Sem elas não há como simular replanejamento
              nem medir desvio de prazo. Estas são as datas do Anexo III — uma vez gravadas, ficam travadas no banco e
              nunca mais mudam. É isso que sustenta qualquer discussão de prazo depois.
            </p>

            {verBase && gestor && (
              <div style={{ marginTop: 14, overflowX: 'auto' }}>
                <table className="tab">
                  <thead><tr><th>Evento</th><th>Início</th><th>Fim</th><th>Crítico</th></tr></thead>
                  <tbody>
                    {eventos.filter(e => !e.base_inicio).map(e => (
                      <tr key={e.id}>
                        <td><b>{e.id}</b> {e.etapa} <span className="hint">· mês {e.base_mes ?? '—'}</span></td>
                        <td><input type="date" style={{ padding: '4px 6px', fontSize: 12 }}
                          value={base[e.id]?.inicio ?? ''}
                          onChange={ev => setBase(b => ({ ...b, [e.id]: { ...b[e.id], inicio: ev.target.value } }))} /></td>
                        <td><input type="date" style={{ padding: '4px 6px', fontSize: 12 }}
                          value={base[e.id]?.fim ?? ''}
                          onChange={ev => setBase(b => ({ ...b, [e.id]: { ...b[e.id], fim: ev.target.value } }))} /></td>
                        <td><input type="checkbox" checked={!!base[e.id]?.critico}
                          onChange={ev => setBase(b => ({ ...b, [e.id]: { ...b[e.id], critico: ev.target.checked } }))} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button className="btn" style={{ marginTop: 10 }} disabled={ocupado} onClick={gravarBaseline}>
                  {ocupado ? 'gravando…' : 'Gravar baseline (definitivo)'}
                </button>
                <p className="hint" style={{ marginTop: 6 }}>
                  Só grava os eventos com início e fim preenchidos. Confira antes: não há desfazer.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- curva S ---------- */}
      {curva.length > 0 && (
        <div className="panel">
          <div className="hd">
            <h3>Curva S · contratual {impacto ? '× simulada' : '× replanejada'}</h3>
            <span className="hint">acumulado de faturamento</span>
          </div>
          <div className="bd">
            <svg viewBox="0 0 720 220" style={{ width: '100%', height: 'auto' }} role="img" aria-label="Curva S comparada">
              {[0, .25, .5, .75, 1].map(f => (
                <line key={f} x1="42" x2="710" y1={190 - f * 165} y2={190 - f * 165} stroke="var(--line)" strokeWidth="1" />
              ))}
              {[0, .5, 1].map(f => (
                <text key={f} x="38" y={194 - f * 165} textAnchor="end" fontSize="8" fill="var(--gray)">
                  {(totalCurva * f / 1000).toFixed(0)}k
                </text>
              ))}
              {(() => {
                const px = (i: number) => 42 + (i / Math.max(1, curva.length - 1)) * 668;
                const py = (v: number) => 190 - (totalCurva ? v / totalCurva : 0) * 165;
                const linha = (campo: 'base' | 'prev') => curva.map((c, i) => `${i ? 'L' : 'M'}${px(i)},${py(c[campo])}`).join(' ');
                return (
                  <>
                    <path d={linha('base')} fill="none" stroke="var(--gray)" strokeWidth="2" strokeDasharray="5 4" />
                    <path d={linha('prev')} fill="none" stroke="var(--brand)" strokeWidth="2.5" />
                    {curva.map((c, i) => (
                      <g key={c.mes}>
                        <circle cx={px(i)} cy={py(c.prev)} r="3" fill="var(--brand)" />
                        <text x={px(i)} y="206" textAnchor="middle" fontSize="7.5" fill="var(--gray)">
                          {c.mes.slice(5)}/{c.mes.slice(2, 4)}
                        </text>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
            <div style={{ display: 'flex', gap: 18, fontSize: 11, marginTop: 6 }}>
              <span style={{ color: 'var(--gray)' }}>▬▬ contratual (baseline, imutável)</span>
              <span style={{ color: 'var(--brand)' }}>▬▬ {impacto ? 'simulado' : 'replanejado vigente'}</span>
            </div>
          </div>
        </div>
      )}

      {/* ---------- impacto da simulação ---------- */}
      {impacto && (
        <div className="panel" style={{ borderLeft: '3px solid var(--brand)' }}>
          <div className="hd">
            <h3>Impacto simulado</h3>
            <button className="mini" onClick={() => setImpacto(null)}>limpar</button>
          </div>
          <div className="bd">
            <div className="cock-strip" style={{ marginBottom: 14 }}>
              <div className="it"><div className="n">{impacto.diff.length}</div><div className="l">Eventos movidos</div></div>
              <div className={`it ${impacto.dias_entrega > 0 ? 'risco' : ''}`}>
                <div className="n">{impacto.dias_entrega > 0 ? '+' : ''}{impacto.dias_entrega}</div>
                <div className="l">Dias na conclusão</div>
              </div>
              <div className="it">
                <div className="n" style={{ fontSize: 15 }}>{fmtData(impacto.entrega_prev)}</div>
                <div className="l">Conclusão projetada</div>
              </div>
            </div>

            {impacto.alertas.map((a: string, i: number) => (
              <p key={i} style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 6, paddingLeft: 10, borderLeft: '2px solid var(--line-strong)' }}>{a}</p>
            ))}

            {impacto.diff.length > 0 && (
              <table className="tab" style={{ marginTop: 12 }}>
                <thead><tr><th>Evento</th><th>De</th><th>Para</th><th>Δ</th><th>Origem</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
                <tbody>
                  {impacto.diff.map((d: any) => (
                    <tr key={d.evento_id}>
                      <td><b>{d.evento_id}</b> {d.etapa}</td>
                      <td>{fmtData(d.de_inicio)}</td>
                      <td>{fmtData(d.para_inicio)}</td>
                      <td style={{ color: d.dias < 0 ? 'var(--ok)' : d.dias > 0 ? 'var(--brand)' : undefined }}>
                        {d.dias > 0 ? '+' : ''}{d.dias}d
                      </td>
                      <td><span className="hint">{d.motivo === 'cascata' ? 'precedência' : 'direto'}</span></td>
                      <td style={{ textAlign: 'right' }}>{fmtBRL(d.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {impacto.faturamento.filter((f: any) => f.delta !== 0).length > 0 && (
              <>
                <h4 style={{ fontSize: 12, marginTop: 16, marginBottom: 6 }}>FATURAMENTO QUE MUDA DE MÊS</h4>
                <table className="tab">
                  <thead><tr><th>Mês</th><th style={{ textAlign: 'right' }}>Contratual</th><th style={{ textAlign: 'right' }}>Replanejado</th><th style={{ textAlign: 'right' }}>Δ</th></tr></thead>
                  <tbody>
                    {impacto.faturamento.filter((f: any) => f.delta !== 0).map((f: any) => (
                      <tr key={f.periodo}>
                        <td>{f.periodo}</td>
                        <td style={{ textAlign: 'right' }}>{fmtBRL(f.base)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtBRL(f.prev)}</td>
                        <td style={{ textAlign: 'right', color: f.delta > 0 ? 'var(--ok)' : 'var(--brand)' }}>
                          {f.delta > 0 ? '+' : ''}{fmtBRL(f.delta)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {gestor && impacto.diff.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <div className="fg" style={{ marginBottom: 8 }}>
                  <label>Motivo da revisão (fica no registro permanente)</label>
                  <input value={motivo} onChange={e => setMotivo(e.target.value)}
                    placeholder="Ex.: antecipação da mobilização a pedido da contratante" />
                </div>
                <div className="fg" style={{ marginBottom: 10 }}>
                  <label>Detalhe (opcional)</label>
                  <textarea value={detalhe} onChange={e => setDetalhe(e.target.value)} rows={2} />
                </div>
                <button className="btn" disabled={ocupado || motivo.trim().length < 5} onClick={() => simular(true)}>
                  Aplicar revisão R{String((revs[0]?.numero ?? 0) + 1).padStart(2, '0')}
                </button>
                <p className="hint" style={{ marginTop: 6 }}>
                  Grava as datas previstas e registra a revisão. O baseline contratual não é alterado.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- eventos ---------- */}
      <div className="panel">
        <div className="hd">
          <h3>Eventos · baseline × previsto</h3>
          {temAjuste && <button className="btn" disabled={ocupado} onClick={() => simular(false)}>{ocupado ? 'simulando…' : 'Simular impacto'}</button>}
        </div>
        <div className="bd" style={{ overflowX: 'auto' }}>
          <table className="tab">
            <thead>
              <tr>
                <th>Evento</th><th>Status</th>
                <th>Baseline</th><th>Previsto</th><th>Desvio</th>
                <th>Nova data de início</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map(e => {
                const d = desvio(e);
                const concluido = ['aprovado', 'glosado'].includes(e.status);
                return (
                  <tr key={e.id} style={concluido ? { opacity: .6 } : undefined}>
                    <td><b>{e.id}</b> {e.etapa}{e.critico && <span className="st st-risk" style={{ marginLeft: 6 }}>CRÍTICO</span>}</td>
                    <td><span className="hint">{e.status}</span></td>
                    <td>{fmtData(e.base_inicio)}{e.base_fim && <span className="hint"> → {fmtData(e.base_fim)}</span>}</td>
                    <td>{fmtData(vigente(e))}{(e.prev_fim ?? e.base_fim) && <span className="hint"> → {fmtData(e.prev_fim ?? e.base_fim)}</span>}</td>
                    <td style={{ color: d < 0 ? 'var(--ok)' : d > 0 ? 'var(--brand)' : undefined }}>{d ? `${d > 0 ? '+' : ''}${d}d` : '—'}</td>
                    <td>
                      {concluido ? <span className="hint">concluído</span> : (
                        <input type="date" value={ajustes[e.id] ?? ''} disabled={!gestor}
                          onChange={ev => setAjustes(a => ({ ...a, [e.id]: ev.target.value }))}
                          style={{ padding: '4px 6px', fontSize: 12 }} />
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>{fmtBRL(e.valor_bruto)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!gestor && <p className="hint" style={{ marginTop: 8 }}>Somente admin ou contratante replaneja o cronograma.</p>}
        </div>
      </div>

      {/* ---------- precedências ---------- */}
      <div className="panel">
        <div className="hd"><h3>Precedências · o que puxa o que</h3></div>
        <div className="bd">
          {!deps.length ? (
            <p className="hint">
              Sem precedências cadastradas: antecipar um evento não puxa os seguintes automaticamente — cada data precisa
              ser informada manualmente. Cadastre as dependências para o sistema recalcular a cascata sozinho.
            </p>
          ) : (
            <table className="tab">
              <thead><tr><th>Evento</th><th>Depende de</th><th>Tipo</th><th>Folga</th></tr></thead>
              <tbody>
                {deps.map((d: any) => (
                  <tr key={`${d.evento_id}-${d.depende_de}`}>
                    <td><b>{d.evento_id}</b></td><td>{d.depende_de}</td>
                    <td><span className="hint">{d.tipo === 'FS' ? 'fim → início' : d.tipo === 'SS' ? 'início → início' : 'fim → fim'}</span></td>
                    <td>{d.folga_dias ? `${d.folga_dias}d` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ---------- revisões ---------- */}
      <div className="panel">
        <div className="hd" style={{ cursor: 'pointer' }} onClick={() => setVerRevs(v => !v)}>
          <h3>Histórico de revisões · {revs.length}</h3>
          <span className="hint">{verRevs ? 'recolher' : 'abrir'}</span>
        </div>
        {verRevs && (
          <div className="bd">
            {!revs.length && <p className="hint">Nenhuma revisão aplicada. O cronograma está no baseline contratual.</p>}
            {revs.map((r: any) => (
              <div key={r.id} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <b>R{String(r.numero).padStart(2, '0')} · {r.motivo}</b>
                  <span className="hint">{fmtData(String(r.criado_em).slice(0, 10))} · {r.origem}</span>
                </div>
                {r.detalhe && <p style={{ fontSize: 12.5, marginTop: 4 }}>{r.detalhe}</p>}
                <p className="hint" style={{ marginTop: 4 }}>
                  {(r.diff ?? []).length} evento(s) movido(s)
                  {r.impacto?.dias_entrega ? ` · conclusão ${r.impacto.dias_entrega > 0 ? '+' : ''}${r.impacto.dias_entrega}d` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
