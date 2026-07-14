import { supabaseServer } from '@/lib/supabase/server';
import { CONTRATO, STATUS_LABEL, fmtBRL, fmtPct } from '@/lib/contrato';

export const dynamic = 'force-dynamic';

export default async function Medicoes() {
  const supabase = supabaseServer();
  const { data: eventos } = await supabase.from('eventos').select('*').order('mes').order('id');
  const evs = eventos ?? [];
  const medidos = evs.filter(e => ['aprovado','glosado'].includes(e.status));
  const bruto = (e: any) => Number(e.valor_bruto) - Number(e.valor_glosa || 0);
  const medidoBruto = medidos.reduce((s, e) => s + bruto(e), 0);
  const retido = medidoBruto * 0.1;
  const liberado = medidoBruto - retido;

  return (
    <>
      <div className="kpis" style={{gridTemplateColumns:'repeat(5,1fr)'}}>
        <div className="kpi blu"><div className="lbl">Medições aprovadas</div><div className="val">{medidos.length} / {evs.length}</div></div>
        <div className="kpi acc"><div className="lbl">Medido bruto</div><div className="val">{fmtBRL(medidoBruto)}</div><div className="foot">{fmtPct(medidoBruto / CONTRATO.valorGlobal * 100)} do global</div></div>
        <div className="kpi okk"><div className="lbl">Liberado</div><div className="val">{fmtBRL(liberado)}</div><div className="foot">+ kick-off {fmtBRL(CONTRATO.kickoff)}</div></div>
        <div className="kpi wrn"><div className="lbl">Retido (10%)</div><div className="val">{fmtBRL(retido)}</div></div>
        <div className="kpi"><div className="lbl">Saldo a medir</div><div className="val">{fmtBRL(CONTRATO.valorGlobal - medidoBruto)}</div></div>
      </div>

      <h2 className="sec">Boletim consolidado de medições</h2>
      <div className="panel"><div className="bd tblwrap">
        <p className="hint" style={{marginBottom:10}}>Retenção técnica de 10% por medição (Cl. 3.5). Pagamento em até 15 dias após validação da NF (Cl. 3.2); análise em até 7 dias úteis (Cl. 3.4.6). Split: 65% faturamento direto · 35% construtora (Anexo III).</p>
        <table>
          <thead><tr><th>Evento</th><th>Etapa</th><th className="num">Bruto</th><th className="num">Glosa</th><th className="num">Fat. direto</th><th className="num">Retenção</th><th className="num">Líquido pago</th><th>Status</th></tr></thead>
          <tbody>
            {evs.map(e => {
              const [lbl, cls] = STATUS_LABEL[e.status] ?? ['?', 'st-pend'];
              const medido = ['aprovado','glosado'].includes(e.status);
              return (
                <tr key={e.id}>
                  <td style={{fontFamily:'var(--mono)',fontWeight:600}}>{e.id}</td>
                  <td>{e.etapa}</td>
                  <td className="num">{fmtBRL(Number(e.valor_bruto))}</td>
                  <td className="num" style={{color: Number(e.valor_glosa) > 0 ? 'var(--risk)' : undefined}}>{Number(e.valor_glosa) > 0 ? fmtBRL(Number(e.valor_glosa)) : '—'}</td>
                  <td className="num">{fmtBRL(Number(e.faturamento_direto))}</td>
                  <td className="num" style={{color:'var(--warn)'}}>{medido ? fmtBRL(bruto(e) * 0.1) : '—'}</td>
                  <td className="num" style={{color: medido ? 'var(--ok)' : undefined}}>{medido ? fmtBRL(bruto(e) * 0.9) : '—'}</td>
                  <td><span className={`stamp ${cls}`}><span className="dot" />{lbl}</span></td>
                </tr>
              );
            })}
            <tr style={{background:'var(--paper-2)'}}>
              <td colSpan={2}><b>TOTAL MEDIDO</b></td>
              <td className="num"><b>{fmtBRL(medidoBruto)}</b></td><td />
              <td className="num">{fmtBRL(medidos.reduce((s,e)=>s+Number(e.faturamento_direto),0))}</td>
              <td className="num" style={{color:'var(--warn)'}}>{fmtBRL(retido)}</td>
              <td className="num" style={{color:'var(--ok)'}}>{fmtBRL(liberado)}</td><td />
            </tr>
          </tbody>
        </table>
      </div></div>
    </>
  );
}
