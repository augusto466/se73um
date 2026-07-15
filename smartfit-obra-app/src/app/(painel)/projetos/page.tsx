import { supabaseServer } from '@/lib/supabase/server';
import { exigirObra, perfilAtual } from '@/lib/obra';
import ProjetosClient from '@/components/ProjetosClient';

export const dynamic = 'force-dynamic';

export default async function Projetos() {
  const obra = await exigirObra();
  const supabase = supabaseServer();
  const [perfil, { data: projetos }] = await Promise.all([
    perfilAtual(),
    supabase.from('projetos').select('*').eq('obra_id', obra.id)
      .order('disciplina').order('codigo').order('criado_em', { ascending: false }),
  ]);
  return <ProjetosClient projetosIniciais={projetos ?? []} obraId={obra.id} papel={perfil?.papel ?? 'contratada'} />;
}
