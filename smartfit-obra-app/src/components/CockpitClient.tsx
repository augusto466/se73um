'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { fmtBRL, fmtPct, fmtData } from '@/lib/contrato';
import { analisarMargem, analisarCaixa, analisarPrazo, analisarGargalos, gerarAlertas, calcularSaude, CORES } from '@/lib/bi';

const fmtC = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export default function CockpitClient(p: any) {
  const [aba, setAba] = useState<'abc' | 'fornecedores' | 'etapas'>('etapas');

  const margem = useMemo(() => analisarMargem(p.obras, p.desvios), [p.obras, p.desvios]);
  const caixa = useMemo(() => analisarCaixa(p.lancamentos, p.saldo, p.saldoInformado), [p.lancamentos, p.saldo, p.saldoInformado]);
  const prazos = useMemo(() => analisarPrazo(p.obras), [p.obras]);
  const gargalos = useMemo(() => analisarGargalos(p.eventos, p.pedidos, p.cotacoes, p.obras), [p.eventos, p.pedidos, p.cotacoes, p.obras]);
  const alertas = useMemo(() => gerarAlertas(margem, caixa, prazos, p.desvios, p.docs, p.fvs, gargalos), [margem, caixa, prazos, p.desvios, p.docs, p.fvs, gargalos]);
  const saude = useMemo(() => calcularSaude(margem, caixa, prazos, alertas), [margem, caixa, prazos, alertas]);

  const criticos = alertas.filter((a: any) => a.nivel === 'critico').length;
  const impactoTravado = gargalos.reduce((s: number, g: any) => s + g.impacto, 0);
  const semSaude = saude.nota >= 75 ? 'ok' : saude.nota >= 50 ? 'atencao' : 'critico';
  const faltaDado = !p.saldoInformado || !margem.temProjecao;

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
                : gargalos.length > 0
                ? <><b>{fmtC(impactoTravado)}</b> em decisões esperando você. Nada crítico.</>
                : <>Nada crítico e nada travado. Bom momento para olhar adiante.</>}
              {faltaDado && <><br /><span style={{ color: 'var(--gray-2)', fontSize: 12 }}>
                ⓘ Leitura parcial: {[!p.saldoInformado && 'saldo de caixa não informado', !margem.temProjecao && 'poucas compras aprovadas para projetar margem'].filter(Boolean).join(' · ')}.
              </span></>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 44, fontWeight: 700, lineHeight: 1, color: CORES[semSaude] }}>{saude.nota}</div>
            <div style={{ fontSize: 9.5, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--gray)', fontWeight: 700, marginTop: 4 }}>
              Índice de saúde{saude.completo ? '' : ' · parcial'}
            </div>
            <div className="hint" style={{ fontSize: 10, marginTop: 3 }}>{saude.dims.map((d: any) => d.nome).join(' · ')}</div>
          </div>
        </div>

        <div className="cock-strip">
          <div className={`it ${(margem.temProjecao ? margem.margemProjPctTotal : margem.margemContratoPctTotal) < 10 ? 'risco' : ''}`}>
            <div className="n">{fmtPct(margem.temProjecao ? margem.margemProjPctTotal : margem.margemContratoPctTotal)}</div>
            <div className="l">Margem {margem.temProjecao ? 'projetada' : 'de contrato'}</div>
          </div>
          <div className={`it ${caixa.saldoInformado && caixa.semanasAteFurar !== null ? 'risco' : ''}`}>
            <div className="n" style={!caixa.saldoInformado ? { color: 'var(--gray)' } : undefined}>
              {!caixa.saldoInformado ? '—' : caixa.semanasAteFurar !== null ? `${caixa.semanasAteFurar}s` : '26s+'}
            </div>
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
            <div><div className="hint" style={{ fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontSize: 9.5 }}>
                {margem.temProjecao ? 'Projetada no fim' : 'Prevista na proposta'}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, color: (margem.temProjecao ? margem.margemProjetadaTotal : margem.margemContratoTotal) >= 0 ? 'var(--ok)' : 'var(--brand)' }}>
                {fmtC(margem.temProjecao ? margem.margemProjetadaTotal : margem.margemContratoTotal)}</div>
              <div className="hint">{margem.temProjecao ? 'estimativa' : 'valor global − orçamento'} · {fmtPct(margem.temProjecao ? margem.margemProjPctTotal : margem.margemContratoPctTotal)}</div></div>
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
                    <div className="hint">{o.projetavel ? 'margem projetada' : 'margem da proposta'}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: (o.projetavel ? o.margemProjPct : o.margemContratoPct) < 10 ? 'var(--brand)' : 'var(--ok)' }}>
                      {fmtC(o.projetavel ? o.margemProjetada : o.margemContrato)} · {fmtPct(o.projetavel ? o.margemProjPct : o.margemContratoPct)}
                    </div>
                  </div>
                </div>
              </div>

              {!o.projetavel && (
                <p className="hint" style={{ marginBottom: 8 }}>
                  ⓘ Sem base para projetar ({o.etapasCompradas} de {o.etapasTotal} etapas com compra aprovada; mínimo 2). Exibindo a margem prevista na proposta: valor global {fmtC(Number(o.valor_global))} − orçamento de custo {fmtC(o.orcadoTotal)}. A projeção liga quando as compras começarem.
                </p>
              )}
              {o.projetavel && (
                <p className="hint" style={{ marginBottom: 8 }}>
                  ⓘ Projeção com base em {o.etapasCompradas} de {o.etapasTotal} etapas compradas. Fator de desvio observado: {(o.fator * 100).toFixed(1)}% do orçado. Estimativa — ganha precisão a cada compra.
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
              <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, color: caixa.queima === null ? 'var(--gray)' : undefined }}>
                {caixa.queima === null ? '—' : fmtC(caixa.queima)}</div>
              <div className="hint">{caixa.queima === null ? 'sem movimento nas próximas 4 semanas' : '4 semanas · estimativa'}</div></div>
            <div><div className="hint" style={{ fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontSize: 9.5 }}>Runway</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, color: CORES[caixa.semaforo] }}>
                {!caixa.saldoInformado ? '—' : caixa.semanasAteFurar !== null ? `${caixa.semanasAteFurar} semanas` : '> 26 semanas'}
              </div>
              {!caixa.saldoInformado
                ? <div className="hint">informe o saldo para calcular</div>
                : caixa.semanaFura && <div className="hint">fura em {fmtData(caixa.semanaFura.ini)}</div>}</div>
          </div>

          {!p.saldoInformado && (
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
                    {!o.projetavel
                      ? <><span className="hint">ainda não projetável</span>
                          <div className="hint" style={{ fontSize: 10.5 }}>avanço abaixo de 8% — ritmo inicial não prevê o restante</div></>
                      : o.atrasoProjetado !== null && o.atrasoProjetado > 0
                      ? <><span style={{ color: 'var(--brand)', fontWeight: 600, fontSize: 12.5 }}>~{o.atrasoProjetado} dias de atraso</span>
                          <div className="hint">multa teto 10% (Cl. 8.1) ≈ {fmtC(Number(o.valor_global) * 0.1)}</div></>
                      : <span style={{ color: 'var(--ok)', fontWeight: 600, fontSize: 12.5 }}>dentro do prazo</span>}
                  </td>
                </tr>
              ))}
              {prazos.length === 0 && <tr><td colSpan={5} className="hint">Nenhuma obra na carteira.</td></tr>}
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 8 }}>
            O <b>gap</b> é dado firme (medido × cronograma aprovado). A <b>projeção</b> só aparece com avanço ≥ 8% — abaixo disso o ritmo inicial (projetos, mobilização) não representa o ritmo de execução.
          </p>
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
