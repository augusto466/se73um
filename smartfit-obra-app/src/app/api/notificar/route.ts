import { NextResponse } from 'next/server';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import {
  enviar, emailMedicaoSubmetida, emailMedicaoDecidida,
  emailPedidoEnviado, emailPedidoDecidido,
} from '@/lib/email';
import { numeroPedido } from '@/lib/contrato';

/** Destinatários: vinculados à obra + admins (que recebem de todas). */
async function destinatarios(admin: any, obraId: number, papeis?: string[]) {
  const { data: vinculos } = await admin.from('obra_usuarios').select('usuario_id').eq('obra_id', obraId);
  const ids = (vinculos ?? []).map((v: any) => v.usuario_id);
  let q = admin.from('profiles').select('email, papel').eq('notificar', true);
  const { data: todos } = await q;
  return (todos ?? [])
    .filter((p: any) => p.papel === 'admin' || ids.includes(p.id ?? '') || ids.length === 0)
    .filter((p: any) => !papeis || papeis.includes(p.papel))
    .map((p: any) => p.email).filter(Boolean);
}

export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { tipo, eventoId, pedidoId, obraId } = await req.json();
  if (!obraId) return NextResponse.json({ erro: 'Obra não informada.' }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: obra } = await admin.from('obras').select('*').eq('id', obraId).single();
  if (!obra) return NextResponse.json({ erro: 'Obra não encontrada.' }, { status: 404 });

  // e-mails dos usuários vinculados à obra (+ admins)
  const { data: vinculos } = await admin.from('obra_usuarios').select('usuario_id').eq('obra_id', obraId);
  const ids = (vinculos ?? []).map((v: any) => v.usuario_id);
  const { data: perfis } = await admin.from('profiles').select('id, email, papel').eq('notificar', true);
  const alvo = (papeis?: string[]) => (perfis ?? [])
    .filter(p => p.papel === 'admin' || ids.includes(p.id))
    .filter(p => !papeis || papeis.includes(p.papel))
    .map(p => p.email).filter(Boolean) as string[];

  let destinos: string[] = [];
  let assunto = '';
  let html = '';
  const tag = `[${obra.codigo}]`;

  if (tipo === 'submetida' || tipo === 'decidida') {
    const { data: ev } = await admin.from('eventos').select('*').eq('id', eventoId).eq('obra_id', obraId).single();
    if (!ev) return NextResponse.json({ erro: 'Evento não encontrado.' }, { status: 404 });
    if (tipo === 'submetida') {
      destinos = alvo(['contratante', 'admin']);
      assunto = `${tag} Medição ${ev.id} submetida para validação — ${ev.etapa}`;
      html = emailMedicaoSubmetida(obra, ev);
    } else {
      destinos = alvo();
      assunto = `${tag} Medição ${ev.id} ${ev.status === 'aprovado' ? 'aprovada' : 'aprovada com glosa'} — ${ev.etapa}`;
      html = emailMedicaoDecidida(obra, ev);
    }
  } else if (tipo === 'pedido_enviado' || tipo === 'pedido_decidido') {
    const { data: pedido } = await admin.from('pedidos_materiais').select('*').eq('id', pedidoId).single();
    if (!pedido) return NextResponse.json({ erro: 'Pedido não encontrado.' }, { status: 404 });
    const { data: cots } = await admin.from('cotacoes').select('*').eq('pedido_id', pedidoId);
    const numero = numeroPedido(pedido.id);

    if (tipo === 'pedido_enviado') {
      destinos = alvo(['contratante', 'admin']);
      assunto = `${tag} Pedido de materiais ${numero} aguardando aprovação — ${pedido.titulo}`;
      html = emailPedidoEnviado(obra, {
        numero, titulo: pedido.titulo, evento_id: pedido.evento_id, necessidade: pedido.necessidade,
        qtdItens: Array.isArray(pedido.itens) ? pedido.itens.length : 0, cotacoes: cots ?? [],
      });
    } else {
      const vencedora = (cots ?? []).find(c => c.id === pedido.cotacao_vencedora);
      destinos = alvo();
      const acao = pedido.status === 'aprovado' ? 'aprovado — compra autorizada'
        : pedido.status === 'recusado' ? 'recusado' : 'compra efetuada';
      assunto = `${tag} Pedido ${numero} ${acao} — ${pedido.titulo}`;
      html = emailPedidoDecidido(obra, {
        numero, titulo: pedido.titulo, status: pedido.status, motivo: pedido.motivo_decisao,
        fornecedor: vencedora?.fornecedor, valor: vencedora ? Number(vencedora.valor_total) : undefined,
        compra: pedido.compra_info,
      });
    }
  } else {
    return NextResponse.json({ erro: 'Tipo inválido.' }, { status: 400 });
  }

  try {
    const r = await enviar(destinos, assunto, html);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }
}
