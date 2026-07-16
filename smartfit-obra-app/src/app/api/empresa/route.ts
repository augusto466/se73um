import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const maxDuration = 60;

/** PATCH — atualiza o perfil da empresa. Só admin, e só a própria. */
export async function PATCH(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: perfil } = await supa.from('profiles').select('papel, empresa_id, superadmin').eq('id', user.id).single();
  if (perfil?.papel !== 'admin' && !perfil?.superadmin) {
    return NextResponse.json({ erro: 'Somente o admin da empresa edita o perfil.' }, { status: 403 });
  }

  const body = await req.json();
  // o RLS já trava, mas a empresa vem do perfil — nunca do corpo da requisição
  const id = perfil.empresa_id;

  const campos = [
    'razao_social', 'nome_fantasia', 'cnpj', 'logo_path', 'cor_marca',
    'email', 'telefone', 'site', 'endereco', 'cidade', 'uf', 'cep',
    'email_remetente',
  ];
  const patch: any = {};
  for (const c of campos) if (body[c] !== undefined) patch[c] = body[c] || null;

  if (patch.cor_marca && !/^#[0-9A-Fa-f]{6}$/.test(patch.cor_marca)) {
    return NextResponse.json({ erro: 'A cor da marca precisa ser um hex, ex.: #FD1843.' }, { status: 400 });
  }
  if (patch.email_remetente && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(patch.email_remetente)) {
    return NextResponse.json({ erro: 'O e-mail remetente não parece válido.' }, { status: 400 });
  }
  if (!patch.razao_social && body.razao_social === '') {
    return NextResponse.json({ erro: 'A razão social é obrigatória — ela aparece nos documentos.' }, { status: 400 });
  }

  const { data, error } = await supa.from('empresas').update(patch).eq('id', id).select().single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  // trocar o remetente derruba a verificação: o domínio pode ser outro
  if (patch.email_remetente) {
    const dominioNovo = String(patch.email_remetente).split('@')[1];
    const { data: atual } = await supa.from('empresas').select('email_remetente, dominio_verificado').eq('id', id).single();
    const dominioAntigo = atual?.email_remetente?.split('@')[1];
    if (dominioNovo !== dominioAntigo) {
      await supa.from('empresas').update({ dominio_verificado: false }).eq('id', id);
    }
  }

  return NextResponse.json({ ok: true, empresa: data });
}
