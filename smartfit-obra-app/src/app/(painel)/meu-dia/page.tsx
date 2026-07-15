import { supabaseServer } from '@/lib/supabase/server';
import MeuDiaClient from '@/components/MeuDiaClient';

export const dynamic = 'force-dynamic';

export default async function MeuDia() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: perfil }, { data: itens }, { data: obras }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase.from('meu_dia').select('*'),
    supabase.from('obras').select('id, codigo, nome'),
  ]);
  return <MeuDiaClient itens={itens ?? []} obras={obras ?? []} perfil={perfil} />;
}
