import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;
  const publica = path === '/login' || path.startsWith('/api/cron');
  if (!user && !publica) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
if (user && path === '/login') {
    const { data: perfil } = await supabase.from('profiles').select('papel').eq('id', user.id).single();
    const url = req.nextUrl.clone();
    url.pathname = perfil?.papel === 'cliente' ? '/visao-cliente' : '/meu-dia';
    return NextResponse.redirect(url);
  }
  // Guarda do cliente: ele so alcanca as rotas dele. Digitar /financeiro na URL
  // nao renderiza tela de gestor — a RLS ja esvazia os dados, mas a tela nem
  // chega a abrir. Lista-branca: o que nao esta aqui, redireciona.
  if (user && !publica) {
    const { data: perfil } = await supabase.from('profiles').select('papel').eq('id', user.id).single();
    if (perfil?.papel === 'cliente') {
      const liberadas = ['/visao-cliente', '/relatorios-cliente'];
      const apiLiberada = path.startsWith('/api/documentos/download-cliente') || path.startsWith('/api/obra-ativa') || path.startsWith('/api/auth');
      const ehRota = liberadas.some(r => path === r || path.startsWith(r + '/'));
      if (!ehRota && !apiLiberada && !path.startsWith('/_next')) {
        const url = req.nextUrl.clone();
        url.pathname = '/visao-cliente';
        return NextResponse.redirect(url);
      }
    }
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)).*)'],
};
