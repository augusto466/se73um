import MateriaisClient from '@/components/MateriaisClient';
import { supabaseServer } from '@/lib/supabase/server';
import { exigirObra, perfilAtual } from '@/lib/obra';

export const dynamic = 'force-dynamic';

export default async function Materiais() {
  const obra = await exigirObra();
  const supabase = supabaseServer();
  const { data: pedidos } = await supabase.from('pedidos_materiais').select('*').eq('obra_id', obra.id).order('criado_em', { ascending: false });
  const ids = (pedidos ?? []).map(p => p.id);
  const [perfil, { data: cotacoes }, { data: eventos }] = await Promise.all([
    perfilAtual(),
    ids.length
      ? supabase.from('cotacoes').select('*').in('pedido_id', ids).order('valor_total')
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('eventos').select('id, etapa').eq('obra_id', obra.id).order('mes'),
  ]);
  return (
    <MateriaisClient
      pedidosIniciais={pedidos ?? []}
      cotacoesIniciais={cotacoes ?? []}
      eventos={eventos ?? []}
      papel={perfil?.papel ?? 'contratada'}
      obraId={obra.id}
    />
  );
}
