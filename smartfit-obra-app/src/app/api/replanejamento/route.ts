import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { simular, type EventoCron, type Dependencia, type Ajuste } from '@/lib/replanejamento';

export const maxDuration = 60;

async function carregar(supa: any, obraId: number) {
  const [{ data: eventos }, { data: deps }, { data: obra }] = await Promise.all([
    supa.from('eventos').select('id, obra_id, etapa, descricao, status, valor_bruto, base_inicio, base_fim, base_mes, prev_inicio, prev_fim, real_inicio, real_fim, duracao_dias, critico').eq('obra_id', obraId).order('id'),
    supa.from('evento_dependencias').select('evento_id, depende_de, tipo, folga_dias').eq('obra_id', obraId),
    supa.from('obras').select('id, codigo, entrega_final, valor_global').eq('id', obraId).single(),
  ]);
  return {
    eventos: (eventos ?? []) as EventoCron[],
    deps: (deps ?? []) as Dependencia[],
    obra,
  };
}

/**
 * POST { obra_id, ajustes: [{evento_id, novo_inicio}], aplicar?, motivo?, detalhe?, origem? }
 *
 * Sem `aplicar`: só simula e devolve o impacto — nada é gravado.
 * Com `aplicar: true`: grava prev_* e registra a revisão. O baseline nunca é tocado
 * (o banco tem trigger que rejeita, mesmo que alguém tente por fora).
 */
export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { obra_id, ajustes, aplicar, motivo, detalhe, origem } = await req.json();
  if (!obra_id || !Array.isArray(ajustes) || !ajustes.length) {
    return NextResponse.json({ erro: 'Informe a obra e ao menos um ajuste.' }, { status: 400 });
  }
  for (const a of ajustes as Ajuste[]) {
    if (!a.evento_id || !/^\d{4}-\d{2}-\d{2}$/.test(String(a.novo_inicio ?? ''))) {
      return NextResponse.json({ erro: `Ajuste inválido em "${a.evento_id}": a data deve estar em AAAA-MM-DD.` }, { status: 400 });
    }
  }

  const { eventos, deps, obra } = await carregar(supa, Number(obra_id));
  if (!obra) return NextResponse.json({ erro: 'Obra não encontrada ou sem acesso.' }, { status: 404 });
  if (!eventos.length) return NextResponse.json({ erro: 'A obra não tem eventos cadastrados.' }, { status: 400 });

  const semData = eventos.filter(e => !e.base_inicio && !e.prev_inicio);
  const impacto = simular(eventos, deps, ajustes as Ajuste[], obra);

  if (semData.length && !impacto.diff.length) {
    return NextResponse.json({
      erro: `Os eventos ainda não têm datas cadastradas (${semData.length} de ${eventos.length}). Preencha o cronograma em Cronograma → "Datas do baseline" antes de replanejar.`,
    }, { status: 400 });
  }

  // ---- só simulação
  if (!aplicar) return NextResponse.json({ ok: true, simulacao: true, impacto });

  // ---- aplicação: exige motivo e papel de gestão
  const { data: perfil } = await supa.from('profiles').select('papel').eq('id', user.id).single();
  if (!['admin', 'contratante'].includes(perfil?.papel ?? '')) {
    return NextResponse.json({ erro: 'Somente admin ou contratante pode aplicar uma revisão de cronograma.' }, { status: 403 });
  }
  if (!motivo || String(motivo).trim().length < 5) {
    return NextResponse.json({ erro: 'Toda revisão de cronograma exige um motivo — é o que sustenta a discussão contratual depois.' }, { status: 400 });
  }
  if (!impacto.diff.length) {
    return NextResponse.json({ erro: 'Nenhuma data mudaria com esses ajustes.' }, { status: 400 });
  }

  // grava as novas datas previstas (o baseline segue intacto)
  for (const d of impacto.diff) {
    const { error } = await supa.from('eventos')
      .update({ prev_inicio: d.para_inicio, prev_fim: d.para_fim, atualizado_por: user.id, atualizado_em: new Date().toISOString() })
      .eq('obra_id', obra_id).eq('id', d.evento_id);
    if (error) return NextResponse.json({ erro: `Falha ao atualizar ${d.evento_id}: ${error.message}` }, { status: 400 });
  }

  const { data: ultima } = await supa.from('cronograma_revisoes')
    .select('numero').eq('obra_id', obra_id).order('numero', { ascending: false }).limit(1).maybeSingle();
  const numero = (ultima?.numero ?? 0) + 1;

  const { data: rev, error: errRev } = await supa.from('cronograma_revisoes').insert({
    obra_id, numero,
    motivo: String(motivo).slice(0, 300),
    detalhe: detalhe ? String(detalhe).slice(0, 2000) : null,
    origem: origem === 'advisor' ? 'advisor' : 'manual',
    diff: impacto.diff,
    impacto: {
      entrega_base: impacto.entrega_base, entrega_prev: impacto.entrega_prev,
      dias_entrega: impacto.dias_entrega, faturamento: impacto.faturamento, alertas: impacto.alertas,
    },
    criado_por: user.id,
  }).select('id, numero').single();
  if (errRev) return NextResponse.json({ erro: 'Datas atualizadas, mas falhou o registro da revisão: ' + errRev.message }, { status: 500 });

  return NextResponse.json({ ok: true, revisao: rev, impacto });
}

/** GET ?obra_id=1 — histórico de revisões. */
export async function GET(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const obraId = new URL(req.url).searchParams.get('obra_id');
  if (!obraId) return NextResponse.json({ erro: 'Informe a obra.' }, { status: 400 });

  const { data } = await supa.from('cronograma_revisoes')
    .select('id, numero, motivo, detalhe, origem, diff, impacto, criado_em')
    .eq('obra_id', Number(obraId)).order('numero', { ascending: false });
  return NextResponse.json({ revisoes: data ?? [] });
}
