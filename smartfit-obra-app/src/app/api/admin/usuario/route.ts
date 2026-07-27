import { NextResponse } from 'next/server';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';

// So admin edita/desativa usuario. Usa service role para escrever no perfil
// sem depender da RLS. Trava: admin nao pode desativar nem rebaixar a si mesmo,
// e nao pode desativar/rebaixar o ultimo admin ativo (evita ficar sem acesso).
export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: euPerfil } = await supa.from('profiles').select('papel').eq('id', user.id).single();
  if (euPerfil?.papel !== 'admin') return NextResponse.json({ erro: 'Apenas administradores.' }, { status: 403 });

  const { acao, usuarioId, nome, papel, empresa } = await req.json();
  if (!usuarioId) return NextResponse.json({ erro: 'Informe o usuário.' }, { status: 400 });

  const admin = supabaseAdmin();

  // Trava: nao mexer em si mesmo (evita se trancar fora).
  if (usuarioId === user.id && (acao === 'desativar' || (acao === 'editar' && papel && papel !== 'admin'))) {
    return NextResponse.json({ erro: 'Você não pode desativar ou rebaixar a si mesmo.' }, { status: 400 });
  }

  // Trava: nao deixar o sistema sem nenhum admin ativo.
  if (acao === 'desativar' || (acao === 'editar' && papel && papel !== 'admin')) {
    const { data: alvo } = await admin.from('profiles').select('papel, ativo').eq('id', usuarioId).single();
    if (alvo?.papel === 'admin' && alvo?.ativo) {
      const { count } = await admin.from('profiles').select('*', { count: 'exact', head: true }).eq('papel', 'admin').eq('ativo', true);
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ erro: 'Este é o único administrador ativo. Promova outro antes de desativar ou rebaixar.' }, { status: 400 });
      }
    }
  }

  if (acao === 'desativar') {
    const { error } = await admin.from('profiles').update({ ativo: false }).eq('id', usuarioId);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, ativo: false });
  }

  if (acao === 'reativar') {
    const { error } = await admin.from('profiles').update({ ativo: true }).eq('id', usuarioId);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, ativo: true });
  }

  if (acao === 'editar') {
    if (papel && !['admin', 'contratante', 'contratada', 'cliente'].includes(papel)) {
      return NextResponse.json({ erro: 'Papel inválido.' }, { status: 400 });
    }
    const patch: any = {};
    if (nome !== undefined) patch.nome = nome;
    if (papel !== undefined) patch.papel = papel;
    if (empresa !== undefined) patch.empresa = empresa;
    if (!Object.keys(patch).length) return NextResponse.json({ erro: 'Nada para atualizar.' }, { status: 400 });

    const { error } = await admin.from('profiles').update(patch).eq('id', usuarioId);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, ...patch });
  }

  return NextResponse.json({ erro: 'Ação desconhecida.' }, { status: 400 });
}
