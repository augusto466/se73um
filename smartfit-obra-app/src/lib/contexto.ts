import { supabaseAdmin } from './supabase/server';

const fmt = (v: any) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = (v: any) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const dt = (d: any) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

/**
 * Monta um retrato textual do estado real da empresa.
 * É isso que o advisor lê antes de responder — por isso ele fala com números, não com generalidades.
 * Respeita o papel: contratada não recebe dados financeiros.
 */
export async function montarContexto(papel: string, obrasPermitidas: number[], usuarioId?: string) {
  const db = supabaseAdmin();
  const gestor = ['admin', 'contratante'].includes(papel);
  const hoje = new Date().toISOString().slice(0, 10);
  const filtro = (q: any, campo = 'obra_id') =>
    papel === 'admin' ? q : q.in(campo, obrasPermitidas.length ? obrasPermitidas : [-1]);

  const [obras, eventos, pedidos, cotacoes, desvios, docs, fvs, rdos, rotinas, ocs, metas] = await Promise.all([
    filtro(db.from('painel_ceo').select('*'), 'obra_id').then((r: any) => r.data ?? []),
    filtro(db.from('eventos').select('id, obra_id, etapa, status, valor_bruto, valor_glosa, mes, atualizado_em')).then((r: any) => r.data ?? []),
    filtro(db.from('pedidos_materiais').select('*')).then((r: any) => r.data ?? []),
    db.from('cotacoes').select('*').then((r: any) => r.data ?? []),
    filtro(db.from('desvio_etapa').select('*')).then((r: any) => r.data ?? []),
    db.from('documentos').select('titulo, tipo, validade, obra_id').then((r: any) => r.data ?? []),
    filtro(db.from('fvs_inspecoes').select('titulo, disciplina, resultado, pendencias, obra_id')).then((r: any) => r.data ?? []),
    filtro(db.from('diario').select('data, atividades, ocorrencias, efetivo, obra_id').order('data', { ascending: false }).limit(8)).then((r: any) => r.data ?? []),
    db.from('rotinas').select('titulo, frequencia, ativo').then((r: any) => r.data ?? []),
    db.from('rotina_ocorrencias').select('status, vencimento, concluida_em').then((r: any) => r.data ?? []),
    db.from('metas').select('titulo, alvo, realizado, unidade, periodo_fim').then((r: any) => r.data ?? []),
  ]);

  let fin: any = { lancs: [], saldo: 0 };
  if (gestor) {
    const [{ data: l }, { data: c }] = await Promise.all([
      filtro(db.from('lancamentos').select('natureza, valor, vencimento, status, descricao, contraparte')),
      db.from('caixa_config').select('saldo_inicial').eq('id', 1).maybeSingle(),
    ]);
    fin = { lancs: l ?? [], saldo: Number(c?.saldo_inicial ?? 0) };
  }

  let decisoes: any[] = [];
  if (usuarioId) {
    const { data } = await db.from('advisor_decisoes')
      .select('titulo, detalhe, decidido_em, obra_id')
      .eq('usuario_id', usuarioId)
      .order('decidido_em', { ascending: false })
      .limit(15);
    decisoes = data ?? [];
  }

  const L: string[] = [];
  L.push(`DATA DE HOJE: ${new Date().toLocaleDateString('pt-BR')}`);
  L.push(`PERFIL DE QUEM PERGUNTA: ${papel}`);

  if (decisoes.length) {
    L.push('\n=== DECISÕES JÁ TOMADAS PELO USUÁRIO (não sugerir de novo; respeitar como premissa) ===');
    decisoes.forEach((d: any) =>
      L.push(`  [${dt(d.decidido_em)}] ${d.titulo}${d.detalhe ? ' — ' + String(d.detalhe).slice(0, 250) : ''}`));
  }

  // ---- carteira
  L.push('\n=== CARTEIRA DE OBRAS ===');
  obras.forEach((o: any) => {
    const meses = (o.meses ?? []) as any[];
    const planAcum = meses.filter(m => m.id <= o.mes_atual).reduce((s, m) => s + Number(m.plan), 0);
    const planPct = o.valor_global > 0 ? planAcum / Number(o.valor_global) * 100 : 0;
    L.push(`\n[${o.codigo}] ${o.nome}`);
    L.push(`  Cliente: ${o.cliente ?? '—'} | Status: ${o.status} | Entrega: ${dt(o.entrega_final)}`);
    L.push(`  Valor global: ${fmt(o.valor_global)} | Medido: ${fmt(o.medido)} (${pct(o.avanco_pct)})`);
    L.push(`  Avanço planejado até o mês ${o.mes_atual}: ${pct(planPct)} | Gap: ${pct(Number(o.avanco_pct) - planPct)}`);
    L.push(`  Orçamento de custo: ${fmt(o.custo_orcado)} | Comprado até agora: ${fmt(o.custo_comprado)}`);
    if (gestor) L.push(`  A receber: ${fmt(o.a_receber)} | A pagar: ${fmt(o.a_pagar)}`);
    L.push(`  Pendências: ${o.em_validacao} medição(ões) em validação, ${o.pedidos_aguardando} pedido(s) aguardando aprovação`);
  });

  // ---- desvios por etapa
  const comCompra = desvios.filter((d: any) => Number(d.valor_comprado) > 0);
  if (comCompra.length) {
    L.push('\n=== ORÇADO x COMPRADO POR ETAPA (etapas com compra aprovada) ===');
    comCompra.forEach((d: any) => {
      const cons = Number(d.valor_comprado) / Number(d.valor_orcado) * 100;
      L.push(`  ${d.etapa}: orçado ${fmt(d.valor_orcado)} | comprado ${fmt(d.valor_comprado)} | consumo ${pct(cons)} | desvio ${fmt(d.desvio_compra)}`);
    });
  } else {
    L.push('\n=== ORÇADO x COMPRADO ===\n  Nenhuma etapa com compra aprovada ainda — não há base para análise de desvio de custo.');
  }

  // ---- eventos
  const emValidacao = eventos.filter((e: any) => e.status === 'validacao');
  const aprovados = eventos.filter((e: any) => ['aprovado', 'glosado'].includes(e.status));
  L.push(`\n=== MEDIÇÕES ===`);
  L.push(`  Total de eventos: ${eventos.length} | Aprovados: ${aprovados.length} | Em validação: ${emValidacao.length} | Pendentes: ${eventos.filter((e: any) => e.status === 'pendente').length}`);
  emValidacao.forEach((e: any) => L.push(`  AGUARDANDO VALIDAÇÃO: ${e.id} — ${e.etapa} — ${fmt(e.valor_bruto)}`));

  // ---- compras
  const aguardando = pedidos.filter((p: any) => p.status === 'enviado');
  L.push(`\n=== COMPRAS ===`);
  L.push(`  Pedidos: ${pedidos.length} | Aguardando aprovação: ${aguardando.length} | Aprovados/comprados: ${pedidos.filter((p: any) => ['aprovado', 'comprado'].includes(p.status)).length}`);
  aguardando.forEach((p: any) => {
    const cots = cotacoes.filter((c: any) => c.pedido_id === p.id);
    L.push(`  PM-${String(p.id).padStart(3, '0')} "${p.titulo}" | evento: ${p.evento_id ?? 'sem vínculo'} | necessidade em obra: ${dt(p.necessidade)}`);
    cots.forEach((c: any) => L.push(`     cotação: ${c.fornecedor} — ${fmt(c.valor_total)} — prazo ${c.prazo_entrega ?? '?'} — pagamento ${c.condicoes_pagamento ?? '?'}`));
  });

  // ---- financeiro (só gestor)
  if (gestor) {
    const abertos = fin.lancs.filter((l: any) => ['previsto', 'confirmado'].includes(l.status));
    const receber = abertos.filter((l: any) => l.natureza === 'receber');
    const pagar = abertos.filter((l: any) => l.natureza === 'pagar');
    const vencidos = abertos.filter((l: any) => l.vencimento < hoje);
    L.push(`\n=== FINANCEIRO ===`);
    L.push(`  Saldo em caixa informado: ${fin.saldo === 0 ? 'NÃO INFORMADO (projeções de caixa ficam sem base)' : fmt(fin.saldo)}`);
    L.push(`  A receber em aberto: ${fmt(receber.reduce((s: number, l: any) => s + Number(l.valor), 0))} (${receber.length} lançamento(s))`);
    L.push(`  A pagar em aberto: ${fmt(pagar.reduce((s: number, l: any) => s + Number(l.valor), 0))} (${pagar.length} lançamento(s))`);
    if (vencidos.length) L.push(`  VENCIDOS: ${vencidos.length} lançamento(s), total ${fmt(vencidos.reduce((s: number, l: any) => s + Number(l.valor), 0))}`);
    abertos.slice(0, 12).forEach((l: any) =>
      L.push(`    ${l.natureza === 'pagar' ? 'PAGAR' : 'RECEBER'} ${dt(l.vencimento)}: ${l.descricao} — ${fmt(l.valor)}${l.contraparte ? ' — ' + l.contraparte : ''}`));
  }

  // ---- documentos
  const docVenc = docs.filter((d: any) => d.validade && d.validade < hoje);
  const docProx = docs.filter((d: any) => d.validade && d.validade >= hoje && d.validade <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  L.push(`\n=== DOCUMENTOS ===`);
  L.push(`  Cadastrados: ${docs.length} | Vencidos: ${docVenc.length} | Vencendo em 30 dias: ${docProx.length}`);
  docVenc.forEach((d: any) => L.push(`  VENCIDO: ${d.titulo} (validade ${dt(d.validade)})`));
  docProx.forEach((d: any) => L.push(`  VENCE EM BREVE: ${d.titulo} (${dt(d.validade)})`));

  // ---- qualidade
  if (fvs.length) {
    L.push(`\n=== QUALIDADE (FVS) ===`);
    L.push(`  Inspeções: ${fvs.length} | Aprovadas: ${fvs.filter((f: any) => f.resultado === 'aprovado').length} | Com ressalvas: ${fvs.filter((f: any) => f.resultado === 'aprovado_ressalvas').length} | Reprovadas: ${fvs.filter((f: any) => f.resultado === 'reprovado').length}`);
    fvs.filter((f: any) => f.pendencias).forEach((f: any) => L.push(`  PENDÊNCIA em ${f.titulo}: ${String(f.pendencias).slice(0, 200)}`));
  }

  // ---- rotinas
  const pend = ocs.filter((o: any) => o.status === 'pendente');
  const conc = ocs.filter((o: any) => o.status === 'concluida');
  const noPrazo = conc.filter((o: any) => o.concluida_em && o.concluida_em.slice(0, 10) <= o.vencimento).length;
  L.push(`\n=== ROTINAS E DISCIPLINA ===`);
  L.push(`  Rotinas ativas: ${rotinas.filter((r: any) => r.ativo).length} | Ocorrências pendentes: ${pend.length} | Atrasadas: ${pend.filter((o: any) => o.vencimento < hoje).length}`);
  L.push(`  Aderência (concluídas no prazo): ${conc.length ? pct(noPrazo / conc.length * 100) : 'sem histórico ainda'}`);

  // ---- metas
  if (metas.length) {
    L.push(`\n=== METAS ===`);
    metas.forEach((m: any) => L.push(`  ${m.titulo}: realizado ${m.realizado} de ${m.alvo} (${m.unidade}) — até ${dt(m.periodo_fim)}`));
  }

  // ---- diário
  if (rdos.length) {
    L.push(`\n=== ÚLTIMOS REGISTROS DE OBRA (RDO) ===`);
    rdos.forEach((r: any) => {
      L.push(`  ${dt(r.data)} (efetivo ${r.efetivo ?? 0}): ${String(r.atividades).slice(0, 180)}`);
      if (r.ocorrencias && r.ocorrencias !== 'Sem ocorrências.') L.push(`     OCORRÊNCIA: ${String(r.ocorrencias).slice(0, 200)}`);
    });
  }

  return L.join('\n');
}
