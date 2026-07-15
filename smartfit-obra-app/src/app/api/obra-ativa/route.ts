import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { COOKIE_OBRA } from '@/lib/obra';

export async function POST(req: Request) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { obraId } = await req.json();
  // RLS garante que só retorna se o usuário tem acesso
  const { data } = await supabase.from('obras').select('id').eq('id', obraId).maybeSingle();
  if (!data) return NextResponse.json({ erro: 'Obra não encontrada ou sem acesso.' }, { status: 403 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_OBRA, String(obraId), { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return res;
}
