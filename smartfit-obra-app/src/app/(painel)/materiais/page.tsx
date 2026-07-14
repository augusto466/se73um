import MateriaisClient from '@/components/MateriaisClient';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Materiais() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: perfil }, { data: pedidos }, { data: cotacoes }, { data: eventos }] = await Promise.all([
    supabase.from('profiles').select('papel').eq('id', user!.id).single(),
    supabase.from('pedidos_materiais').select('*').order('criado_em', { ascending: false }),
    supabase.from('cotacoes').select('*').order('valor_total'),
    supabase.from('eventos').select('id, etapa').order('mes'),
  ]);
  return (
    <MateriaisClient
      pedidosIniciais={pedidos ?? []}
      cotacoesIniciais={cotacoes ?? []}
      eventos={eventos ?? []}
      papel={perfil?.papel ?? 'contratada'}
    />
  );
}
