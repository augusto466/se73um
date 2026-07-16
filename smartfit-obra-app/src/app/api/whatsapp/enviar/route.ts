import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const maxDuration = 60;

/**
 * Enfileira uma mensagem. Quem envia é o serviço — aqui só entra na fila.
 *
 * Isso não é rodeio: manter a fila no banco dá rastro do que o sistema mandou
 * em nome de quem, e sobrevive a reinício do serviço.
 */
export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: perfil } = await supa.from('profiles').select('papel, empresa_id').eq('id', user.id).single();
  if (!['admin', 'contratante'].includes(perfil?.papel ?? '')) {
    return NextResponse.json({ erro: 'Somente admin ou contratante envia.' }, { status: 403 });
  }

  const { para_jid, texto, instancia_id } = await req.json();
  if (!para_jid || !texto?.trim()) {
    return NextResponse.json({ erro: 'Informe o destinatário e o texto.' }, { status: 400 });
  }

  const { data: inst } = await supa.from('wa_instancias')
    .select('id, status').eq('id', instancia_id ?? 0).maybeSingle();
  if (!inst) {
    const { data: qualquer } = await supa.from('wa_instancias')
      .select('id, status').eq('status', 'conectado').limit(1).maybeSingle();
    if (!qualquer) return NextResponse.json({ erro: 'Nenhuma instância conectada.' }, { status: 400 });
  }
  const id = inst?.id ?? (await supa.from('wa_instancias').select('id').eq('status', 'conectado').limit(1).single()).data?.id;
  const status = inst?.status;
  if (status && status !== 'conectado') {
    return NextResponse.json({ erro: `A instância está "${status}". Conecte antes de enviar.` }, { status: 400 });
  }

  // não iniciamos conversa com quem nunca falou com a gente: é o padrão
  // clássico de spam e o caminho mais curto para o ban
  const { data: contato } = await supa.from('wa_contatos')
    .select('id, bloqueado').eq('jid', para_jid).maybeSingle();
  if (contato?.bloqueado) {
    return NextResponse.json({ erro: 'Este contato está bloqueado no sistema.' }, { status: 400 });
  }
  if (!contato) {
    return NextResponse.json({
      erro: 'Este número nunca conversou com a instância. Iniciar conversa com desconhecido é o padrão que a Meta classifica como spam — peça para ele mandar a primeira mensagem.',
    }, { status: 400 });
  }

  const { data, error } = await supa.from('wa_fila').insert({
    instancia_id: id, para_jid, texto: String(texto).slice(0, 4000),
    criado_por: user.id, empresa_id: perfil.empresa_id,
  }).select('id').single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, fila_id: data.id, aviso: 'Na fila. O envio é lento de propósito — cadência de robô é o que denuncia robô.' });
}
