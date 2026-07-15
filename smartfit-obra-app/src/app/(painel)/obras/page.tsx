import { supabaseServer } from '@/lib/supabase/server';
import PortfolioClient from '@/components/PortfolioClient';

export const dynamic = 'force-dynamic';

export default async function Obras() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: perfil }, { data: portfolio }, { data: obras }] = await Promise.all([
    supabase.from('profiles').select('papel').eq('id', user!.id).single(),
    supabase.from('portfolio').select('*').order('codigo'),
    supabase.from('obras').select('id, codigo, nome').order('codigo'),
  ]);
  return (
    <PortfolioClient
      itens={portfolio ?? []}
      modelos={obras ?? []}
      papel={perfil?.papel ?? 'contratada'}
    />
  );
}
