import { Resend } from 'resend';
import { fmtBRL, fmtPct } from './contrato';

const resend = () => new Resend(process.env.RESEND_API_KEY!);
const FROM = () => process.env.EMAIL_REMETENTE || 'Painel de Obras <onboarding@resend.dev>';
const APP = () => process.env.NEXT_PUBLIC_APP_URL || '';

function layout(obra: { codigo: string; nome: string }, titulo: string, corpo: string) {
  return `<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;background:#EDEFF1;font-family:Arial,Helvetica,sans-serif;color:#161B21">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="background:#161B21;border-bottom:4px solid #D9531E;border-radius:6px 6px 0 0;padding:18px 20px">
      <div style="color:#fff;font-size:16px;font-weight:bold">${obra.nome}</div>
      <div style="color:#B9C2CA;font-size:12px;margin-top:4px">Contrato ${obra.codigo}</div>
    </div>
    <div style="background:#fff;border:1px solid #D6DBE0;border-top:0;padding:22px 20px">
      <h2 style="margin:0 0 12px;font-size:17px">${titulo}</h2>
      ${corpo}
      <p style="margin:22px 0 0"><a href="${APP()}" style="background:#D9531E;color:#fff;text-decoration:none;padding:10px 18px;border-radius:4px;font-weight:bold;font-size:13px">Abrir painel da obra</a></p>
    </div>
    <div style="text-align:center;color:#69747F;font-size:11px;padding:12px">Mensagem automática do painel de acompanhamento. Comunicações formais devem observar a Cláusula 17.1.</div>
  </div></body></html>`;
}

const linha = (l: string, v: string) =>
  `<tr><td style="padding:7px 10px;border-bottom:1px solid #E7EAEC;font-size:13px">${l}</td>
   <td style="padding:7px 10px;border-bottom:1px solid #E7EAEC;font-size:13px;text-align:right;font-family:Consolas,monospace">${v}</td></tr>`;

export async function enviar(destinos: string[], assunto: string, html: string) {
  if (!destinos.length) return { enviados: 0 };
  const r = await resend().emails.send({ from: FROM(), to: destinos.slice(0, 50), subject: assunto, html });
  if (r.error) throw new Error(r.error.message);
  return { enviados: destinos.length, id: r.data?.id };
}

/* ---------- Medições ---------- */
export function emailMedicaoSubmetida(obra: any, ev: any) {
  const ret = Number(obra.retencao_pct);
  return layout(obra, `Medição ${ev.id} submetida para validação`, `
    <p style="font-size:13px">A contratada submeteu o evento abaixo para análise da fiscalização.
    Prazo contratual de análise: <b>7 dias úteis</b> (Cl. 3.4.6).</p>
    <table style="width:100%;border-collapse:collapse;margin:10px 0">
      ${linha('Evento', ev.id)}${linha('Etapa', ev.etapa)}${linha('Descrição', ev.descricao)}
      ${linha('Valor bruto', fmtBRL(Number(ev.valor_bruto)))}
      ${linha('Retenção', fmtBRL(Number(ev.valor_bruto) * ret))}
      ${linha('Líquido previsto', fmtBRL(Number(ev.valor_bruto) * (1 - ret)))}
    </table>`);
}

export function emailMedicaoDecidida(obra: any, ev: any) {
  const aprovada = ev.status === 'aprovado';
  const glosa = Number(ev.valor_glosa || 0);
  const ret = Number(obra.retencao_pct);
  const liq = Number(ev.valor_bruto) - glosa;
  return layout(obra, `Medição ${ev.id} ${aprovada ? 'aprovada' : 'aprovada com glosa'}`, `
    <p style="font-size:13px">${aprovada
      ? 'A fiscalização aprovou a medição. Pagamento em até 15 dias após validação da NF (Cl. 3.2). A aprovação não implica aceitação definitiva dos serviços (Cl. 3.4.1).'
      : 'A fiscalização aprovou a medição com glosa fundamentada (Cl. 3.3). O valor glosado poderá ser medido após correção.'}</p>
    <table style="width:100%;border-collapse:collapse;margin:10px 0">
      ${linha('Evento', `${ev.id} — ${ev.etapa}`)}
      ${linha('Valor da etapa', fmtBRL(Number(ev.valor_bruto)))}
      ${glosa ? linha('(−) Glosa', fmtBRL(glosa)) : ''}
      ${linha('Medição líquida', fmtBRL(liq))}
      ${linha('(−) Retenção', fmtBRL(liq * ret))}
      ${linha('Líquido a pagar', fmtBRL(liq * (1 - ret)))}
    </table>`);
}

