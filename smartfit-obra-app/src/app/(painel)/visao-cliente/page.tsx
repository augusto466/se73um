import { supabaseServer } from '@/lib/supabase/server';
import { obraAtiva } from '@/lib/obra';
import VisaoClienteView from '@/components/VisaoClienteView';

export const dynamic = 'force-dynamic';

export default async function VisaoCliente() {
  const supabase = supabaseServer();
  const ativa = await obraAtiva();

  // Le SO das views limpas: obra_cliente e evento_cliente nao tem custo,
  // margem nem glosa. Mesmo que alguem mude esta tela um dia, nao ha coluna
  // de margem para vazar — ela nem existe na fonte que a tela enxerga.
  const [{ data: obra }, { data: eventos }, { data: tarefas }, { data: pedidos }] = await Promise.all([
    supabase.from('obra_cliente').select('*').eq('obra_id', ativa?.id ?? 0).maybeSingle(),
    supabase.from('evento_cliente').select('*').eq('obra_id', ativa?.id ?? 0).order('prev_inicio', { nullsFirst: false }),
    // A RLS ja entrega so tarefa com visivel_cliente=true da obra dele.
    supabase.from('tarefas').select('id, descricao, coluna, prazo, responsavel').eq('obra_id', ativa?.id ?? 0),
    // pedido_cliente ja filtra faturamento direto e vinculo; sem custo negociado.
    supabase.from('pedido_cliente').select('*').eq('obra_id', ativa?.id ?? 0).order('necessidade', { nullsFirst: false }),
  ]);

  return <VisaoClienteView obra={obra} eventos={eventos ?? []} tarefas={tarefas ?? []} pedidos={pedidos ?? []} />;
}
