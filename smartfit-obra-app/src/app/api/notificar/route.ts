import { NextResponse } from 'next/server';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import {
  enviar, emailMedicaoSubmetida, emailMedicaoDecidida,
  emailPedidoEnviado, emailPedidoDecidido,
} from '@/lib/email';
import { numeroPedido } from '@/lib/contrato';

export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { tipo, eventoId, pedidoId } = await req.json();
  const admin = supabaseAdmin();

  const emailsPorPapel = async (papeis?: string[]) => {
    let q = admin.from('profiles').select('email').eq('notificar', true);
    if (papeis?.length) q = q.in('papel', papeis);
    const { data } = await q;
    return (data ?? []).map(p => p.email).filter(Boolean) as string[];
  };

  let destinos: string[] = [];
  let assunto = '';
  let html = '';

  if (tipo === 'submetida' || tipo === 'decidida') {
    const { data: ev } = await admin.from('eventos').select('*').eq('id', eventoId).single();
    if (!ev) return NextResponse.json({ erro: 'Evento não encontrado.' }, { status: 404 });
    if (tipo === 'submetida') {
      destinos = await emailsPorPapel(['contratante', 'admin']);
      assunto = `[Obra Smart Fit] Medição ${ev.id} submetida para validação — ${ev.etapa}`;
      html = emailMedicaoSubmetida(ev);
    } else {
      destinos = await emailsPorPapel();
      assunto = `[Obra Smart Fit] Medição ${ev.id} ${ev.status === 'aprovado' ? 'aprovada' : 'aprovada com glosa'} — ${ev.etapa}`;
      html = emailMedicaoDecidida(ev);
    }
  } else if (tipo === 'pedido_enviado' || tipo === 'pedido_decidido') {
    const { data: pedido } = await admin.from('pedidos_materiais').select('*').eq('id', pedidoId).single();
    if (!pedido) return NextResponse.json({ erro: 'Pedido não encontrado.' }, { status: 404 });
    const { data: cots } = await admin.from('cotacoes').select('*').eq('pedido_id', pedidoId);
    const numero = numeroPedido(pedido.id);

    if (tipo === 'pedido_enviado') {
      destinos = await emailsPorPapel(['contratante', 'admin']);
      assunto = `[Obra Smart Fit] Pedido de materiais ${numero} aguardando aprovação — ${pedido.titulo}`;
      html = emailPedidoEnviado({
        numero, titulo: pedido.titulo, evento_id: pedido.evento_id,
        necessidade: pedido.necessidade,
        qtdItens: Array.isArray(pedido.itens) ? pedido.itens.length : 0,
        cotacoes: cots ?? [],
      });
    } else {
      const vencedora = (cots ?? []).find(c => c.id === pedido.cotacao_vencedora);
      destinos = await emailsPorPapel();
      const acao = pedido.status === 'aprovado' ? 'aprovado — compra autorizada'
        : pedido.status === 'recusado' ? 'recusado' : 'compra efetuada';
      assunto = `[Obra Smart Fit] Pedido ${numero} ${acao} — ${pedido.titulo}`;
      html = emailPedidoDecidido({
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
