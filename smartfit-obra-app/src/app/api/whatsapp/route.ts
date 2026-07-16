import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const maxDuration = 60;

/**
 * Ponte entre o painel e o serviço de WhatsApp.
 *
 * A Vercel não fala com o WhatsApp: o serviço roda separado (Railway), porque
 * a sessão precisa de processo vivo. Aqui só comandamos e lemos o banco.
 */
async function chamarServico(caminho: string, metodo = 'POST') {
  const base = process.env.WA_SERVICE_URL;
  const token = process.env.WA_TOKEN;
  if (!base || !token) {
    throw new Error('O serviço de WhatsApp não está configurado. Faltam WA_SERVICE_URL e WA_TOKEN nas variáveis da Vercel.');
  }
  const r = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? `O serviço respondeu ${r.status}.`);
  return j;
}

async function gestor(supa: any) {
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { erro: 'Não autenticado.', status: 401 };
  const { data: p } = await supa.from('profiles').select('papel, empresa_id').eq('id', user.id).single();
  if (!['admin', 'contratante'].includes(p?.papel ?? '')) {
    return { erro: 'Somente admin ou contratante gere o WhatsApp.', status: 403 };
  }
  return { user, perfil: p };
}

/** POST { acao: 'aceitar_risco'|'conectar'|'desconectar', instancia_id? } */
export async function POST(req: Request) {
  const supa = supabaseServer();
  const g: any = await gestor(supa);
  if (g.erro) return NextResponse.json({ erro: g.erro }, { status: g.status });

  const { acao, instancia_id, nome } = await req.json();

  try {
    if (acao === 'criar') {
      const { data, error } = await supa.from('wa_instancias')
        .insert({ nome: nome || 'Principal', empresa_id: g.perfil.empresa_id })
        .select().single();
      if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, instancia: data });
    }

    if (acao === 'aceitar_risco') {
      // o aceite fica com IP e data: numa venda, é a prova de que o cliente soube
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? req.headers.get('x-real-ip') ?? null;
      const { error } = await supa.from('wa_instancias').update({
        risco_aceito: true,
        risco_aceito_em: new Date().toISOString(),
        risco_aceito_por: g.user.id,
        risco_aceito_ip: ip,
      }).eq('id', instancia_id);
      if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (acao === 'conectar') {
      const { data: inst } = await supa.from('wa_instancias').select('risco_aceito').eq('id', instancia_id).maybeSingle();
      if (!inst) return NextResponse.json({ erro: 'Instância não encontrada.' }, { status: 404 });
      if (!inst.risco_aceito) {
        return NextResponse.json({ erro: 'Aceite o risco antes de conectar.' }, { status: 400 });
      }
      const r = await chamarServico(`/instancia/${instancia_id}/conectar`);
      return NextResponse.json(r);
    }

    if (acao === 'desconectar') {
      const r = await chamarServico(`/instancia/${instancia_id}/desconectar`);
      return NextResponse.json(r);
    }

    return NextResponse.json({ erro: 'Ação desconhecida.' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 502 });
  }
}

/** PATCH { contato_id, colaborador_id } — liga o número a uma pessoa. */
export async function PATCH(req: Request) {
  const supa = supabaseServer();
  const g: any = await gestor(supa);
  if (g.erro) return NextResponse.json({ erro: g.erro }, { status: g.status });

  const { contato_id, colaborador_id, bloqueado } = await req.json();
  const patch: any = {};
  if (colaborador_id !== undefined) patch.colaborador_id = colaborador_id || null;
  if (bloqueado !== undefined) patch.bloqueado = !!bloqueado;

  const { error } = await supa.from('wa_contatos').update(patch).eq('id', contato_id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
