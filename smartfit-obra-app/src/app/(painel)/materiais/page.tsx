import MateriaisClient from '@/components/MateriaisClient';
import { supabaseServer } from '@/lib/supabase/server';
import { exigirObra, perfilAtual } from '@/lib/obra';

export const dynamic = 'force-dynamic';

export default async function Materiais() {
  const obra = await exigirObra();
  const supabase = supabaseServer();
  const { data: pedidos } = await supabase.from('pedidos_materiais').select('*').eq('obra_id', obra.id).order('criado_em', { ascending: false });
  const ids = (pedidos ?? []).map(p => p.id);
  const [perfil, { data: cotacoes }, { data: eventos }, { data: decisoes }, { data: recebimentos }, { data: pessoas }] = await Promise.all([
    perfilAtual(),
    ids.length
      ? supabase.from('cotacoes').select('*').in('pedido_id', ids).order('valor_total')
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('eventos').select('id, etapa').eq('obra_id', obra.id).order('mes'),
    ids.length
      ? supabase.from('pedido_decisao_cliente').select('pedido_id, decisao, comentario, decidido_em').in('pedido_id', ids)
      : Promise.resolve({ data: [] as any[] }),
    ids.length
      ? supabase.from('recebimento').select('*').in('pedido_id', ids).order('recebido_em', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('profiles').select('id, nome'),
  ]);
  const recIds = (recebimentos ?? []).map(r => r.id);
  const { data: recebimentoItens } = recIds.length
    ? await supabase.from('recebimento_item').select('*').in('recebimento_id', recIds)
    : { data: [] as any[] };

  return (
    <MateriaisClient
      pedidosIniciais={pedidos ?? []}
      cotacoesIniciais={cotacoes ?? []}
      eventos={eventos ?? []}
      papel={perfil?.papel ?? 'contratada'}
      obraId={obra.id}
      decisoesCliente={decisoes ?? []}
      recebimentosIniciais={recebimentos ?? []}
      recebimentoItensIniciais={recebimentoItens ?? []}
      pessoas={pessoas ?? []}
    />
  );
}
