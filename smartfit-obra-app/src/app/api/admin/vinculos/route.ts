import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

async function exigirAdmin() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: 'Não autenticado.', status: 401 as const };
  const { data: perfil } = await supabase.from('profiles').select('papel').eq('id', user.id).single();
  if (perfil?.papel !== 'admin') return { erro: 'Apenas administradores.', status: 403 as const };
  return { supabase };
}

export async function POST(req: Request) {
  const r = await exigirAdmin();
  if ('erro' in r) return NextResponse.json({ erro: r.erro }, { status: r.status });
  const { obraId, usuarioId, vincular } = await req.json();
  if (vincular) {
    const { error } = await r.supabase.from('obra_usuarios').insert({ obra_id: obraId, usuario_id: usuarioId });
    if (error && !error.message.includes('duplicate')) return NextResponse.json({ erro: error.message }, { status: 400 });
  } else {
    const { error } = await r.supabase.from('obra_usuarios').delete().eq('obra_id', obraId).eq('usuario_id', usuarioId);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
