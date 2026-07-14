import { supabaseServer } from '@/lib/supabase/server';
import { CONTRATO, MESES, fmtBRL, fmtPct } from '@/lib/contrato';

export const dynamic = 'force-dynamic';

export default async function Visao() {
  const supabase = supabaseServer();
  const [{ data: eventos }, { data: checklist }, { data: tarefas }, { data: pedidos }] = await Promise.all([
    supabase.from('eventos').select('*').order('mes').order('id'),
    supabase.from('checklist').select('*'),
    supabase.from('tarefas').select('*'),
    supabase.from('pedidos_materiais').select('id, titulo, status'),
  ]);

  const evs = eventos ?? [];
  const medidos = evs.filter(e => ['aprovado', 'glosado'].includes(e.status));
  const medidoBruto = medidos.reduce((s, e) => s + Number(e.valor_bruto) - Number(e.valor_glosa || 0), 0);
  const retido = medidoBruto * CONTRATO.retencaoPct;
  const liberado = medidoBruto - retido;
  const pct = medidoBruto / CONTRATO.valorGlobal * 100;
  const mesAtual = 2; // Jul/26 — ajuste conforme avanço real
  const planAcum = MESES.filter(m => m.id <= mesAtual).reduce((s, m) => s + m.plan, 0);
  const desvio = medidoBruto - planAcum;
  const dias = Math.ceil((new Date(CONTRATO.entregaFinal + 'T12:00:00').getTime() - Date.now()) / 86400000);
  const emValidacao = evs.filter(e => e.status === 'validacao');
  const pendConf = (checklist ?? []).filter(c => !c.concluido).length;
  const hoje = new Date().toISOString().slice(0, 10);
  const tarefasAtraso = (tarefas ?? []).filter(t => t.prazo && t.prazo < hoje && t.coluna < 3).length;
  const pedidosAguardando = (pedidos ?? []).filter(p => p.status === 'enviado');
  const maxPlan = Math.max(...MESES.map(m => m.plan));

  return (
    <>
      <div className="kpis">
        <div className="kpi blu"><div className="lbl">Valor Global</div><div className="val">{fmtBRL(CONTRATO.valorGlobal)}</div><div className="foot">fixo e irreajustável (Cl. 3.1)</div></div>
        <div className="kpi acc"><div className="lbl">Medido acumulado</div><div className="val">{fmtBRL(medidoBruto)}</div><div className="foot">{fmtPct(pct)} do contrato</div></div>
        <div className="kpi okk"><div className="lbl">Liberado (líquido)</div><div className="val">{fmtBRL(liberado)}</div><div className="foot">após retenção de 10%</div></div>
        <div className="kpi wrn"><div className="lbl">Retenção acumulada</div><div className="val">{fmtBRL(retido)}</div><div className="foot">garantia de fiel execução (Cl. 3.5)</div></div>
        <div className={`kpi ${desvio >= 0 ? 'okk' : 'wrn'}`}><div className="lbl">Desvio vs. planejado</div><div className="val">{desvio >= 0 ? '+' : ''}{fmtBRL(desvio)}</div><div className="foot">planejado até M{String(mesAtual).padStart(2, '0')}: {fmtBRL(planAcum)}</div></div>
        <div className="kpi blu"><div className="lbl">Prazo final</div><div className="val">{dias} dias</div><div className="foot">entrega em 10/05/2027</div></div>
      </div>

      <h2 className="sec">Régua de medições mensais (Anexo III)</h2>
      <div className="panel"><div className="bd">
        <div className="hint" style={{marginBottom:8}}>Planejado por mês. M13/M17/M21: liberação escalonada da retenção residual (Cl. 3.5.2.1, corrigida por IPCA).</div>
        <div className="tblwrap"><table>
          <thead><tr><th>Mês</th><th>Ref.</th><th className="num">Planejado</th><th>Distribuição</th></tr></thead>
          <tbody>
            {MESES.map(m => (
              <tr key={m.id} style={m.id === mesAtual ? {background:'var(--warn-soft)'} : undefined}>
                <td style={{fontFamily:'var(--mono)',fontWeight:600}}>M{String(m.id).padStart(2,'0')}{m.id === mesAtual ? ' ◀ atual' : ''}</td>
                <td>{m.ref}</td>
                <td className="num">{fmtBRL(m.plan)}</td>
                <td><div className="bar"><i style={{width:`${m.plan / maxPlan * 100}%`}} /></div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div></div>
    </>
  );
}
