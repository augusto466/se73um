import ReplanejamentoClient from '@/components/ReplanejamentoClient';
import { supabaseServer } from '@/lib/supabase/server';
import { exigirObra, perfilAtual } from '@/lib/obra';

export const dynamic = 'force-dynamic';

export default async function Replanejamento() {
  const obra = await exigirObra();
  const supabase = supabaseServer();
  const [perfil, { data: eventos }, { data: deps }, { data: revisoes }] = await Promise.all([
    perfilAtual(),
    supabase.from('eventos')
      .select('id, obra_id, etapa, descricao, status, valor_bruto, base_inicio, base_fim, base_mes, prev_inicio, prev_fim, real_inicio, real_fim, duracao_dias, critico')
      .eq('obra_id', obra.id).order('mes').order('id'),
    supabase.from('evento_dependencias').select('*').eq('obra_id', obra.id).order('evento_id'),
    supabase.from('cronograma_revisoes').select('*').eq('obra_id', obra.id).order('numero', { ascending: false }),
  ]);

  return (
    <ReplanejamentoClient
      eventos={eventos ?? []}
      deps={deps ?? []}
      revisoes={revisoes ?? []}
      obra={obra}
      papel={perfil?.papel ?? 'contratada'}
    />
  );
}
