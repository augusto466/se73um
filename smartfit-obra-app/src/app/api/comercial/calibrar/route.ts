import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { proporCalibracao, type ModeloItem } from '@/lib/orcamento';

export const maxDuration = 60;

/**
 * GET  ?modelo=1        → o que o custo real diz sobre o modelo (só propõe)
 * POST { modelo_id, aplicar: [item_id], motivo }  → aplica as correções escolhidas
 *
 * A calibração nunca é automática: o sistema propõe, você escolhe o que aceita.
 * Custo real pode estar contaminado por uma compra atípica — quem sabe é você.
 */
export async function GET(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const modeloId = Number(new URL(req.url).searchParams.get('modelo'));
  if (!modeloId) return NextResponse.json({ erro: 'Informe o modelo.' }, { status: 400 });

  const [{ data: itens }, { data: real }] = await Promise.all([
    supa.from('modelo_itens').select('*').eq('modelo_id', modeloId).order('ordem'),
    supa.from('desvio_etapa').select('etapa, custo_orcado, valor_comprado, obra_id').gt('valor_comprado', 0),
  ]);
  if (!itens?.length) return NextResponse.json({ erro: 'Modelo sem itens.' }, { status: 400 });

  if (!real?.length) {
    return NextResponse.json({
      ok: true, propostas: [], ignoradas: [],
      aviso: 'Nenhuma etapa com compra aprovada ainda. A calibração precisa de custo real — ela liga quando os pedidos começarem a ser aprovados.',
    });
  }

  const { propostas, ignoradas } = proporCalibracao(itens as any, real as any);
  return NextResponse.json({ ok: true, propostas, ignoradas, etapas_com_real: real.length });
}

export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: perfil } = await supa.from('profiles').select('papel').eq('id', user.id).single();
  if (!['admin', 'contratante'].includes(perfil?.papel ?? '')) {
    return NextResponse.json({ erro: 'Somente admin ou contratante calibra modelo.' }, { status: 403 });
  }

  const { modelo_id, aplicar, motivo } = await req.json();
  if (!modelo_id || !Array.isArray(aplicar) || !aplicar.length) {
    return NextResponse.json({ erro: 'Escolha ao menos um item para calibrar.' }, { status: 400 });
  }
  if (!motivo || String(motivo).trim().length < 5) {
    return NextResponse.json({ erro: 'Descreva o motivo — é o que explica a mudança quando alguém revisar o modelo depois.' }, { status: 400 });
  }

  const [{ data: itens }, { data: real }] = await Promise.all([
    supa.from('modelo_itens').select('*').eq('modelo_id', modelo_id).order('ordem'),
    supa.from('desvio_etapa').select('etapa, custo_orcado, valor_comprado, obra_id').gt('valor_comprado', 0),
  ]);
  const { propostas } = proporCalibracao((itens ?? []) as any, (real ?? []) as any);
  const escolhidas = propostas.filter(p => aplicar.includes(p.item_id));
  if (!escolhidas.length) {
    return NextResponse.json({ erro: 'As correções escolhidas não estão mais válidas — recarregue a análise.' }, { status: 400 });
  }

  const custoAntes = (itens ?? []).reduce((s: number, i: any) => s + Number(i.custo_unitario) * Number(i.indice), 0);
  const obraId = (real ?? [])[0]?.obra_id ?? null;

  for (const p of escolhidas) {
    const { error } = await supa.from('modelo_itens').update({
      custo_unitario: p.para,
      calibrado_em: new Date().toISOString(),
      calibrado_obra_id: obraId,
    }).eq('id', p.item_id);
    if (error) return NextResponse.json({ erro: `Falha no item ${p.item_id}: ${error.message}` }, { status: 400 });
  }

  const { data: depois } = await supa.from('modelo_itens').select('custo_unitario, indice').eq('modelo_id', modelo_id);
  const custoDepois = (depois ?? []).reduce((s: number, i: any) => s + Number(i.custo_unitario) * Number(i.indice), 0);

  const { data: calib, error: errCalib } = await supa.from('modelo_calibracoes').insert({
    modelo_id, origem: 'obra_real', obra_id: obraId,
    motivo: String(motivo).slice(0, 300),
    itens_afetados: escolhidas.length,
    diff: escolhidas.map(p => ({ item_id: p.item_id, campo: p.campo, de: p.de, para: p.para, etapa: p.etapa })),
    custo_antes: Math.round(custoAntes * 100) / 100,
    custo_depois: Math.round(custoDepois * 100) / 100,
    criado_por: user.id,
  }).select('id').single();
  if (errCalib) return NextResponse.json({ erro: 'Itens calibrados, mas o registro falhou: ' + errCalib.message }, { status: 500 });

  return NextResponse.json({
    ok: true, calibracao: calib, itens: escolhidas.length,
    custo_m2_antes: Math.round(custoAntes), custo_m2_depois: Math.round(custoDepois),
    variacao_pct: custoAntes > 0 ? Math.round((custoDepois / custoAntes - 1) * 1000) / 10 : 0,
  });
}
