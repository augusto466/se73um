import EventosClient from '@/components/EventosClient';
import { supabaseServer } from '@/lib/supabase/server';
import { exigirObra, perfilAtual } from '@/lib/obra';

export const dynamic = 'force-dynamic';

export default async function Cronograma() {
  const obra = await exigirObra();
  const supabase = supabaseServer();
  const [perfil, { data: eventos }] = await Promise.all([
    perfilAtual(),
    supabase.from('eventos').select('*').eq('obra_id', obra.id).order('mes').order('id'),
  ]);
  return <EventosClient eventosIniciais={eventos ?? []} papel={perfil?.papel ?? 'contratada'} obra={obra} />;
}
