import { supabaseServer } from '@/lib/supabase/server';
import { exigirObra, perfilAtual } from '@/lib/obra';
import QualidadeClient from '@/components/QualidadeClient';

export const dynamic = 'force-dynamic';

export default async function Qualidade() {
  const obra = await exigirObra();
  const supabase = supabaseServer();
  const [perfil, { data: modelos }, { data: inspecoes }, { data: eventos }] = await Promise.all([
    perfilAtual(),
    supabase.from('fvs_modelos').select('*').eq('ativo', true).order('disciplina'),
    supabase.from('fvs_inspecoes').select('*').eq('obra_id', obra.id).order('criado_em', { ascending: false }),
    supabase.from('eventos').select('id, etapa').eq('obra_id', obra.id).order('mes'),
  ]);
  return (
    <QualidadeClient
      modelos={modelos ?? []} inspecoesIniciais={inspecoes ?? []}
      eventos={eventos ?? []} obraId={obra.id} papel={perfil?.papel ?? 'contratada'}
    />
  );
}
