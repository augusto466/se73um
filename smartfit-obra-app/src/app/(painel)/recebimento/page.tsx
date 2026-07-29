import { supabaseServer } from '@/lib/supabase/server';
import { exigirObra } from '@/lib/obra';
import RecebimentoClient from '@/components/RecebimentoClient';

export const dynamic = 'force-dynamic';

export default async function Recebimento() {
  const obra = await exigirObra();
  const supabase = supabaseServer();
  // pedido_item_campo já filtra pedidos aprovados/comprados e nunca traz
  // valor — é a view "limpa" pro campo (supabase/migracao-recebimento.sql).
  const { data: itens } = await supabase
    .from('pedido_item_campo')
    .select('*')
    .eq('obra_id', obra.id)
    .order('pedido_id');

  return <RecebimentoClient itensIniciais={itens ?? []} obraId={obra.id} />;
}