/* ---------- Pedidos de materiais ---------- */
export function emailPedidoEnviado(obra: any, p: {
  numero: string; titulo: string; evento_id?: string | null; necessidade?: string | null;
  qtdItens: number; cotacoes: { fornecedor: string; valor_total: number; prazo_entrega?: string }[];
}) {
  const menor = p.cotacoes.length ? Math.min(...p.cotacoes.map(c => Number(c.valor_total))) : 0;
  const linhas = p.cotacoes.map(c =>
    linha(`${c.fornecedor}${Number(c.valor_total) === menor ? ' ★ menor preço' : ''}`,
      `${fmtBRL(Number(c.valor_total))} · ${c.prazo_entrega ?? '—'}`)).join('');
  return layout(obra, `Pedido de materiais ${p.numero} aguardando sua aprovação`, `
    <p style="font-size:13px">A contratada registrou um pedido de compra de materiais.
    Nos termos da <b>Cl. 3.4.2</b>, o faturamento direto de fornecedores depende de autorização
    prévia, expressa e escrita da contratante — aprove ou recuse no painel.</p>
    <table style="width:100%;border-collapse:collapse;margin:10px 0">
      ${linha('Pedido', p.numero)}${linha('Título', p.titulo)}
      ${linha('Evento vinculado', p.evento_id ?? '—')}
      ${linha('Necessidade em obra', p.necessidade ?? '—')}
      ${linha('Itens', String(p.qtdItens))}
      ${linha('Cotações apresentadas', String(p.cotacoes.length))}
      ${linhas}
    </table>`);
}

export function emailPedidoDecidido(obra: any, p: {
  numero: string; titulo: string; status: string; motivo?: string | null;
  fornecedor?: string; valor?: number; compra?: any;
}) {
  const titulos: Record<string, string> = {
    aprovado: `Pedido ${p.numero} aprovado — compra autorizada`,
    recusado: `Pedido ${p.numero} recusado`,
    comprado: `Pedido ${p.numero}: compra efetuada com o fornecedor`,
  };
  const corpo = p.status === 'recusado'
    ? `<p style="font-size:13px">A contratante <b>recusou</b> o pedido de materiais.</p>
       <table style="width:100%;border-collapse:collapse;margin:10px 0">
         ${linha('Pedido', `${p.numero} — ${p.titulo}`)}${linha('Motivo', p.motivo ?? '—')}
       </table><p style="font-size:13px">Revise o pedido/cotações e reenvie se aplicável.</p>`
    : p.status === 'aprovado'
    ? `<p style="font-size:13px">A contratante <b>aprovou</b> o pedido e autorizou a compra com a cotação vencedora (autorização escrita — Cl. 3.4.2).</p>
       <table style="width:100%;border-collapse:collapse;margin:10px 0">
         ${linha('Pedido', `${p.numero} — ${p.titulo}`)}
         ${linha('Fornecedor vencedor', p.fornecedor ?? '—')}
         ${linha('Valor autorizado', p.valor != null ? fmtBRL(p.valor) : '—')}
         ${p.motivo ? linha('Observação', p.motivo) : ''}
       </table>`
    : `<p style="font-size:13px">A compra foi <b>efetuada</b> junto ao fornecedor aprovado.</p>
       <table style="width:100%;border-collapse:collapse;margin:10px 0">
         ${linha('Pedido', `${p.numero} — ${p.titulo}`)}
         ${linha('Fornecedor', p.fornecedor ?? '—')}
         ${linha('Valor', p.valor != null ? fmtBRL(p.valor) : '—')}
         ${linha('Nº pedido de compra / NF', [p.compra?.pedido_compra, p.compra?.nf].filter(Boolean).join(' / ') || '—')}
         ${linha('Data da compra', p.compra?.data ?? '—')}
       </table>`;
  return layout(obra, titulos[p.status] ?? `Pedido ${p.numero} atualizado`, corpo);
}

/* ---------- Boletim semanal (por obra) ---------- */
export function emailDigest(obra: any, d: {
  pctExec: number; medidoBruto: number; liberado: number; retido: number;
  desvio: number; diasEntrega: number; aprovadosSemana: string[];
  emValidacao: string[]; tarefasAtrasadas: number; rdosSemana: number;
  pedidosAguardando?: string[];
}) {
  const corpo = `
    <p style="font-size:13px;color:#3A4652">Resumo semanal do avanço físico-financeiro da obra.</p>
    <table style="width:100%;border-collapse:collapse;margin:10px 0">
      ${linha('Avanço físico-financeiro', fmtPct(d.pctExec))}
      ${linha('Medido acumulado (bruto)', fmtBRL(d.medidoBruto))}
      ${linha('Liberado à contratada (líquido)', fmtBRL(d.liberado))}
      ${linha('Retenção técnica acumulada', fmtBRL(d.retido))}
      ${linha('Desvio vs. planejado', (d.desvio >= 0 ? '+' : '') + fmtBRL(d.desvio))}
      ${linha('Dias até a entrega final', String(d.diasEntrega))}
      ${linha('RDOs registrados na semana', String(d.rdosSemana))}
      ${linha('Tarefas em atraso', String(d.tarefasAtrasadas))}
    </table>
    ${d.aprovadosSemana.length ? `<p style="font-size:13px"><b>✔ Medições aprovadas na semana:</b><br>${d.aprovadosSemana.join('<br>')}</p>` : ''}
    ${d.emValidacao.length ? `<p style="font-size:13px"><b>⏱ Aguardando validação (prazo: 7 dias úteis — Cl. 3.4.6):</b><br>${d.emValidacao.join('<br>')}</p>` : ''}
    ${d.pedidosAguardando?.length ? `<p style="font-size:13px"><b>🛒 Pedidos de materiais aguardando aprovação (Cl. 3.4.2):</b><br>${d.pedidosAguardando.join('<br>')}</p>` : ''}
  `;
  return layout(obra, 'Boletim semanal de avanço da obra', corpo);
}
