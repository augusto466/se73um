import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import CockpitClient from '@/components/CockpitClient';

export const dynamic = 'force-dynamic';

export default async function PainelCeo() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from('profiles').select('papel, nome').eq('id', user!.id).single();
  if (!['admin', 'contratante'].includes(perfil?.papel ?? '')) redirect('/meu-dia');

  const [
    { data: obras }, { data: desvios }, { data: abc }, { data: forn },
    { data: caixa }, { data: lancs }, { data: eventos }, { data: pedidos },
    { data: cotacoes }, { data: docs }, { data: fvs },
  ] = await Promise.all([
    supabase.from('painel_ceo').select('*').order('codigo'),
    supabase.from('desvio_etapa').select('*').order('ordem'),
    supabase.from('curva_abc').select('*').order('valor', { ascending: false }),
    supabase.from('ranking_fornecedores').select('*').order('valor_contratado', { ascending: false, nullsFirst: false }),
    supabase.from('caixa_config').select('*').eq('id', 1).maybeSingle(),
    supabase.from('lancamentos').select('natureza, valor, vencimento, status, obra_id'),
    supabase.from('eventos').select('id, obra_id, etapa, status, valor_bruto, atualizado_em'),
    supabase.from('pedidos_materiais').select('id, obra_id, titulo, status, criado_em, necessidade, evento_id'),
    supabase.from('cotacoes').select('id, pedido_id, valor_total, prazo_entrega, fornecedor'),
    supabase.from('documentos').select('id, titulo, validade, obra_id'),
    supabase.from('fvs_inspecoes').select('id, obra_id, resultado'),
  ]);

  return (
    <CockpitClient
      obras={obras ?? []} desvios={desvios ?? []} abc={abc ?? []} fornecedores={forn ?? []}
      saldo={Number(caixa?.saldo_inicial ?? 0)} lancamentos={lancs ?? []}
      eventos={eventos ?? []} pedidos={pedidos ?? []} cotacoes={cotacoes ?? []}
      docs={docs ?? []} fvs={fvs ?? []} nome={perfil?.nome ?? ''}
    />
  );
}
