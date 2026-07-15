import { supabaseServer } from '@/lib/supabase/server';
import { exigirObra } from '@/lib/obra';
import { fmtBRL, fmtPct, diasAte } from '@/lib/contrato';

export const dynamic = 'force-dynamic';

export default async function Visao() {
  const obra = await exigirObra();
  const supabase = supabaseServer();
  const { data: eventos } = await supabase.from('eventos').select('*').eq('obra_id', obra.id).order('mes').order('id');

  const evs = eventos ?? [];
  const medidos = evs.filter(e => ['aprovado', 'glosado'].includes(e.status));
  const medidoBruto = medidos.reduce((s, e) => s + Number(e.valor_bruto) - Number(e.valor_glosa || 0), 0);
  const retido = medidoBruto * Number(obra.retencao_pct);
  const liberado = medidoBruto - retido;
  const pct = obra.valor_global ? medidoBruto / Number(obra.valor_global) * 100 : 0;
  const meses = (obra.meses ?? []) as { id: number; ref: string; plan: number }[];
  const planAcum = meses.filter(m => m.id <= obra.mes_atual).reduce((s, m) => s + Number(m.plan), 0);
  const desvio = medidoBruto - planAcum;
  const maxPlan = meses.length ? Math.max(...meses.map(m => Number(m.plan))) : 0;

  return (
    <>
      <div className="kpis">
        <div className="kpi blu"><div className="lbl">Valor Global</div><div className="val">{fmtBRL(Number(obra.valor_global))}</div><div className="foot">fixo e irreajustável (Cl. 3.1)</div></div>
        <div className="kpi acc"><div className="lbl">Medido acumulado</div><div className="val">{fmtBRL(medidoBruto)}</div><div className="foot">{fmtPct(pct)} do contrato</div></div>
        <div className="kpi okk"><div className="lbl">Liberado (líquido)</div><div className="val">{fmtBRL(liberado)}</div><div className="foot">após retenção de {fmtPct(Number(obra.retencao_pct) * 100)}</div></div>
        <div className="kpi wrn"><div className="lbl">Retenção acumulada</div><div className="val">{fmtBRL(retido)}</div><div className="foot">garantia de fiel execução (Cl. 3.5)</div></div>
        <div className={`kpi ${desvio >= 0 ? 'okk' : 'wrn'}`}><div className="lbl">Desvio vs. planejado</div><div className="val">{desvio >= 0 ? '+' : ''}{fmtBRL(desvio)}</div><div className="foot">planejado até M{String(obra.mes_atual).padStart(2, '0')}: {fmtBRL(planAcum)}</div></div>
        <div className="kpi blu"><div className="lbl">Prazo final</div><div className="val">{diasAte(obra.entrega_final)} dias</div><div className="foot">entrega em {obra.entrega_final ? new Date(obra.entrega_final + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</div></div>
      </div>

      <h2 className="sec">Régua de medições mensais</h2>
      <div className="panel"><div className="bd">
        {meses.length === 0
          ? <p className="hint">Esta obra ainda não tem cronograma de medições cadastrado.</p>
          : (<div className="tblwrap"><table>
              <thead><tr><th>Mês</th><th>Ref.</th><th className="num">Planejado</th><th>Distribuição</th></tr></thead>
              <tbody>
                {meses.map(m => (
                  <tr key={m.id} style={m.id === obra.mes_atual ? { background: 'var(--warn-soft)' } : undefined}>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>M{String(m.id).padStart(2, '0')}{m.id === obra.mes_atual ? ' ◀ atual' : ''}</td>
                    <td>{m.ref}</td>
                    <td className="num">{fmtBRL(Number(m.plan))}</td>
                    <td><div className="bar"><i style={{ width: `${maxPlan ? Number(m.plan) / maxPlan * 100 : 0}%` }} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table></div>)}
      </div></div>
    </>
  );
}
