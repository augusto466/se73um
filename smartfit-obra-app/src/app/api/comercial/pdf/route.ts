import { supabaseServer } from '@/lib/supabase/server';

export const maxDuration = 60;

const brl = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * GET ?proposta=123 — proposta em HTML pronta para imprimir/salvar como PDF.
 *
 * Sai com a identidade Se73um e mostra só o PREÇO, nunca o custo:
 * a composição interna é sua, não do cliente.
 */
export async function GET(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return new Response('Não autenticado.', { status: 401 });

  const id = Number(new URL(req.url).searchParams.get('proposta'));
  if (!id) return new Response('Informe a proposta.', { status: 400 });

  const { data: p } = await supa.from('propostas')
    .select('*, oportunidades(*)').eq('id', id).maybeSingle();
  if (!p) return new Response('Proposta não encontrada.', { status: 404 });

  const [{ data: itens }, { data: prem }] = await Promise.all([
    supa.from('proposta_itens').select('*').eq('proposta_id', id).order('ordem'),
    supa.from('oportunidade_premissas').select('*').eq('oportunidade_id', p.oportunidade_id).maybeSingle(),
  ]);
  const op: any = p.oportunidades;

  // agrupa por etapa preservando a ordem
  const etapas: { nome: string; itens: any[]; total: number }[] = [];
  for (const i of itens ?? []) {
    let e = etapas.find(x => x.nome === i.etapa);
    if (!e) { e = { nome: i.etapa, itens: [], total: 0 }; etapas.push(e); }
    e.itens.push(i); e.total += Number(i.preco_total);
  }

  const hoje = new Date().toLocaleDateString('pt-BR');
  const validade = new Date(Date.now() + (p.validade_dias ?? 30) * 86400000).toLocaleDateString('pt-BR');

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Proposta ${esc(op.codigo)} R${String(p.versao).padStart(2, '0')} — ${esc(op.cliente)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #0D0D0F; font-size: 10pt; line-height: 1.45; margin: 0; }
  .cabec { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 3px solid #FD1843; padding-bottom: 12px; margin-bottom: 18px; }
  .marca { display: flex; gap: 10px; align-items: center; }
  .nm { font-size: 17pt; font-weight: 800; letter-spacing: -.3px; line-height: 1; }
  .nm em { color: #FD1843; font-style: normal; }
  .tg { font-size: 6.5pt; letter-spacing: 2.2px; text-transform: uppercase; color: #6B6B75; margin-top: 3px; }
  .meta { text-align: right; font-size: 8.5pt; color: #6B6B75; }
  .meta b { color: #0D0D0F; font-size: 11pt; display: block; }
  h1 { font-size: 14pt; margin: 0 0 3px; }
  .sub { color: #6B6B75; font-size: 9pt; margin-bottom: 16px; }
  .bloco { border: 1px solid #E6E6EA; border-left: 3px solid #FD1843; border-radius: 6px; padding: 11px 13px; margin-bottom: 14px; }
  .bloco h3 { font-size: 9.5pt; margin: 0 0 6px; letter-spacing: .04em; text-transform: uppercase; }
  .bloco p { margin: 0 0 7px; text-align: justify; }
  .prem { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; }
  .prem div span { display: block; font-size: 7.5pt; color: #6B6B75; text-transform: uppercase; letter-spacing: .05em; }
  .prem div b { font-size: 11pt; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { background: #F5F5F7; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .05em; text-align: left; padding: 5px 6px; border-bottom: 1px solid #E6E6EA; }
  td { padding: 5px 6px; border-bottom: 1px solid #F0F0F3; font-size: 8.5pt; vertical-align: top; }
  .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .etapa { page-break-inside: avoid; margin-bottom: 14px; }
  .etapa h2 { font-size: 10pt; background: #0D0D0F; color: #fff; padding: 5px 9px; border-radius: 4px 4px 0 0; margin: 0; }
  .tot-etapa { text-align: right; font-weight: 700; padding: 6px 9px; background: #F5F5F7; border-radius: 0 0 4px 4px; font-size: 9pt; }
  .resumo tr td:first-child { font-weight: 600; }
  .total { background: #FD1843; color: #fff; padding: 12px 16px; border-radius: 6px; text-align: right; font-size: 15pt; font-weight: 800; margin: 16px 0; }
  .cond { font-size: 8.5pt; color: #3A3A42; }
  .rod { margin-top: 20px; padding-top: 10px; border-top: 1px solid #E6E6EA; font-size: 7.5pt; color: #6B6B75; display: flex; justify-content: space-between; }
  @media print { .noprint { display: none; } }
  .noprint { position: fixed; top: 10px; right: 10px; background: #FD1843; color: #fff; border: 0; padding: 9px 15px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 600; }
</style></head><body>
<button class="noprint" onclick="window.print()">Salvar como PDF</button>

<div class="cabec">
  <div class="marca">
    <svg width="26" height="34" viewBox="0 0 100 100" fill="none">
      <path d="M99.7 0 L0 21.74 L99.7 35.54 L99.7 25.5 L20.5 21.74 L99.7 7.51 Z" fill="#FD1843"/>
      <rect y="35.65" width="100" height="7.73" fill="#0D0D0F"/><rect y="45.47" width="100" height="7.73" fill="#0D0D0F"/>
      <rect y="59.05" width="100" height="7.73" fill="#FD1843"/><rect y="68.87" width="100" height="7.73" fill="#FD1843"/>
      <rect y="78.81" width="100" height="7.73" fill="#FD1843"/><rect y="92.38" width="100" height="7.73" fill="#0D0D0F"/>
    </svg>
    <div><div class="nm">Se<em>73</em>um</div><div class="tg">Technology</div></div>
  </div>
  <div class="meta">
    <b>PROPOSTA R${String(p.versao).padStart(2, '0')}</b>
    ${esc(op.codigo ?? '')}<br>Emissão: ${hoje}<br>Validade: ${validade}
  </div>
</div>

<h1>${esc(p.titulo ?? op.titulo)}</h1>
<div class="sub">${esc(op.cliente)}${op.local ? ' · ' + esc(op.local) : ''}</div>

${p.introducao ? `<div class="bloco"><h3>Apresentação</h3>${String(p.introducao).split('\n').filter(Boolean).map((l: string) => `<p>${esc(l)}</p>`).join('')}</div>` : ''}

${prem ? `<div class="bloco"><h3>Escopo considerado</h3><div class="prem">
  ${prem.area_projecao ? `<div><span>Área de projeção</span><b>${num(prem.area_projecao)} m²</b></div>` : ''}
  ${prem.area_laje ? `<div><span>Laje / mezanino</span><b>${num(prem.area_laje)} m²</b></div>` : ''}
  ${prem.pe_direito ? `<div><span>Pé-direito</span><b>${num(prem.pe_direito)} m</b></div>` : ''}
  ${p.prazo_meses ? `<div><span>Prazo de execução</span><b>${num(p.prazo_meses)} meses</b></div>` : ''}
</div></div>` : ''}

<div class="bloco"><h3>Resumo por etapa</h3>
<table class="resumo"><thead><tr><th>Etapa</th><th class="n">Valor</th><th class="n">%</th></tr></thead><tbody>
${etapas.map(e => `<tr><td>${esc(e.nome)}</td><td class="n">${brl(e.total)}</td><td class="n">${(e.total / Number(p.preco_total) * 100).toFixed(1)}%</td></tr>`).join('')}
</tbody></table></div>

<div class="total">TOTAL: ${brl(p.preco_total)}</div>

<h3 style="font-size:10pt;margin:18px 0 10px">Planilha detalhada</h3>
${etapas.map(e => `<div class="etapa">
  <h2>${esc(e.nome)}</h2>
  <table><thead><tr><th style="width:8%">Item</th><th>Descrição</th><th style="width:7%">Un.</th><th class="n" style="width:11%">Qtde</th><th class="n" style="width:13%">Preço un.</th><th class="n" style="width:14%">Total</th></tr></thead><tbody>
  ${e.itens.filter(i => Number(i.quantidade) > 0).map(i => `<tr>
    <td>${esc(i.indice_item ?? '')}</td>
    <td>${esc(i.descricao)}</td>
    <td>${esc(i.unidade ?? '')}</td>
    <td class="n">${num(i.quantidade)}</td>
    <td class="n">${brl(i.preco_unitario)}</td>
    <td class="n">${brl(i.preco_total)}</td></tr>`).join('')}
  </tbody></table>
  <div class="tot-etapa">Total da etapa: ${brl(e.total)}</div>
</div>`).join('')}

<div class="bloco cond"><h3>Condições</h3>
  <p><b>Validade:</b> ${p.validade_dias ?? 30} dias a contar da emissão.</p>
  ${p.condicoes_pagamento ? `<p><b>Pagamento:</b> ${esc(p.condicoes_pagamento)}</p>` : ''}
  ${p.prazo_meses ? `<p><b>Prazo:</b> ${num(p.prazo_meses)} meses a contar da ordem de serviço e liberação da frente de trabalho.</p>` : ''}
  <p>Os quantitativos refletem as premissas acima. Alterações de escopo, de projeto ou de condições de terreno serão objeto de aditivo.</p>
</div>

<div class="rod">
  <span>Se73um Technology · Modo Modular</span>
  <span>Proposta ${esc(op.codigo ?? '')} R${String(p.versao).padStart(2, '0')} · ${hoje}</span>
</div>
</body></html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
