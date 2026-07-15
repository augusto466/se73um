import DiarioClient from '@/components/DiarioClient';
import { supabaseServer } from '@/lib/supabase/server';
import { exigirObra } from '@/lib/obra';

export const dynamic = 'force-dynamic';

export default async function Diario() {
  const obra = await exigirObra();
  const supabase = supabaseServer();
  const { data } = await supabase.from('diario').select('*').eq('obra_id', obra.id).order('data', { ascending: false });
  return <DiarioClient registrosIniciais={data ?? []} obraId={obra.id} />;
}
