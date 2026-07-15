'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { fmtBRL, fmtPct, fmtData, diasAte } from '@/lib/contrato';
import { projetarCaixa } from '@/lib/financeiro';

type Aba = 'carteira' | 'desvios' | 'abc' | 'fornecedores';

export default function PainelCeoClient({ obras, desvios, abc, fornecedores, saldo, lancamentos }:
  { obras: any[]; desvios: any[]; abc: any[]; fornecedores: any[]; saldo: number; lancamentos: any[] }) {
  const [aba, setAba] = useState<Aba>('carteira');
  const [obraSel, setObraSel] = useState<string>('');

  const carteira = obras.reduce((s, o) => s + Number(o.valor_global || 0), 0);
  const medido = obras.reduce((s, o) => s + Number(o.medido || 0), 0);
  const comprado = obras.reduce((s, o) => s + Number(o.custo_comprado || 0), 0);
  const aReceber = obras.reduce((s, o) => s + Number(o.a_receber || 0), 0);
  const aPagar = obras.reduce((s, o) => s + Number(o.a_pagar || 0), 0);
  const margem = medido - comprado;
  const margemPct = medido > 0 ? margem / medido * 100 : 0;
  const projecao = useMemo(() => projetarCaixa(lancamentos, saldo, 12), [lancamentos, saldo]);
  const menorSaldo = projecao.length ? Math.min(...projecao.map(p => p.saldo)) : saldo;

  const decisoes = obras.reduce((s, o) => s + Number(o.em_validacao || 0) + Number(o.pedidos_aguardando || 0), 0);
  const riscos = obras.reduce((s, o) => s + Number(o.docs_vencidos || 0) + Number(o.fvs_reprovadas || 0), 0);

  const desviosVis = obraSel ? desvios.filter(d => String(d.obra_id) === obraSel) : desvios;
  const abcVis = obraSel ? abc.filter(a => String(a.obra_id) === obraSel) : abc;
  const estouros = desvios.filter(d => Number(d.desvio_compra) > 0);

  // avanço planejado vs real por obra
  const planejado = (o: any) => {
    const meses = (o.meses ?? []) as any[];
    const acum = meses.filter(m => m.id <= o.mes_atual).reduce((s, m) => s + Number(m.plan), 0);
    return o.valor_global ? acum / Number(o.valor_global) * 100 : 0;
  };

  const AbaBtn = ({ id, children }: { id: Aba; children: React.ReactNode }) => (
    <button className={`subtab ${aba === id ? 'on' : ''}`} onClick={() => setAba(id)}>{children}</button>
  );

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Painel executivo</h2>
        <p className="hint">Visão consolidada da carteira · atualizada em tempo real a partir das medições, compras e financeiro</p>
      </div>

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
        <div className="kpi blu"><div className="lbl">Carteira contratada</div><div className="val">{fmtBRL(carteira)}</div><div className="foot">{obras.length} obra(s)</div></div>
        <div className="kpi acc"><div className="lbl">Medido acumulado</div><div className="val">{fmtBRL(medido)}</div><div className="foot">{fmtPct(carteira ? medido / carteira * 100 : 0)} da carteira</div></div>
        <div className={`kpi ${margem >= 0 ? 'okk' : 'acc'}`}><div className="lbl">Margem realizada</div><div className="val">{fmtBRL(margem)}</div><div className="foot">{fmtPct(margemPct)} sobre o medido</div></div>
        <div className={`kpi ${menorSaldo < 0 ? 'acc' : 'okk'}`}><div className="lbl">Menor caixa projetado</div><div className="val">{fmtBRL(menorSaldo)}</div><div className="foot">12 semanas</div></div>
        <div className="kpi wrn"><div className="lbl">Esperando decisão</div><div className="val">{decisoes}</div><div className="foot">medições e compras</div></div>
        <div className={`kpi ${riscos ? 'acc' : 'okk'}`}><div className="lbl">Pontos de risco</div><div className="val">{riscos}</div><div className="foot">docs vencidos + NC de qualidade</div></div>
      </div>

      {/* Sinais que exigem ação */}
      <div style={{ marginTop: 14 }}>
        {menorSaldo < 0 && (
          <div className="alert risk"><b>⚠ Caixa projetado negativo</b>
            O saldo chega a {fmtBRL(menorSaldo)} nas próximas 12 semanas. Antecipe recebíveis ou reprograme compras — veja o <Link href="/financeiro">Financeiro</Link>.</div>
        )}
        {estouros.length > 0 && (
          <div className="alert warn"><b>📊 {estouros.length} etapa(s) com compra acima do orçado</b>
            {estouros.slice(0, 3).map(e => `${e.etapa} (${fmtPct(Number(e.desvio_pct))})`).join(' · ')}
            {estouros.length > 3 ? ` e mais ${estouros.length - 3}` : ''} — veja a aba Desvios.</div>
        )}
        {decisoes > 0 && (
          <div className="alert info"><b>⏱ {decisoes} decisão(ões) travada(s) com você</b>
            Medições e pedidos parados param a obra e o caixa da contratada. Resolva no <Link href="/meu-dia">Meu Dia</Link>.</div>
        )}
        {riscos > 0 && (
          <div className="alert warn"><b>🛡 {riscos} ponto(s) de risco contratual</b>
            Documentos vencidos autorizam retenção de medição (Cl. 13.3); FVS reprovadas indicam retrabalho a corrigir.</div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 4 }}>
        <div className="hd">
          <div className="subtabs">
            <AbaBtn id="carteira">Carteira</AbaBtn>
            <AbaBtn id="desvios">Orçado × Comprado</AbaBtn>
            <AbaBtn id="abc">Curva ABC</AbaBtn>
            <AbaBtn id="fornecedores">Fornecedores</AbaBtn>
          </div>
          {aba !== 'carteira' && aba !== 'fornecedores' && (
            <select value={obraSel} onChange={e => setObraSel(e.target.value)}
              style={{ border: '1px solid var(--line-strong)', borderRadius: 4, padding: '6px 8px', background: 'var(--paper)' }}>
              <option value="">Todas as obras</option>
              {obras.map(o => <option key={o.obra_id} value={o.obra_id}>{o.codigo}</option>)}
            </select>
          )}
        </div>

        <div className="bd">
          {aba === 'carteira' && (
            <div className="tblwrap"><table>
              <thead><tr>
                <th>Obra</th><th className="num">Valor global</th><th className="num">Medido</th>
                <th>Avanço real × planejado</th><th className="num">Comprado</th><th className="num">Margem</th>
                <th className="num">Entrega</th><th>Sinais</th>
              </tr></thead>
              <tbody>
                {obras.map(o => {
                  const real = Number(o.avanco_pct);
                  const plan = planejado(o);
                  const atras = real < plan - 5;
                  const mg = Number(o.medido) - Number(o.custo_comprado);
                  const dias = diasAte(o.entrega_final);
                  const sinais = Number(o.em_validacao) + Number(o.pedidos_aguardando) + Number(o.docs_vencidos) + Number(o.fvs_reprovadas);
                  return (
                    <tr key={o.obra_id}>
                      <td><b>{o.codigo}</b><div className="hint">{o.nome}</div></td>
                      <td className="num">{fmtBRL(Number(o.valor_global))}</td>
                      <td className="num">{fmtBRL(Number(o.medido))}</td>
                      <td style={{ minWidth: 150 }}>
                        <div className="bar" style={{ position: 'relative' }}>
                          <i style={{ width: `${Math.min(100, real)}%`, background: atras ? 'var(--risk)' : 'var(--brand)' }} />
                          <span style={{ position: 'absolute', left: `${Math.min(100, plan)}%`, top: -2, width: 2, height: 12, background: 'var(--gray)' }} title={`planejado ${fmtPct(plan)}`} />
                        </div>
                        <div className="hint" style={{ marginTop: 3, color: atras ? 'var(--risk)' : undefined }}>
                          {fmtPct(real)} real · {fmtPct(plan)} planejado {atras ? '⚠ atrasado' : ''}
                        </div>
                      </td>
                      <td className="num">{fmtBRL(Number(o.custo_comprado))}</td>
                      <td className="num" style={{ fontWeight: 600, color: mg >= 0 ? 'var(--ok)' : 'var(--risk)' }}>{fmtBRL(mg)}</td>
                      <td className="num" style={{ color: dias < 60 ? 'var(--warn)' : undefined }}>{fmtData(o.entrega_final)}<div className="hint">{dias} dias</div></td>
                      <td>{sinais > 0 ? <span className="stamp st-valid"><span className="dot" />{sinais}</span> : <span className="stamp st-ok"><span className="dot" />OK</span>}</td>
                    </tr>
                  );
                })}
                {obras.length === 0 && <tr><td colSpan={8} className="hint">Nenhuma obra na carteira.</td></tr>}
              </tbody>
            </table></div>
          )}

          {aba === 'desvios' && (
            <>
              <p className="hint" style={{ marginBottom: 10 }}>
                Orçamento da proposta × compras efetivamente aprovadas por etapa. Desvio positivo = comprou acima do orçado (come a margem).
              </p>
              <div className="tblwrap"><table>
                <thead><tr><th>Etapa</th><th className="num">Orçado</th><th className="num">Contratado</th><th className="num">Medido</th><th className="num">Comprado</th><th className="num">Desvio</th><th>Consumo do orçamento</th></tr></thead>
                <tbody>
                  {desviosVis.filter(d => Number(d.valor_orcado) > 0).map((d, i) => {
                    const cons = Number(d.valor_orcado) ? Number(d.valor_comprado) / Number(d.valor_orcado) * 100 : 0;
                    const cor = cons > 100 ? 'var(--risk)' : cons > 85 ? 'var(--warn)' : 'var(--ok)';
                    return (
                      <tr key={i} style={Number(d.desvio_compra) > 0 ? { background: 'var(--risk-soft)' } : undefined}>
                        <td><b>{d.etapa}</b></td>
                        <td className="num">{fmtBRL(Number(d.valor_orcado))}</td>
                        <td className="num">{fmtBRL(Number(d.valor_contratado))}</td>
                        <td className="num">{fmtBRL(Number(d.valor_medido))}</td>
                        <td className="num">{Number(d.valor_comprado) ? fmtBRL(Number(d.valor_comprado)) : '—'}</td>
                        <td className="num" style={{ fontWeight: 600, color: Number(d.desvio_compra) > 0 ? 'var(--risk)' : 'var(--gray)' }}>
                          {Number(d.valor_comprado) ? `${Number(d.desvio_compra) > 0 ? '+' : ''}${fmtBRL(Number(d.desvio_compra))}` : '—'}
                        </td>
                        <td style={{ minWidth: 130 }}>
                          <div className="bar"><i style={{ width: `${Math.min(100, cons)}%`, background: cor }} /></div>
                          <div className="hint" style={{ marginTop: 3, color: cor }}>{fmtPct(cons)}</div>
                        </td>
                      </tr>
                    );
                  })}
                  {desviosVis.length === 0 && <tr><td colSpan={7} className="hint">Orçamento não cadastrado para esta obra.</td></tr>}
                </tbody>
              </table></div>
              <p className="hint" style={{ marginTop: 8 }}>
                O desvio só aparece quando há pedido de materiais <b>aprovado e vinculado a um evento</b> daquela etapa. Vincule sempre o pedido ao evento (aba Materiais) para o comparativo funcionar.
              </p>
            </>
          )}

          {aba === 'abc' && (
            <>
              <p className="hint" style={{ marginBottom: 10 }}>
                Classe <b>A</b> = 80% do custo (negocie aqui, é onde 1% vira dinheiro) · <b>B</b> = próximos 15% · <b>C</b> = os 5% restantes.
              </p>
              <div className="tblwrap"><table>
                <thead><tr><th>Classe</th><th>Item</th><th>Fornecedor</th><th className="num">Valor</th><th className="num">% do total</th><th className="num">Acumulado</th></tr></thead>
                <tbody>
                  {abcVis.map((a, i) => (
                    <tr key={i}>
                      <td><span className={`stamp ${a.classe === 'A' ? 'st-risk' : a.classe === 'B' ? 'st-valid' : 'st-pend'}`}>{a.classe}</span></td>
                      <td><b>{a.item}</b></td>
                      <td>{a.fornecedor}</td>
                      <td className="num">{fmtBRL(Number(a.valor))}</td>
                      <td className="num">{fmtPct(Number(a.pct_item))}</td>
                      <td className="num">{fmtPct(Number(a.pct_acumulado))}</td>
                    </tr>
                  ))}
                  {abcVis.length === 0 && <tr><td colSpan={6} className="hint">Nenhuma compra aprovada ainda. A curva se forma conforme os pedidos são aprovados.</td></tr>}
                </tbody>
              </table></div>
            </>
          )}

          {aba === 'fornecedores' && (
            <>
              <p className="hint" style={{ marginBottom: 10 }}>Histórico consolidado das cotações. Taxa de vitória alta com ticket baixo = parceiro competitivo.</p>
              <div className="tblwrap"><table>
                <thead><tr><th>Fornecedor</th><th>CNPJ</th><th className="num">Cotações</th><th className="num">Vitórias</th><th className="num">Taxa</th><th className="num">Ticket médio</th><th className="num">Contratado</th></tr></thead>
                <tbody>
                  {fornecedores.map((f, i) => (
                    <tr key={i}>
                      <td><b>{f.fornecedor}</b></td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{f.cnpj ?? '—'}</td>
                      <td className="num">{f.cotacoes_apresentadas}</td>
                      <td className="num">{f.cotacoes_vencidas}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{fmtPct(Number(f.taxa_vitoria))}</td>
                      <td className="num">{fmtBRL(Number(f.ticket_medio))}</td>
                      <td className="num" style={{ color: 'var(--ok)' }}>{f.valor_contratado ? fmtBRL(Number(f.valor_contratado)) : '—'}</td>
                    </tr>
                  ))}
                  {fornecedores.length === 0 && <tr><td colSpan={7} className="hint">Nenhuma cotação registrada.</td></tr>}
                </tbody>
              </table></div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
