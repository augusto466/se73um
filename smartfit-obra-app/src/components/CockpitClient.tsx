'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { fmtBRL, fmtPct, fmtData } from '@/lib/contrato';
import { analisarMargem, analisarCaixa, analisarPrazo, analisarGargalos, gerarAlertas, CORES } from '@/lib/bi';

const fmtC = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export default function CockpitClient(p: any) {
  const [aba, setAba] = useState<'abc' | 'fornecedores' | 'etapas'>('etapas');

  const margem = useMemo(() => analisarMargem(p.obras, p.desvios), [p.obras, p.desvios]);
  const caixa = useMemo(() => analisarCaixa(p.lancamentos, p.saldo), [p.lancamentos, p.saldo]);
  const prazos = useMemo(() => analisarPrazo(p.obras), [p.obras]);
  const gargalos = useMemo(() => analisarGargalos(p.eventos, p.pedidos, p.cotacoes, p.obras), [p.eventos, p.pedidos, p.cotacoes, p.obras]);
  const alertas = useMemo(() => gerarAlertas(margem, caixa, prazos, p.desvios, p.docs, p.fvs), [margem, caixa, prazos, p.desvios, p.docs, p.fvs]);

  const criticos = alertas.filter(a => a.nivel === 'critico').length;
  const impactoTravado = gargalos.reduce((s, g) => s + g.impacto, 0);

  // saúde geral: 0-100
  const saude = useMemo(() => {
    let s = 100;
    if (margem.margemProjPctTotal < 10) s -= 25;
    else if (margem.margemProjPctTotal < 15) s -= 10;
    if (caixa.semanasAteFurar !== null) s -= caixa.semanasAteFurar <= 4 ? 30 : 15;
    prazos.forEach(pr => { if (pr.semaforo === 'critico') s -= 15; else if (pr.semaforo === 'atencao') s -= 7; });
    s -= criticos * 5;
    return Math.max(0, Math.min(100, s));
  }, [margem, caixa, prazos, criticos]);

  const semSaude = saude >= 75 ? 'ok' : saude >= 50 ? 'atencao' : 'critico';

  const Sem = ({ s }: { s: string }) => (
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: CORES[s as 'ok'], display: 'inline-block', flex: 'none' }} />
  );

  return (
    <>
      {/* ============ 0. PULSO ============ */}
      <section className="cock-hero" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div className="saud">Saúde do negócio</div>
            <div className="resumo">
              {criticos > 0
                ? <><b>{criticos} ponto(s) crítico(s)</b> exigem decisão agora.</>
                : caixa.semanasAteFurar !== null
                ? <>Caixa positivo por <b>{caixa.runway} semanas</b>. Nada crítico hoje.</>
                : <>Sem pontos críticos. Margem e caixa dentro do esperado.</>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 44, fontWeight: 700, lineHeight: 1, color: CORES[semSaude] }}>{saude}</div>
            <div style={{ fontSize: 9.5, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--gray)', fontWeight: 700, marginTop: 4 }}>Índice de saúde</div>
          </div>
        </div>

        <div className="cock-strip">
          <div className={`it ${margem.margemProjPctTotal < 10 ? 'risco' : ''}`}>
            <div className="n">{fmtPct(margem.margemProjPctTotal)}</div>
            <div className="l">Margem projetada</div>
          </div>
          <div className={`it ${caixa.semanasAteFurar !== null ? 'risco' : ''}`}>
            <div className="n">{caixa.semanasAteFurar !== null ? `${caixa.runway}s` : '26s+'}</div>
            <div className="l">Runway de caixa</div>
          </div>
          <div className="it">
            <div className="n">{fmtC(margem.carteira - margem.medido)}</div>
            <div className="l">Backlog a executar</div>
          </div>
          <div className={`it ${gargalos.length ? 'risco' : ''}`}>
            <div className="n">{fmtC(impactoTravado)}</div>
            <div className="l">Travado com você</div>
          </div>
        </div>
      </section>

      {/* ============ 1. MARGEM ============ */}
      <h2 className="sec">01 · Onde estou perdendo margem</h2>
      <div className="panel">
        <div className="bd">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 14 }}>
            <div><div className="hint" style={{ fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontSize: 9.5 }}>Realizada hoje</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, color: margem.margem >= 0 ? 'var(--ok)' : 'var(--brand)' }}>{fmtC(margem.margem)}</div>
              <div className="hint">{fmtPct(margem.margemPct)} sobre o medido</div></div>
            <div><div className="hint" style={{ fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontSize: 9.5 }}>Projetada no fim</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, color: margem.margemProjetadaTotal >= 0 ? 'var(--ok)' : 'var(--brand)' }}>{fmtC(margem.margemProjetadaTotal)}</div>
              <div className="hint">estimativa · {fmtPct(margem.margemProjPctTotal)}</div></div>
            <div><div className="hint" style={{ fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontSize: 9.5 }}>Medido</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600 }}>{fmtC(margem.medido)}</div></div>
            <div><div className="hint" style={{ fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontSize: 9.5 }}>Comprado</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600 }}>{fmtC(margem.comprado)}</div></div>
          </div>

          {margem.porObra.map((o: any) => (
            <div key={o.obra_id} style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <div><b style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>{o.codigo}</b> <span className="hint">{o.nome}</span></div>
                <div style={{ display: 'flex', gap: 20 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div className="hint">margem projetada</div>
                    <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: o.margemProjPct < 10 ? 'var(--brand)' : 'var(--ok)' }}>
                      {fmtC(o.margemProjetada)} · {fmtPct(o.margemProjPct)}
                    </div>
                  </div>
                </div>
              </div>

              {!o.confiavel && (
                <p className="hint" style={{ marginBottom: 8 }}>
                  ⓘ Projeção baseada em {o.etapasCompradas} de {o.etapasTotal} etapas com compra aprovada — margem de erro alta. Ganha precisão conforme as compras avançam.
                </p>
              )}

              {o.sangria.length > 0 ? (
                <div className="tblwrap"><table>
                  <thead><tr><th>Etapa sangrando</th><th className="num">Orçado</th><th className="num">Comprado</th><th className="num">Sai da margem</th></tr></thead>
                  <tbody>
                    {o.sangria.slice(0, 5).map((s: any, i: number) => {
                      const d = p.desvios.find((x: any) => x.obra_id === o.obra_id && x.etapa === s.etapa);
                      return (
                        <tr key={i}>
                          <td><b>{s.etapa}</b></td>
                          <td className="num">{fmtC(Number(d?.valor_orcado ?? 0))}</td>
                          <td className="num">{fmtC(Number(d?.valor_comprado ?? 0))}</td>
                          <td className="num" style={{ color: 'var(--brand)', fontWeight: 600 }}>−{fmtC(s.desvio)} ({fmtPct(s.pct)})</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              ) : (
                <p className="hint">Nenhuma etapa comprada acima do orçado até aqui. {o.etapasCompradas === 0 && 'Aprove pedidos vinculados a eventos para o comparativo começar.'}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ============ 2. CAIXA ============ */}
      <h2 className="sec">02 · O caixa aguenta?</h2>
      <div className="panel">
        <div className="bd">
          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', marginBottom: 14 }}>
            <div><div className="hint" style={{ fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontSize: 9.5 }}>Saldo hoje</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600 }}>{fmtC(p.saldo)}</div></div>
            <div><div className="hint" style={{ fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontSize: 9.5 }}>Menor saldo projetado</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, color: caixa.menor < 0 ? 'var(--brand)' : 'var(--ok)' }}>{fmtC(caixa.menor)}</div></div>
            <div><div className="hint" style={{ fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontSize: 9.5 }}>Queima semanal média</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600 }}>{fmtC(caixa.queima)}</div>
              <div className="hint">4 semanas · estimativa</div></div>
            <div><div className="hint" style={{ fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontSize: 9.5 }}>Runway</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, color: CORES[caixa.semaforo] }}>
                {caixa.semanasAteFurar !== null ? `${caixa.runway} semanas` : '> 26 semanas'}
              </div>
              {caixa.semanaFura && <div className="hint">fura em {fmtData(caixa.semanaFura.ini)}</div>}</div>
          </div>

          {p.saldo === 0 && (
            <div className="alert warn"><b>Saldo de caixa não informado</b>
              A projeção parte de zero e não reflete a realidade. Informe o saldo em <Link href="/financeiro">Financeiro</Link> → "atualizar saldo".</div>
          )}

          {/* mini gráfico de barras da projeção */}
          <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 90, marginTop: 6 }}>
            {caixa.proj.slice(0, 16).map((s: any, i: number) => {
              const max = Math.max(...caixa.proj.slice(0, 16).map((x: any) => Math.abs(x.saldo)), 1);
              const h = Math.max(3, Math.abs(s.saldo) / max * 78);
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 3 }}
                  title={`${s.rotulo}: ${fmtC(s.saldo)}`}>
                  <div style={{ width: '100%', height: h, background: s.saldo < 0 ? 'var(--brand)' : 'var(--ok)', borderRadius: '2px 2px 0 0', opacity: s.saldo < 0 ? 1 : .75 }} />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--gray)' }}>{s.rotulo}</span>
                </div>
              );
            })}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>Projeção de 16 semanas · considera previstos e confirmados. Barras vermelhas = saldo negativo.</p>
        </div>
      </div>

      {/* ============ 3. PRAZO ============ */}
      <h2 className="sec">03 · O que vai atrasar</h2>
      <div className="panel">
        <div className="bd tblwrap">
          <table>
            <thead><tr><th>Obra</th><th>Avanço real × planejado</th><th className="num">Gap</th><th className="num">Dias p/ entrega</th><th>Projeção (estimativa)</th></tr></thead>
            <tbody>
              {prazos.map((o: any) => (
                <tr key={o.obra_id}>
                  <td><div style={{ display: 'flex', gap: 7, alignItems: 'center' }}><Sem s={o.semaforo} /><b style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{o.codigo}</b></div>
                    <div className="hint">{o.nome}</div></td>
                  <td style={{ minWidth: 170 }}>
                    <div className="bar" style={{ position: 'relative', height: 9 }}>
                      <i style={{ width: `${Math.min(100, o.realPct)}%`, background: CORES[o.semaforo] }} />
                      <span style={{ position: 'absolute', left: `${Math.min(100, o.planPct)}%`, top: -3, width: 2, height: 15, background: 'var(--ink)' }} title={`planejado ${fmtPct(o.planPct)}`} />
                    </div>
                    <div className="hint" style={{ marginTop: 4 }}>{fmtPct(o.realPct)} real · <span style={{ color: 'var(--ink)' }}>│</span> {fmtPct(o.planPct)} planejado</div>
                  </td>
                  <td className="num" style={{ fontWeight: 600, color: o.gap < 0 ? 'var(--brand)' : 'var(--ok)' }}>{o.gap >= 0 ? '+' : ''}{fmtPct(o.gap)}</td>
                  <td className="num">{o.diasRestantes}</td>
                  <td>
                    {o.atrasoProjetado === null ? <span className="hint">sem ritmo aferido</span>
                      : o.atrasoProjetado > 0
                      ? <span style={{ color: 'var(--brand)', fontWeight: 600, fontSize: 12.5 }}>~{o.atrasoProjetado} dias de atraso</span>
                      : <span style={{ color: 'var(--ok)', fontWeight: 600, fontSize: 12.5 }}>dentro do prazo</span>}
                    {o.atrasoProjetado > 0 && <div className="hint">multa 0,5%/dia (Cl. 8.1) ≈ {fmtC(Number(o.valor_global) * 0.005 * Math.min(o.atrasoProjetado, 20))}</div>}
                  </td>
                </tr>
              ))}
              {prazos.length === 0 && <tr><td colSpan={5} className="hint">Nenhuma obra na carteira.</td></tr>}
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 8 }}>Projeção pelo ritmo médio desde o início (% medido ÷ meses decorridos). Estimativa — ajusta conforme a obra avança.</p>
        </div>
      </div>

      {/* ============ 4. GARGALOS / DECISÕES ============ */}
      <h2 className="sec">04 · Decisões que travam o fluxo</h2>
      <div className="panel">
        <div className="bd" style={{ padding: gargalos.length ? 0 : 15 }}>
          {gargalos.length === 0 && <p className="hint">Nada travado com você. 🎉</p>}
          {gargalos.map((g: any, i: number) => (
            <div key={i} style={{ padding: '13px 15px', borderBottom: i < gargalos.length - 1 ? '1px solid var(--line)' : 0, display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 108 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 17, fontWeight: 600, color: g.urgente ? 'var(--brand)' : 'var(--ink)' }}>{fmtC(g.impacto)}</div>
                <div className="hint">{g.dias} dia(s) parado</div>
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {g.titulo} <span className="hint" style={{ fontFamily: 'var(--mono)' }}>· {g.obra}</span>
                </div>
                <div className="hint" style={{ marginTop: 3, color: g.urgente ? 'var(--brand)' : undefined }}>{g.consequencia}</div>
              </div>
              <Link href={g.href} className="btn" style={{ textDecoration: 'none', fontSize: 12 }}>Decidir →</Link>
            </div>
          ))}
        </div>
      </div>

      {/* ============ 5. ALERTAS ============ */}
      {alertas.length > 0 && (
        <>
          <h2 className="sec">05 · Sinais antecipados</h2>
          <div style={{ marginBottom: 14 }}>
            {alertas.map((a: any, i: number) => (
              <div key={i} className={`alert ${a.nivel === 'critico' ? 'risk' : a.nivel === 'atencao' ? 'warn' : 'info'}`}>
                <b>{a.titulo}</b>
                {a.texto} {a.href && <Link href={a.href}>ver detalhe →</Link>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ============ 6. ANÁLISES ============ */}
      <h2 className="sec">06 · Análises de compra</h2>
      <div className="panel">
        <div className="hd">
          <div className="subtabs">
            <button className={`subtab ${aba === 'etapas' ? 'on' : ''}`} onClick={() => setAba('etapas')}>Orçado × Comprado</button>
            <button className={`subtab ${aba === 'abc' ? 'on' : ''}`} onClick={() => setAba('abc')}>Curva ABC</button>
            <button className={`subtab ${aba === 'fornecedores' ? 'on' : ''}`} onClick={() => setAba('fornecedores')}>Fornecedores</button>
          </div>
        </div>
        <div className="bd tblwrap">
          {aba === 'etapas' && (
            <table>
              <thead><tr><th>Etapa</th><th className="num">Orçado</th><th className="num">Comprado</th><th className="num">Desvio</th><th>Consumo</th></tr></thead>
              <tbody>
                {p.desvios.filter((d: any) => Number(d.valor_orcado) > 0).map((d: any, i: number) => {
                  const cons = Number(d.valor_comprado) / Number(d.valor_orcado) * 100;
                  const cor = cons > 100 ? 'var(--brand)' : cons > 85 ? 'var(--warn)' : 'var(--ok)';
                  return (
                    <tr key={i}>
                      <td><b>{d.etapa}</b></td>
                      <td className="num">{fmtC(Number(d.valor_orcado))}</td>
                      <td className="num">{Number(d.valor_comprado) ? fmtC(Number(d.valor_comprado)) : '—'}</td>
                      <td className="num" style={{ fontWeight: 600, color: Number(d.desvio_compra) > 0 ? 'var(--brand)' : 'var(--gray)' }}>
                        {Number(d.valor_comprado) ? `${Number(d.desvio_compra) > 0 ? '+' : ''}${fmtC(Number(d.desvio_compra))}` : '—'}
                      </td>
                      <td style={{ minWidth: 120 }}>
                        <div className="bar"><i style={{ width: `${Math.min(100, cons)}%`, background: cor }} /></div>
                        <div className="hint" style={{ marginTop: 3, color: cor }}>{fmtPct(cons)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {aba === 'abc' && (
            <table>
              <thead><tr><th>Classe</th><th>Item</th><th>Fornecedor</th><th className="num">Valor</th><th className="num">% acum.</th></tr></thead>
              <tbody>
                {p.abc.map((a: any, i: number) => (
                  <tr key={i}>
                    <td><span className={`stamp ${a.classe === 'A' ? 'st-risk' : a.classe === 'B' ? 'st-valid' : 'st-pend'}`}>{a.classe}</span></td>
                    <td><b>{a.item}</b></td><td>{a.fornecedor}</td>
                    <td className="num">{fmtC(Number(a.valor))}</td>
                    <td className="num">{fmtPct(Number(a.pct_acumulado))}</td>
                  </tr>
                ))}
                {p.abc.length === 0 && <tr><td colSpan={5} className="hint">Sem compras aprovadas. A curva se forma conforme os pedidos são autorizados.</td></tr>}
              </tbody>
            </table>
          )}
          {aba === 'fornecedores' && (
            <table>
              <thead><tr><th>Fornecedor</th><th className="num">Cotações</th><th className="num">Vitórias</th><th className="num">Taxa</th><th className="num">Contratado</th></tr></thead>
              <tbody>
                {p.fornecedores.map((f: any, i: number) => (
                  <tr key={i}>
                    <td><b>{f.fornecedor}</b><div className="hint" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{f.cnpj ?? '—'}</div></td>
                    <td className="num">{f.cotacoes_apresentadas}</td><td className="num">{f.cotacoes_vencidas}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{fmtPct(Number(f.taxa_vitoria))}</td>
                    <td className="num" style={{ color: 'var(--ok)' }}>{f.valor_contratado ? fmtC(Number(f.valor_contratado)) : '—'}</td>
                  </tr>
                ))}
                {p.fornecedores.length === 0 && <tr><td colSpan={5} className="hint">Nenhuma cotação registrada.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
