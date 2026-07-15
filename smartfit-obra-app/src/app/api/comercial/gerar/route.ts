import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { gerar, compararComReal, type ModeloItem, type Premissas } from '@/lib/orcamento';

export const maxDuration = 60;

/**
 * POST { oportunidade_id, modelo_id, premissas?, gravar? }
 *
 * Sem `gravar`: só simula e devolve o orçamento — nada é persistido.
 * Com `gravar: true`: cria a proposta (nova versão) com os itens.
 */
export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: perfil } = await supa.from('profiles').select('papel').eq('id', user.id).single();
  if (!['admin', 'contratante'].includes(perfil?.papel ?? '')) {
    return NextResponse.json({ erro: 'Somente admin ou contratante monta proposta.' }, { status: 403 });
  }

  const { oportunidade_id, modelo_id, premissas, gravar, titulo, introducao } = await req.json();
  if (!oportunidade_id || !modelo_id) {
    return NextResponse.json({ erro: 'Informe a oportunidade e o modelo.' }, { status: 400 });
  }

  // premissas: as do corpo têm prioridade; senão, as salvas na oportunidade
  let p: Premissas = premissas ?? {};
  if (!premissas) {
    const { data } = await supa.from('oportunidade_premissas').select('*').eq('oportunidade_id', oportunidade_id).maybeSingle();
    if (!data) return NextResponse.json({ erro: 'Preencha as premissas da obra antes de gerar o orçamento.' }, { status: 400 });
    p = data;
  }
  if (!p.area_projecao) {
    return NextResponse.json({ erro: 'A área de projeção é obrigatória — é o principal driver do orçamento.' }, { status: 400 });
  }

  const { data: itens } = await supa.from('modelo_itens')
    .select('*').eq('modelo_id', modelo_id).order('ordem');
  if (!itens?.length) return NextResponse.json({ erro: 'O modelo não tem itens.' }, { status: 400 });

  const orc = gerar(itens as ModeloItem[], p);

  // compara com o custo real das obras entregues — para não repetir erro
  const { data: real } = await supa.from('desvio_etapa').select('etapa, custo_orcado, valor_comprado');
  const alertasReal = compararComReal(orc, (real ?? []) as any);

  if (!gravar) {
    return NextResponse.json({ ok: true, simulacao: true, orcamento: orc, alertas_historico: alertasReal });
  }

  // ---- grava como nova versão
  const { data: ultima } = await supa.from('propostas')
    .select('versao').eq('oportunidade_id', oportunidade_id)
    .order('versao', { ascending: false }).limit(1).maybeSingle();
  const versao = (ultima?.versao ?? 0) + 1;

  if (versao > 1) {
    await supa.from('propostas').update({ status: 'substituida' })
      .eq('oportunidade_id', oportunidade_id).in('status', ['rascunho', 'enviada']);
  }

  const { data: prop, error } = await supa.from('propostas').insert({
    oportunidade_id, versao, modelo_id,
    titulo: titulo ?? null,
    introducao: introducao ?? null,
    custo_total: orc.custo_total,
    bdi_medio: orc.bdi_efetivo / 100,
    preco_total: orc.preco_total,
    prazo_meses: p.prazo_meses ?? null,
    criado_por: user.id,
  }).select('id, versao').single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  const linhas = orc.itens.map(i => ({
    proposta_id: prop.id, ordem: i.ordem, etapa: i.etapa, subetapa: i.subetapa,
    indice_item: i.indice_item, codigo: i.codigo, base_id: i.base_id,
    descricao: i.descricao, unidade: i.unidade,
    quantidade: i.quantidade, custo_unitario: i.custo_unitario, bdi_pct: i.bdi_pct,
    origem: 'motor', observacao: i.alerta ?? null,
  }));
  const { error: errItens } = await supa.from('proposta_itens').insert(linhas);
  if (errItens) return NextResponse.json({ erro: 'Proposta criada, mas falhou ao gravar os itens: ' + errItens.message }, { status: 500 });

  // o estágio avança sozinho: gerar orçamento É o estágio "orçamento"
  await supa.from('oportunidades')
    .update({ estagio: 'orcamento', valor_estimado: orc.preco_total, atualizado_em: new Date().toISOString() })
    .eq('id', oportunidade_id).in('estagio', ['contato', 'premissas']);

  return NextResponse.json({ ok: true, proposta: prop, orcamento: orc, alertas_historico: alertasReal });
}
