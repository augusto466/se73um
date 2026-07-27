import { supabaseServer } from '@/lib/supabase/server';
import PedidoCompraDoc from '@/components/PedidoCompraDoc';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PedidoCompra({ params }: { params: { id: string } }) {
  const supabase = supabaseServer();
  const pedidoId = Number(params.id);

  // Busca o pedido. A RLS garante que so quem tem acesso a obra le — cliente
  // ou gestor. Se o pedido nao e de faturamento direto ou nao e do vinculo,
  // nada volta.
  const { data: pedido } = await supabase
    .from('pedidos_materiais')
    .select('*')
    .eq('id', pedidoId)
    .maybeSingle();

  if (!pedido) notFound();

  const [{ data: obra }, { data: cotacao }, { data: empresa }, { data: evento }] = await Promise.all([
    supabase.from('obras').select('*').eq('id', pedido.obra_id).maybeSingle(),
    pedido.cotacao_vencedora
      ? supabase.from('cotacoes').select('fornecedor, cnpj, email, valor_total, prazo_entrega, condicoes_pagamento, frete').eq('id', pedido.cotacao_vencedora).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('empresas').select('razao_social, nome_fantasia, cnpj, logo_path, cor_marca, endereco, cidade, uf, cep, telefone, email').eq('id', pedido.empresa_id).maybeSingle(),
    supabase.from('eventos').select('etapa, faturamento_direto').eq('id', pedido.evento_id).eq('obra_id', pedido.obra_id).maybeSingle(),
  ]);

  // Logo da empresa: se houver logo_path, gera URL assinada do bucket.
  let logoUrl: string | null = null;
  if (empresa?.logo_path) {
    const { data } = await supabase.storage.from('arquivos').createSignedUrl(empresa.logo_path, 60 * 30);
    logoUrl = data?.signedUrl ?? null;
  }

  return (
    <PedidoCompraDoc
      pedido={pedido}
      obra={obra}
      cotacao={cotacao}
      empresa={empresa}
      evento={evento}
      logoUrl={logoUrl}
    />
  );
}
