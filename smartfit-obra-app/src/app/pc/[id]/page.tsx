import { createClient } from '@supabase/supabase-js';
import PedidoCompraDoc from '@/components/PedidoCompraDoc';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Rota PUBLICA: o fornecedor abre sem login. Usa service role porque nao ha
// usuario logado — mas so entrega o pedido cujo token no link bate com o do
// banco. Sem token valido, nega. Isso impede navegar pelos pedidos por ID.
export default async function PedidoCompraPublico({
  params, searchParams,
}: { params: { id: string }; searchParams: { token?: string } }) {
  const token = searchParams.token;
  if (!token) notFound();

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const pedidoId = Number(params.id);
  const { data: pedido } = await admin
    .from('pedidos_materiais')
    .select('*')
    .eq('id', pedidoId)
    .maybeSingle();

  // Token errado, ausente, ou pedido que nao e faturamento direto: nega.
  if (!pedido || !pedido.pc_token || pedido.pc_token !== token || !pedido.faturamento_direto) {
    notFound();
  }

  const [{ data: obra }, { data: cotacao }, { data: empresa }, { data: evento }] = await Promise.all([
    admin.from('obras').select('*').eq('id', pedido.obra_id).maybeSingle(),
    pedido.cotacao_vencedora
      ? admin.from('cotacoes').select('fornecedor, cnpj, email, valor_total, prazo_entrega, condicoes_pagamento, frete').eq('id', pedido.cotacao_vencedora).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('empresas').select('razao_social, nome_fantasia, cnpj, logo_path, cor_marca, endereco, cidade, uf, cep, telefone, email').eq('id', pedido.empresa_id).maybeSingle(),
    admin.from('eventos').select('etapa, faturamento_direto').eq('id', pedido.evento_id).eq('obra_id', pedido.obra_id).maybeSingle(),
  ]);

  let logoUrl: string | null = null;
  if (empresa?.logo_path) {
    const { data } = await admin.storage.from('arquivos').createSignedUrl(empresa.logo_path, 60 * 30);
    logoUrl = data?.signedUrl ?? null;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f5', padding: '20px 0' }}>
      <PedidoCompraDoc pedido={pedido} obra={obra} cotacao={cotacao} empresa={empresa} evento={evento} logoUrl={logoUrl} />
    </div>
  );
}
