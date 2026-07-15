import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  const { data: perfil } = await supabase.from('profiles').select('papel').eq('id', user.id).single();
  if (perfil?.papel !== 'admin') return NextResponse.json({ erro: 'Apenas administradores criam obras.' }, { status: 403 });

  const b = await req.json();
  if (!b.codigo?.trim() || !b.nome?.trim()) {
    return NextResponse.json({ erro: 'Código e nome da obra são obrigatórios.' }, { status: 400 });
  }

  // duplicação a partir de um modelo
  if (b.modeloId) {
    const { data, error } = await supabase.rpc('duplicar_obra', {
      p_modelo: b.modeloId,
      p_codigo: b.codigo.trim(),
      p_nome: b.nome.trim(),
      p_cliente: b.cliente || null,
      p_contratada: b.contratada || null,
      p_local: b.local || null,
      p_valor: Number(b.valor_global) || 0,
      p_assinatura: b.assinatura || null,
      p_entrega: b.entrega_final || null,
      p_copiar_valores: !!b.copiarValores,
    });
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, obraId: data });
  }

  // obra em branco (sem modelo)
  const { data, error } = await supabase.from('obras').insert({
    codigo: b.codigo.trim(), nome: b.nome.trim(), cliente: b.cliente || null,
    contratada: b.contratada || null, local: b.local || null,
    valor_global: Number(b.valor_global) || 0, assinatura: b.assinatura || null,
    entrega_final: b.entrega_final || null, criado_por: user.id,
  }).select('id').single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  await supabase.from('obra_usuarios').insert({ obra_id: data.id, usuario_id: user.id });
  return NextResponse.json({ ok: true, obraId: data.id });
}
