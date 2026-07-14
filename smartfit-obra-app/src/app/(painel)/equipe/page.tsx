import EquipeClient from '@/components/EquipeClient';
import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function Equipe() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from('profiles').select('papel').eq('id', user!.id).single();
  if (perfil?.papel !== 'admin') redirect('/visao');
  const { data: perfis } = await supabase.from('profiles').select('*').order('criado_em');
  return <EquipeClient perfisIniciais={perfis ?? []} />;
}
