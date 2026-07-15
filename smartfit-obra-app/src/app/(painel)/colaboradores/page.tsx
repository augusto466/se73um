import ColaboradoresClient from '@/components/ColaboradoresClient';
import { supabaseServer } from '@/lib/supabase/server';
import { perfilAtual } from '@/lib/obra';

export const dynamic = 'force-dynamic';

export default async function Colaboradores() {
  const supabase = supabaseServer();
  const [perfil, { data: colabs }, { data: centros }, { data: obras }] = await Promise.all([
    perfilAtual(),
    supabase.from('colaboradores').select('*').eq('ativo', true).order('nome'),
    supabase.from('centros_custo').select('*').eq('ativo', true).order('ordem'),
    supabase.from('obras').select('id, codigo, nome').order('codigo'),
  ]);
  return (
    <ColaboradoresClient
      iniciais={colabs ?? []} centros={centros ?? []} obras={obras ?? []}
      papel={perfil?.papel ?? 'contratada'}
    />
  );
}
