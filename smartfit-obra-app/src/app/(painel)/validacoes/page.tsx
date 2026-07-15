import ValidacoesClient from '@/components/ValidacoesClient';
import { supabaseServer } from '@/lib/supabase/server';
import { exigirObra, perfilAtual } from '@/lib/obra';

export const dynamic = 'force-dynamic';

export default async function Validacoes() {
  const obra = await exigirObra();
  const supabase = supabaseServer();
  const [perfil, { data: itens }] = await Promise.all([
    perfilAtual(),
    supabase.from('checklist').select('*').eq('obra_id', obra.id).order('id'),
  ]);
  return <ValidacoesClient itensIniciais={itens ?? []} papel={perfil?.papel ?? 'contratada'} obraId={obra.id} />;
}
