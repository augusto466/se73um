import DiarioClient from '@/components/DiarioClient';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Diario() {
  const supabase = supabaseServer();
  const { data } = await supabase.from('diario').select('*').order('data', { ascending: false });
  return <DiarioClient registrosIniciais={data ?? []} />;
}
