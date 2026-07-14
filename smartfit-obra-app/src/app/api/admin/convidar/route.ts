import { NextResponse } from 'next/server';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import { enviar } from '@/lib/email';

function gerarSenha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return 'Obra-' + Array.from(crypto.getRandomValues(new Uint32Array(10)))
    .map(n => chars[n % chars.length]).join('');
}

export async function POST(req: Request) {
  // 1) só admin autenticado pode criar acessos
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  const { data: perfil } = await supa.from('profiles').select('papel').eq('id', user.id).single();
  if (perfil?.papel !== 'admin') return NextResponse.json({ erro: 'Apenas administradores.' }, { status: 403 });

  const { nome, email, papel } = await req.json();
  if (!email || !['admin', 'contratante', 'contratada'].includes(papel)) {
    return NextResponse.json({ erro: 'Dados inválidos.' }, { status: 400 });
  }

  // 2) cria o usuário com senha temporária (service role)
  const admin = supabaseAdmin();
  const senha = gerarSenha();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true,
    user_metadata: { nome, papel },
  });
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  // 3) e-mail de boas-vindas (sem a senha — ela é entregue pelo admin por canal seguro)
  try {
    await enviar([email], 'Seu acesso ao painel da obra Smart Fit foi criado',
      `<p>Olá${nome ? ', ' + nome : ''}. Seu acesso ao painel de acompanhamento do contrato TK-328/2026 foi criado com o papel <b>${papel}</b>.</p>
       <p>O administrador enviará sua senha temporária por canal seguro. Acesse: <a href="${process.env.NEXT_PUBLIC_APP_URL}/login">${process.env.NEXT_PUBLIC_APP_URL}/login</a></p>`);
  } catch { /* e-mail é cortesia; o acesso já foi criado */ }

  const perfilNovo = { id: data.user.id, nome, email, papel, notificar: true, criado_em: new Date().toISOString() };
  return NextResponse.json({ ok: true, senha, perfil: perfilNovo });
}
