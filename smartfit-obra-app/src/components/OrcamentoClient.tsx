'use client';
import { useMemo, useState } from 'react';

const fmt = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (n: number) => (Number(n || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';

// Nome da etapa pelo numero (o etapa_num do item). Espelha a proposta.
const ETAPAS: Record<number, string> = {
  0: 'Projetos Executivos', 1: 'Administração de Obras', 2: 'Serviços Preliminares',
  3: 'Movimentação de Terra', 4: 'Fundação e Arrimo', 5: 'Impermeabilização',
  6: 'Instalações Gerais', 7: 'Piso (Térreo)', 8: 'Steel Deck', 10: 'Estrutura Metálica',
  11: 'Vedação Externa', 12: 'Cobertura', 13: 'Pintura', 14: 'Transporte', 15: 'Serviços Diversos',
};

export default function OrcamentoClient({ itens, obra }: { itens: any[]; obra: any }) {
  const [aberta, setAberta] = useState<number | null>(null);
  const [soDesvio, setSoDesvio] = useState(false);

  // Totais gerais
  const tot = useMemo(() => itens.reduce((a, i) => ({
    orcado: a.orcado + Number(i.custo_orcado),
    contratado: a.contratado + Number(i.contratado),
    realizado: a.realizado + Number(i.realizado),
  }), { orcado: 0, contratado: 0, realizado: 0 }), [itens]);

  // Agrupa por etapa
  const etapas = useMemo(() => {
    const m = new Map<number, any>();
    for (const i of itens) {
      const k = i.etapa_num ?? 99;
      if (!m.has(k)) m.set(k, { num: k, nome: ETAPAS[k] ?? `Etapa ${k}`, itens: [], orcado: 0, contratado: 0, realizado: 0 });
      const e = m.get(k);
      e.itens.push(i);
      e.orcado += Number(i.custo_orcado);
      e.contratado += Number(i.contratado);
      e.realizado += Number(i.realizado);
    }
    return Array.from(m.values()).sort((a, b) => a.num - b.num);
  }, [itens]);

  const desvioTot = tot.orcado > 0 ? (tot.realizado - tot.orcado) / tot.orcado : 0;

  // cor do desvio: verde dentro do orcado, vermelho estourou
  const corDesvio = (real: number, orc: number) => {
    if (orc === 0) return real > 0 ? 'var(--risk)' : 'var(--gray)';
    const d = (real - orc) / orc;
    if (d > 0.001) return 'var(--risk)';
    if (real > 0) return 'var(--ok)';
    return 'var(--gray)';
  };

  const barra = (real: number, contr: number, orc: number) => {
    const base = Math.max(orc, contr, real, 1);
    return (
      <div style={{ position: 'relative', height: 14, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', height: '100%', width: `${Math.min(100, contr / base * 100)}%`, background: 'var(--info-soft)' }} />
        <div style={{ position: 'absolute', height: '100%', width: `${Math.min(100, real / base * 100)}%`, background: real > orc ? 'var(--risk)' : 'var(--ok)' }} />
        {orc > 0 && orc < base && <div style={{ position: 'absolute', height: '100%', width: 2, left: `${orc / base * 100}%`, background: 'var(--ink)' }} title="orçado" />}
      </div>
    );
  };

  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="kpi blu"><div className="lbl">Orçado (custo)</div><div className="val">{fmt(tot.orcado)}</div><div className="foot">teto de execução</div></div>
        <div className="kpi acc"><div className="lbl">Contratado</div><div className="val">{fmt(tot.contratado)}</div><div className="foot">comprometido ({pct(tot.orcado ? tot.contratado / tot.orcado : 0)})</div></div>
        <div className="kpi wrn"><div className="lbl">Realizado</div><div className="val">{fmt(tot.realizado)}</div><div className="foot">pago ({pct(tot.orcado ? tot.realizado / tot.orcado : 0)})</div></div>
        <div className={`kpi ${desvioTot > 0 ? 'acc' : 'okk'}`}><div className="lbl">Saldo a realizar</div><div className="val">{fmt(tot.orcado - tot.realizado)}</div><div className="foot">{desvioTot > 0 ? `estouro de ${pct(desvioTot)}` : 'dentro do orçado'}</div></div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="hd">
          <h3>Orçado × Realizado — {obra.codigo}</h3>
          <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={soDesvio} onChange={e => setSoDesvio(e.target.checked)} />
            só itens com estouro
          </label>
        </div>
        <div className="bd" style={{ padding: 0 }}>
          <div className="tblwrap"><table>
            <thead><tr>
              <th>Etapa / item</th>
              <th className="num">Orçado</th>
              <th className="num">Contratado</th>
              <th className="num">Realizado</th>
              <th className="num">Saldo</th>
              <th className="num">Desvio</th>
              <th style={{ width: 140 }}>Execução</th>
            </tr></thead>
            <tbody>
              {etapas.map(e => {
                const dEt = e.orcado > 0 ? (e.realizado - e.orcado) / e.orcado : 0;
                const temEstouro = e.itens.some((i: any) => Number(i.realizado) > Number(i.custo_orcado) && Number(i.custo_orcado) > 0);
                if (soDesvio && !temEstouro) return null;
                const abertaEt = aberta === e.num;
                return (
                  <>
                    <tr key={`e-${e.num}`} style={{ cursor: 'pointer', background: 'var(--surface-2)', fontWeight: 600 }}
                      onClick={() => setAberta(a => a === e.num ? null : e.num)}>
                      <td>{abertaEt ? '▾' : '▸'} {e.nome} <span className="hint" style={{ fontWeight: 400 }}>({e.itens.length})</span></td>
                      <td className="num">{fmt(e.orcado)}</td>
                      <td className="num">{fmt(e.contratado)}</td>
                      <td className="num">{fmt(e.realizado)}</td>
                      <td className="num">{fmt(e.orcado - e.realizado)}</td>
                      <td className="num" style={{ color: corDesvio(e.realizado, e.orcado) }}>{e.realizado > 0 || e.orcado === 0 ? pct(dEt) : '—'}</td>
                      <td>{barra(e.realizado, e.contratado, e.orcado)}</td>
                    </tr>
                    {abertaEt && e.itens.map((i: any) => {
                      const d = Number(i.custo_orcado) > 0 ? (Number(i.realizado) - Number(i.custo_orcado)) / Number(i.custo_orcado) : 0;
                      return (
                        <tr key={`i-${i.id}`}>
                          <td style={{ paddingLeft: 24 }}>
                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--gray)', fontSize: 11 }}>{i.codigo}</span> {i.descricao}
                          </td>
                          <td className="num">{fmt(i.custo_orcado)}</td>
                          <td className="num">{Number(i.contratado) ? fmt(i.contratado) : '—'}</td>
                          <td className="num">{Number(i.realizado) ? fmt(i.realizado) : '—'}</td>
                          <td className="num">{fmt(i.saldo_a_realizar)}</td>
                          <td className="num" style={{ color: corDesvio(Number(i.realizado), Number(i.custo_orcado)) }}>
                            {Number(i.realizado) > 0 ? pct(d) : '—'}
                          </td>
                          <td>{barra(Number(i.realizado), Number(i.contratado), Number(i.custo_orcado))}</td>
                        </tr>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--line-strong)' }}>
                <td>TOTAL</td>
                <td className="num">{fmt(tot.orcado)}</td>
                <td className="num">{fmt(tot.contratado)}</td>
                <td className="num">{fmt(tot.realizado)}</td>
                <td className="num">{fmt(tot.orcado - tot.realizado)}</td>
                <td className="num" style={{ color: desvioTot > 0 ? 'var(--risk)' : 'var(--ok)' }}>{pct(desvioTot)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table></div>
        </div>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        Orçado = custo executivo (venda ÷ 1,28). Contratado = lançamentos previstos/confirmados apropriados. Realizado = lançamentos pagos.
        A barra mostra realizado (verde/vermelho) sobre contratado (azul); o traço preto marca o orçado.
        Apropriações se fazem no Financeiro, em cada lançamento.
      </p>
    </>
  );
}
