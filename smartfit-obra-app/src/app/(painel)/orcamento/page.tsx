import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { exigirObra } from '@/lib/obra';
import OrcamentoClient from '@/components/OrcamentoClient';

export const dynamic = 'force-dynamic';

export default async function Orcamento() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from('profiles').select('papel').eq('id', user!.id).single();
  if (!['admin', 'contratante'].includes(perfil?.papel ?? '')) redirect('/visao');

  const obra = await exigirObra();
  const { data: itens } = await supabase
    .from('orcamento_item_controle')
    .select('*')
    .eq('obra_id', obra.id)
    .order('ordem');

  return <OrcamentoClient itens={itens ?? []} obra={obra} />;
}
