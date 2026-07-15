import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const maxDuration = 60;

/**
 * Converte uma proposta aceita em obra — sem redigitação.
 *
 * É o elo que faltava: o orçamento da proposta vira o orçamento da obra,
 * com custo e BDI separados. A partir daí a margem é medida contra o custo
 * que você mesmo orçou, e o custo real volta a calibrar a próxima proposta.
 *
 * POST { proposta_id, codigo, nome?, assinatura?, entrega_final?, retencao_pct? }
 */
export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: perfil } = await supa.from('profiles').select('papel').eq('id', user.id).single();
  if (perfil?.papel !== 'admin') {
    return NextResponse.json({ erro: 'Somente admin converte proposta em obra.' }, { status: 403 });
  }

  const { proposta_id, codigo, nome, assinatura, entrega_final, retencao_pct } = await req.json();
  if (!proposta_id || !codigo) {
    return NextResponse.json({ erro: 'Informe a proposta e o código da obra (ex.: TK-329/2026).' }, { status: 400 });
  }

  const { data: prop } = await supa.from('propostas')
    .select('*, oportunidades(*)').eq('id', proposta_id).maybeSingle();
  if (!prop) return NextResponse.json({ erro: 'Proposta não encontrada.' }, { status: 404 });

  const op: any = prop.oportunidades;
  if (op.obra_id) return NextResponse.json({ erro: `Esta oportunidade já virou a obra ${op.obra_id}.` }, { status: 400 });

  const { data: existe } = await supa.from('obras').select('id').eq('codigo', codigo.trim()).maybeSingle();
  if (existe) return NextResponse.json({ erro: `Já existe uma obra com o código ${codigo}.` }, { status: 400 });

  // ---- cria a obra
  const { data: obra, error } = await supa.from('obras').insert({
    codigo: codigo.trim(),
    nome: nome ?? op.titulo,
    cliente: op.cliente,
    contratada: 'Modo Modular',
    local: op.local ?? null,
    valor_global: prop.preco_total,
    retencao_pct: Number(retencao_pct ?? 0.10),
    assinatura: assinatura || null,
    entrega_final: entrega_final || null,
    status: 'ativa',
    criado_por: user.id,
  }).select('id, codigo').single();
  if (error) return NextResponse.json({ erro: 'Falha ao criar a obra: ' + error.message }, { status: 400 });

  await supa.from('obra_usuarios').insert({ obra_id: obra.id, usuario_id: user.id });

  // ---- o orçamento da proposta vira o orçamento da obra (custo e preço separados)
  const { data: etapas } = await supa.from('proposta_etapas')
    .select('etapa, ordem, custo, preco').eq('proposta_id', proposta_id);

  if (etapas?.length) {
    const linhas = etapas.map((e: any, i: number) => ({
      obra_id: obra.id,
      etapa: e.etapa,
      ordem: i + 1,
      custo_orcado: Number(e.custo),
      valor_orcado: Number(e.preco),
      bdi_pct: Number(e.custo) > 0 ? Math.round((Number(e.preco) / Number(e.custo) - 1) * 10000) / 10000 : 0.25,
    }));
    const { error: errOrc } = await supa.from('orcamento').insert(linhas);
    if (errOrc) {
      return NextResponse.json({
        erro: `Obra ${obra.codigo} criada, mas o orçamento falhou: ${errOrc.message}. Lance manualmente em Financeiro.`,
        obra,
      }, { status: 500 });
    }
  }

  // ---- fecha o ciclo comercial
  await supa.from('propostas').update({ status: 'aceita' }).eq('id', proposta_id);
  await supa.from('oportunidades').update({
    estagio: 'assinada', obra_id: obra.id, probabilidade: 100,
    atualizado_em: new Date().toISOString(),
  }).eq('id', op.id);

  return NextResponse.json({
    ok: true, obra,
    etapas: etapas?.length ?? 0,
    proximo: 'Falta o cronograma de eventos de medição e o baseline de datas — isso é em Cronograma e Replanejamento.',
  });
}
