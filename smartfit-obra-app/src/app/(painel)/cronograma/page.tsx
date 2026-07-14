import EventosClient from '@/components/EventosClient';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Cronograma() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from('profiles').select('papel').eq('id', user!.id).single();
  const { data: eventos } = await supabase.from('eventos').select('*').order('mes').order('id');
  return <EventosClient eventosIniciais={eventos ?? []} papel={perfil?.papel ?? 'contratada'} />;
}
