import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * Grava as datas do baseline contratual (Anexo III) — UMA VEZ.
 * Depois de gravadas, o trigger no banco rejeita qualquer alteração,
 * venha de onde vier. É a âncora de toda comparação de prazo.
 *
 * POST { obra_id, datas: [{evento_id, inicio, fim, critico?}] }
 * POST { obra_id, dependencias: [{evento_id, depende_de, tipo?, folga_dias?}] }
 */
export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: perfil } = await supa.from('profiles').select('papel').eq('id', user.id).single();
  if (!['admin', 'contratante'].includes(perfil?.papel ?? '')) {
    return NextResponse.json({ erro: 'Somente admin ou contratante define o baseline.' }, { status: 403 });
  }

  const { obra_id, datas, dependencias } = await req.json();
  if (!obra_id) return NextResponse.json({ erro: 'Informe a obra.' }, { status: 400 });

  // ---------- dependências ----------
  if (Array.isArray(dependencias)) {
    const linhas = dependencias.map((d: any) => ({
      obra_id, evento_id: d.evento_id, depende_de: d.depende_de,
      tipo: ['FS', 'SS', 'FF'].includes(d.tipo) ? d.tipo : 'FS',
      folga_dias: Number(d.folga_dias ?? 0),
    }));
    for (const l of linhas) {
      if (!l.evento_id || !l.depende_de) return NextResponse.json({ erro: 'Dependência inválida: informe evento e predecessor.' }, { status: 400 });
      if (l.evento_id === l.depende_de) return NextResponse.json({ erro: `"${l.evento_id}" não pode depender de si mesmo.` }, { status: 400 });
    }
    const { error } = await supa.from('evento_dependencias')
      .upsert(linhas, { onConflict: 'obra_id,evento_id,depende_de' });
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, dependencias: linhas.length });
  }

  // ---------- datas do baseline ----------
  if (!Array.isArray(datas) || !datas.length) {
    return NextResponse.json({ erro: 'Informe as datas.' }, { status: 400 });
  }

  const { data: atuais } = await supa.from('eventos')
    .select('id, base_inicio').eq('obra_id', obra_id);
  const jaTem = new Map((atuais ?? []).map((e: any) => [e.id, e.base_inicio]));

  const gravados: string[] = [];
  const bloqueados: string[] = [];

  for (const d of datas) {
    const { evento_id, inicio, fim, critico } = d;
    if (!evento_id || !/^\d{4}-\d{2}-\d{2}$/.test(String(inicio ?? '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(fim ?? ''))) {
      return NextResponse.json({ erro: `Datas inválidas em "${evento_id}": use AAAA-MM-DD.` }, { status: 400 });
    }
    if (new Date(fim) < new Date(inicio)) {
      return NextResponse.json({ erro: `Em "${evento_id}": o fim é anterior ao início.` }, { status: 400 });
    }
    if (jaTem.get(evento_id)) { bloqueados.push(evento_id); continue; }

    const dur = Math.round((new Date(fim + 'T12:00:00').getTime() - new Date(inicio + 'T12:00:00').getTime()) / 86400000);
    const { error } = await supa.from('eventos').update({
      base_inicio: inicio, base_fim: fim,
      prev_inicio: inicio, prev_fim: fim,   // previsto nasce igual ao contratual
      duracao_dias: dur,
      critico: !!critico,
    }).eq('obra_id', obra_id).eq('id', evento_id);
    if (error) return NextResponse.json({ erro: `Falha em ${evento_id}: ${error.message}` }, { status: 400 });
    gravados.push(evento_id);
  }

  return NextResponse.json({
    ok: true, gravados: gravados.length, bloqueados,
    aviso: bloqueados.length
      ? `${bloqueados.length} evento(s) já tinham baseline e não foram alterados (${bloqueados.join(', ')}). O baseline contratual é gravado uma única vez.`
      : null,
  });
}
