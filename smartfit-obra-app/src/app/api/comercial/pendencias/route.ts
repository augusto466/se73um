import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const maxDuration = 60;

/**
 * GET  → pendências de preço aguardando decisão
 * POST { aplicar: [id], ignorar: [id], motivo } → decide
 *
 * Preço de composição mexe em orçamento: é decisão, não sincronização.
 * Por isso nada entra nos modelos sem o seu aval.
 */
export async function GET() {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data } = await supa.from('sinapi_pendencias')
    .select('*').eq('status', 'pendente')
    .order('usado_em_modelo', { ascending: false })
    .order('impacto_m2', { ascending: false });

  const lista = data ?? [];
  return NextResponse.json({
    ok: true, pendencias: lista,
    impacto_total_m2: Math.round(lista.filter((p: any) => p.usado_em_modelo)
      .reduce((s: number, p: any) => s + Number(p.impacto_m2 || 0), 0) * 100) / 100,
  });
}

export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: perfil } = await supa.from('profiles').select('papel').eq('id', user.id).single();
  if (!['admin', 'contratante'].includes(perfil?.papel ?? '')) {
    return NextResponse.json({ erro: 'Somente admin ou contratante decide preço.' }, { status: 403 });
  }

  const { aplicar = [], ignorar = [], motivo } = await req.json();
  if (!aplicar.length && !ignorar.length) {
    return NextResponse.json({ erro: 'Nada a decidir.' }, { status: 400 });
  }
  if (aplicar.length && (!motivo || String(motivo).trim().length < 5)) {
    return NextResponse.json({ erro: 'Descreva o motivo — fica no histórico do modelo.' }, { status: 400 });
  }

  const agora = new Date().toISOString();

  if (ignorar.length) {
    await supa.from('sinapi_pendencias')
      .update({ status: 'ignorada', decidido_em: agora, decidido_por: user.id })
      .in('id', ignorar);
  }

  if (!aplicar.length) return NextResponse.json({ ok: true, aplicadas: 0, ignoradas: ignorar.length });

  const { data: pend } = await supa.from('sinapi_pendencias').select('*').in('id', aplicar).eq('status', 'pendente');
  if (!pend?.length) return NextResponse.json({ erro: 'As pendências escolhidas já foram decididas.' }, { status: 400 });

  const { data: modelos } = await supa.from('modelo_itens').select('modelo_id').limit(1);
  const modeloId = modelos?.[0]?.modelo_id;

  const { data: todosAntes } = await supa.from('modelo_itens').select('custo_unitario, indice').eq('modelo_id', modeloId);
  const antes = (todosAntes ?? []).reduce((s: number, i: any) => s + Number(i.custo_unitario) * Number(i.indice), 0);

  const diff: any[] = [];
  for (const p of pend) {
    const { data: itens } = await supa.from('modelo_itens')
      .select('id, custo_unitario, etapa').eq('codigo', p.codigo).like('base_id', 'sinapi%');
    for (const it of itens ?? []) {
      await supa.from('modelo_itens').update({
        custo_unitario: p.preco_novo, calibrado_em: agora,
      }).eq('id', it.id);
      diff.push({ item_id: it.id, campo: 'custo_unitario', de: Number(it.custo_unitario), para: Number(p.preco_novo), etapa: it.etapa });
    }
  }

  await supa.from('sinapi_pendencias')
    .update({ status: 'aplicada', decidido_em: agora, decidido_por: user.id })
    .in('id', aplicar);

  const { data: todosDepois } = await supa.from('modelo_itens').select('custo_unitario, indice').eq('modelo_id', modeloId);
  const depois = (todosDepois ?? []).reduce((s: number, i: any) => s + Number(i.custo_unitario) * Number(i.indice), 0);

  if (modeloId && diff.length) {
    await supa.from('modelo_calibracoes').insert({
      modelo_id: modeloId, origem: 'importacao',
      motivo: `SINAPI ${pend[0].referencia}: ${String(motivo).slice(0, 250)}`,
      itens_afetados: diff.length, diff,
      custo_antes: Math.round(antes * 100) / 100, custo_depois: Math.round(depois * 100) / 100,
      criado_por: user.id,
    });
  }

  return NextResponse.json({
    ok: true, aplicadas: pend.length, ignoradas: ignorar.length, itens: diff.length,
    custo_m2_antes: Math.round(antes), custo_m2_depois: Math.round(depois),
    variacao_pct: antes > 0 ? Math.round((depois / antes - 1) * 1000) / 10 : 0,
  });
}
