import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const maxDuration = 60;

/**
 * Propaga o custo das composições para os itens do modelo.
 *
 * Importar a base atualiza `composicoes`, mas os modelos guardam o custo
 * congelado no momento em que foram criados. Este é o elo: casa item de
 * modelo com composição (por base + código) e propõe o custo novo.
 *
 * GET  ?modelo=1              → o que mudaria (só propõe)
 * POST { modelo_id, aplicar: [item_id], motivo }
 */
export async function GET(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const modeloId = Number(new URL(req.url).searchParams.get('modelo'));
  if (!modeloId) return NextResponse.json({ erro: 'Informe o modelo.' }, { status: 400 });

  const { data: itens } = await supa.from('modelo_itens')
    .select('id, etapa, descricao, codigo, base_id, custo_unitario, indice')
    .eq('modelo_id', modeloId).not('codigo', 'is', null).order('ordem');
  if (!itens?.length) return NextResponse.json({ ok: true, propostas: [], aviso: 'Modelo sem itens com código.' });

  const { data: comps } = await supa.from('composicoes')
    .select('base_id, codigo, custo_unitario, descricao').eq('ativo', true);
  const mapa = new Map((comps ?? []).map((c: any) => [`${c.base_id}|${c.codigo}`, c]));

  const propostas: any[] = [];
  const semMatch: string[] = [];
  for (const i of itens) {
    const c: any = mapa.get(`${i.base_id}|${i.codigo}`);
    if (!c) { semMatch.push(`${i.codigo} — ${i.descricao.slice(0, 40)}`); continue; }
    const de = Number(i.custo_unitario), para = Number(c.custo_unitario);
    if (Math.abs(para - de) < 0.01) continue;
    propostas.push({
      item_id: i.id, etapa: i.etapa, descricao: i.descricao, codigo: i.codigo,
      de, para, variacao_pct: de > 0 ? Math.round((para / de - 1) * 1000) / 10 : 0,
      impacto_m2: Math.round((para - de) * Number(i.indice) * 100) / 100,
    });
  }
  propostas.sort((a, b) => Math.abs(b.impacto_m2) - Math.abs(a.impacto_m2));

  return NextResponse.json({
    ok: true, propostas,
    impacto_total_m2: Math.round(propostas.reduce((s, p) => s + p.impacto_m2, 0) * 100) / 100,
    sem_correspondencia: semMatch.length,
    aviso: semMatch.length ? `${semMatch.length} item(ns) do modelo não têm correspondência na base — provavelmente são composições próprias (MODO), que não vêm do SINAPI.` : null,
  });
}

export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: perfil } = await supa.from('profiles').select('papel').eq('id', user.id).single();
  if (!['admin', 'contratante'].includes(perfil?.papel ?? '')) {
    return NextResponse.json({ erro: 'Somente admin ou contratante altera modelo.' }, { status: 403 });
  }

  const { modelo_id, aplicar, motivo } = await req.json();
  if (!modelo_id || !Array.isArray(aplicar) || !aplicar.length) {
    return NextResponse.json({ erro: 'Escolha ao menos um item.' }, { status: 400 });
  }
  if (!motivo || String(motivo).trim().length < 5) {
    return NextResponse.json({ erro: 'Descreva o motivo da atualização.' }, { status: 400 });
  }

  const { data: itens } = await supa.from('modelo_itens')
    .select('id, etapa, codigo, base_id, custo_unitario, indice').eq('modelo_id', modelo_id).in('id', aplicar);
  const { data: comps } = await supa.from('composicoes').select('base_id, codigo, custo_unitario').eq('ativo', true);
  const mapa = new Map((comps ?? []).map((c: any) => [`${c.base_id}|${c.codigo}`, Number(c.custo_unitario)]));

  const { data: todos } = await supa.from('modelo_itens').select('custo_unitario, indice').eq('modelo_id', modelo_id);
  const antes = (todos ?? []).reduce((s: number, i: any) => s + Number(i.custo_unitario) * Number(i.indice), 0);

  const diff: any[] = [];
  for (const i of itens ?? []) {
    const novo = mapa.get(`${i.base_id}|${i.codigo}`);
    if (novo === undefined) continue;
    const { error } = await supa.from('modelo_itens')
      .update({ custo_unitario: novo, calibrado_em: new Date().toISOString() }).eq('id', i.id);
    if (error) return NextResponse.json({ erro: `Falha no item ${i.id}: ${error.message}` }, { status: 400 });
    diff.push({ item_id: i.id, campo: 'custo_unitario', de: Number(i.custo_unitario), para: novo, etapa: i.etapa });
  }

  const { data: depois } = await supa.from('modelo_itens').select('custo_unitario, indice').eq('modelo_id', modelo_id);
  const dep = (depois ?? []).reduce((s: number, i: any) => s + Number(i.custo_unitario) * Number(i.indice), 0);

  await supa.from('modelo_calibracoes').insert({
    modelo_id, origem: 'importacao', motivo: String(motivo).slice(0, 300),
    itens_afetados: diff.length, diff,
    custo_antes: Math.round(antes * 100) / 100, custo_depois: Math.round(dep * 100) / 100,
    criado_por: user.id,
  });

  return NextResponse.json({
    ok: true, itens: diff.length,
    custo_m2_antes: Math.round(antes), custo_m2_depois: Math.round(dep),
    variacao_pct: antes > 0 ? Math.round((dep / antes - 1) * 1000) / 10 : 0,
  });
}

/** PATCH — edita um item da proposta (quantidade, custo, BDI) ou remove. */
export async function PATCH(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { item_id, quantidade, custo_unitario, bdi_pct, remover } = await req.json();
  if (!item_id) return NextResponse.json({ erro: 'Informe o item.' }, { status: 400 });

  const { data: item } = await supa.from('proposta_itens').select('proposta_id').eq('id', item_id).maybeSingle();
  if (!item) return NextResponse.json({ erro: 'Item não encontrado.' }, { status: 404 });

  const { data: prop } = await supa.from('propostas').select('id, status').eq('id', item.proposta_id).maybeSingle();
  if (prop?.status === 'aceita') {
    return NextResponse.json({ erro: 'Proposta aceita não se edita — ela virou contrato. Crie uma nova versão.' }, { status: 400 });
  }

  if (remover) {
    const { error } = await supa.from('proposta_itens').delete().eq('id', item_id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  } else {
    const patch: any = { origem: 'ajustado' };
    if (quantidade !== undefined) patch.quantidade = Number(quantidade);
    if (custo_unitario !== undefined) patch.custo_unitario = Number(custo_unitario);
    if (bdi_pct !== undefined) patch.bdi_pct = Number(bdi_pct);
    const { error } = await supa.from('proposta_itens').update(patch).eq('id', item_id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  }

  // recalcula os totais da proposta
  const { data: itens } = await supa.from('proposta_itens')
    .select('custo_total, preco_total').eq('proposta_id', item.proposta_id);
  const custo = (itens ?? []).reduce((s: number, i: any) => s + Number(i.custo_total), 0);
  const preco = (itens ?? []).reduce((s: number, i: any) => s + Number(i.preco_total), 0);
  await supa.from('propostas').update({
    custo_total: Math.round(custo * 100) / 100,
    preco_total: Math.round(preco * 100) / 100,
    bdi_medio: custo > 0 ? Math.round((preco / custo - 1) * 10000) / 10000 : 0,
  }).eq('id', item.proposta_id);

  return NextResponse.json({
    ok: true,
    custo_total: Math.round(custo * 100) / 100,
    preco_total: Math.round(preco * 100) / 100,
  });
}
