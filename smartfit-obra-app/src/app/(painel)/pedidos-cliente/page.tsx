import { supabaseServer } from '@/lib/supabase/server';
import { obraAtiva } from '@/lib/obra';
import PedidosClienteView from '@/components/PedidosClienteView';

export const dynamic = 'force-dynamic';

export default async function PedidosCliente() {
  const supabase = supabaseServer();
  const ativa = await obraAtiva();

  const [{ data: pedidos }, { data: decisoes }] = await Promise.all([
    // pedido_cliente ja filtra faturamento direto e vinculo, sem custo negociado.
    supabase.from('pedido_cliente').select('*').eq('obra_id', ativa?.id ?? 0).order('necessidade', { nullsFirst: false }),
    // as decisoes que o cliente ja registrou (a RLS filtra as dele).
    supabase.from('pedido_decisao_cliente').select('pedido_id, decisao, comentario, decidido_em'),
  ]);

  return <PedidosClienteView pedidos={pedidos ?? []} decisoes={decisoes ?? []} />;
}
