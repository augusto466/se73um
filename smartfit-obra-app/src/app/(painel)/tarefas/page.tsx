import TarefasClient from '@/components/TarefasClient';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Tarefas() {
  const supabase = supabaseServer();
  const [{ data: tarefas }, { data: eventos }] = await Promise.all([
    supabase.from('tarefas').select('*').order('criado_em', { ascending: false }),
    supabase.from('eventos').select('id, etapa').order('mes'),
  ]);
  return <TarefasClient tarefasIniciais={tarefas ?? []} eventos={eventos ?? []} />;
}
