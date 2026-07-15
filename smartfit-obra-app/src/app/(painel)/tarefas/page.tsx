import TarefasClient from '@/components/TarefasClient';
import { supabaseServer } from '@/lib/supabase/server';
import { exigirObra } from '@/lib/obra';

export const dynamic = 'force-dynamic';

export default async function Tarefas() {
  const obra = await exigirObra();
  const supabase = supabaseServer();
  const [{ data: tarefas }, { data: eventos }] = await Promise.all([
    supabase.from('tarefas').select('*').eq('obra_id', obra.id).order('criado_em', { ascending: false }),
    supabase.from('eventos').select('id, etapa').eq('obra_id', obra.id).order('mes'),
  ]);
  return <TarefasClient tarefasIniciais={tarefas ?? []} eventos={eventos ?? []} obraId={obra.id} />;
}
