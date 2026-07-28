import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import FinanceiroClient from '@/components/FinanceiroClient';

export const dynamic = 'force-dynamic';

export default async function Financeiro() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from('profiles').select('papel').eq('id', user!.id).single();
  if (!['admin', 'contratante'].includes(perfil?.papel ?? '')) redirect('/visao');

  const [{ data: lancs }, { data: cats }, { data: obras }, { data: caixa }, { data: dre }, { data: recor }, { data: itensOrc }, { data: apropriacoes }] =
    await Promise.all([
      supabase.from('lancamentos').select('*').order('vencimento'),
      supabase.from('categorias_financeiras').select('*').order('ordem'),
      supabase.from('obras').select('id, codigo, nome, valor_global').order('codigo'),
      supabase.from('caixa_config').select('*').eq('id', 1).maybeSingle(),
      supabase.from('dre_obra').select('*'),
      supabase.from('recorrentes').select('*').order('descricao'),
      supabase.from('orcamento_item').select('id, codigo, descricao, etapa_num, custo_orcado, ordem').eq('obra_id', 1).order('ordem'),
      supabase.from('lancamento_item').select('*'),
       ]);

  return (
    <FinanceiroClient
      lancamentos={lancs ?? []}
      categorias={cats ?? []}
      obras={obras ?? []}
      saldoInicial={Number(caixa?.saldo_inicial ?? 0)}
      dre={dre ?? []}
      recorrentes={recor ?? []}
      papel={perfil?.papel ?? 'contratante'}
      itensOrcamento={itensOrc ?? []}
      apropriacoes={apropriacoes ?? []}
    />
  );
}
