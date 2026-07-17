import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * Devolve URL assinada para a mídia. O bucket é privado de propósito: conversa
 * de obra tem foto de nota fiscal, de documento, de gente. Link público seria
 * link eterno e indexável.
 */
export async function GET(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const path = new URL(req.url).searchParams.get('path');
  if (!path) return NextResponse.json({ erro: 'Informe o path.' }, { status: 400 });

  // O path começa com o empresa_id. Sem esta checagem, trocar o número na URL
  // daria a mídia de outra empresa — a RLS não alcança o Storage.
  const { data: perfil } = await supa.from('profiles').select('empresa_id').eq('id', user.id).single();
  if (!perfil?.empresa_id || !path.startsWith(`${perfil.empresa_id}/`)) {
    return NextResponse.json({ erro: 'Fora do seu alcance.' }, { status: 403 });
  }

  const { data, error } = await supa.storage
    .from(process.env.BUCKET_MIDIA ?? 'wa-midia')
    .createSignedUrl(path, 60 * 30);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  return NextResponse.json({ url: data.signedUrl });
}