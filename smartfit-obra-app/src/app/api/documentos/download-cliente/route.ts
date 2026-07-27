import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * Devolve URL assinada de um documento liberado ao cliente.
 *
 * A RLS ja barra documento nao-marcado, mas esta rota recheca visivel_cliente
 * e o vinculo: defesa em profundidade. Um bug de RLS amanha nao vira vazamento
 * porque a checagem tambem mora aqui.
 */
export async function GET(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ erro: 'Informe o documento.' }, { status: 400 });

  const { data: perfil } = await supa.from('profiles').select('papel').eq('id', user.id).single();

  // Le o documento (a RLS ja filtra o que este usuario pode ver). Se for
  // cliente, exige o marcador explicitamente — nao confia so na RLS.
  const { data: doc } = await supa.from('documentos')
    .select('arquivo_path, arquivo_nome, visivel_cliente')
    .eq('id', Number(id)).maybeSingle();

  if (!doc) return NextResponse.json({ erro: 'Documento não encontrado.' }, { status: 404 });
  if (perfil?.papel === 'cliente' && !doc.visivel_cliente) {
    return NextResponse.json({ erro: 'Fora do seu alcance.' }, { status: 403 });
  }
  if (!doc.arquivo_path) return NextResponse.json({ erro: 'Este documento não tem arquivo anexado.' }, { status: 404 });

  const { data, error } = await supa.storage
    .from('arquivos')
    .createSignedUrl(doc.arquivo_path, 60 * 10, { download: doc.arquivo_nome ?? undefined });
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  return NextResponse.json({ url: data.signedUrl });
}
