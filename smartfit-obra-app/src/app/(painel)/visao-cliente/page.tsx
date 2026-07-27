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
  const [{ data: obra }, { data: eventos }] = await Promise.all([
    supabase.from('obra_cliente').select('*').eq('obra_id', ativa?.id ?? 0).maybeSingle(),
    supabase.from('evento_cliente').select('*').eq('obra_id', ativa?.id ?? 0).order('prev_inicio', { nullsFirst: false }),
  ]);

  return <VisaoClienteView obra={obra} eventos={eventos ?? []} />;
}
