import TarefasClient from '@/components/TarefasClient';
import { supabaseServer } from '@/lib/supabase/server';
import { exigirObra } from '@/lib/obra';

export const dynamic = 'force-dynamic';

export default async function Tarefas() {
  const obra = await exigirObra();
  const supabase = supabaseServer();
  // inclui as tarefas da empresa (obra_id null): RH, Jurídico e afins não pertencem a obra
  const [{ data: tarefas }, { data: eventos }, { data: centros }, { data: metricas }] = await Promise.all([
    supabase.from('tarefas').select('*').or(`obra_id.eq.${obra.id},obra_id.is.null`).order('criado_em', { ascending: false }),
    supabase.from('eventos').select('id, etapa').eq('obra_id', obra.id).order('mes'),
    supabase.from('centros_custo').select('id, nome, tipo').eq('ativo', true).order('ordem'),
    supabase.from('metricas_centro_total').select('*'),
  ]);
  return (
    <TarefasClient
      tarefasIniciais={tarefas ?? []} eventos={eventos ?? []} obraId={obra.id}
      centros={centros ?? []} metricas={metricas ?? []}
    />
  );
}
