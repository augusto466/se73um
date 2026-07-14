import ValidacoesClient from '@/components/ValidacoesClient';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Validacoes() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: perfil }, { data: itens }] = await Promise.all([
    supabase.from('profiles').select('papel').eq('id', user!.id).single(),
    supabase.from('checklist').select('*').order('id'),
  ]);
  return <ValidacoesClient itensIniciais={itens ?? []} papel={perfil?.papel ?? 'contratada'} />;
}
