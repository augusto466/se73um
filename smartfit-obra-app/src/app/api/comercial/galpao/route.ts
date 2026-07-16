import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { orcarGalpao, type Premissas } from '@/lib/orcamento-galpao';

export const maxDuration = 60;

/**
 * POST { oportunidade_id?, premissas, gravar? }
 *
 * Orça o galpão por engenharia: manual Gerdau + geometria + base de preços.
 * Sem `gravar`, só simula.
 */
export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: perfil } = await supa.from('profiles').select('papel').eq('id', user.id).single();
  if (!['admin', 'contratante'].includes(perfil?.papel ?? '')) {
    return NextResponse.json({ erro: 'Somente admin ou contratante orça.' }, { status: 403 });
  }

  const { oportunidade_id, premissas, gravar, titulo, introducao } = await req.json();
  const p = premissas as Premissas;

  if (!p?.vao || !p?.comprimento || !p?.altura) {
    return NextResponse.json({ erro: 'Vão, comprimento e altura são obrigatórios — é deles que sai toda a geometria.' }, { status: 400 });
  }

  const { data: comps } = await supa.from('composicoes')
    .select('codigo, base_id, descricao, custo_unitario, unidade').eq('ativo', true);

  const orc = orcarGalpao(p, (comps ?? []) as any, {
    bdi_pct: 0.25,
    capacidade_estaca_tf: (p as any).capacidade_estaca_tf,
  });
  if ('erro' in orc) return NextResponse.json({ erro: orc.erro }, { status: 400 });

  if (!gravar || !oportunidade_id) {
    return NextResponse.json({ ok: true, simulacao: true, orcamento: orc });
  }

  const { data: ultima } = await supa.from('propostas')
    .select('versao').eq('oportunidade_id', oportunidade_id)
    .order('versao', { ascending: false }).limit(1).maybeSingle();
  const versao = (ultima?.versao ?? 0) + 1;

  if (versao > 1) {
    await supa.from('propostas').update({ status: 'substituida' })
      .eq('oportunidade_id', oportunidade_id).in('status', ['rascunho', 'enviada']);
  }

  const { data: prop, error } = await supa.from('propostas').insert({
    oportunidade_id, versao, titulo: titulo ?? null, introducao: introducao ?? null,
    custo_total: orc.custo_total, preco_total: orc.preco_total,
    bdi_medio: orc.bdi_efetivo / 100, prazo_meses: p.prazo_meses ?? null,
    metodo: 'engenharia',
    memoria_calculo: {
      geometria: orc.geometria, perfis: orc.estrutura.perfis,
      estagio: orc.estrutura.estagio, peso_total_kg: orc.estrutura.peso_total_kg,
      taxa_kg_m2: orc.estrutura.taxa_kg_m2, reacoes: orc.estrutura.reacoes,
      fundacao: orc.fundacao, premissas: p, avisos: orc.avisos,
    },
    criado_por: user.id,
  }).select('id, versao').single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  const linhas = orc.itens.map((i, n) => ({
    proposta_id: prop.id, ordem: n * 10, etapa: i.etapa,
    codigo: i.codigo, base_id: i.base_id,
    descricao: i.descricao, unidade: i.unidade,
    quantidade: i.quantidade, custo_unitario: i.custo_unitario, bdi_pct: i.bdi_pct,
    origem: 'motor', observacao: i.nota ?? null,
  }));
  const { error: errItens } = await supa.from('proposta_itens').insert(linhas);
  if (errItens) return NextResponse.json({ erro: 'Proposta criada, mas os itens falharam: ' + errItens.message }, { status: 500 });

  await supa.from('oportunidades')
    .update({ estagio: 'orcamento', valor_estimado: orc.preco_total, atualizado_em: new Date().toISOString() })
    .eq('id', oportunidade_id).in('estagio', ['contato', 'premissas']);

  return NextResponse.json({ ok: true, proposta: prop, orcamento: orc });
}
