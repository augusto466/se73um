import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import PainelCeoClient from '@/components/PainelCeoClient';

export const dynamic = 'force-dynamic';

export default async function PainelCeo() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from('profiles').select('papel').eq('id', user!.id).single();
  if (!['admin', 'contratante'].includes(perfil?.papel ?? '')) redirect('/meu-dia');

  const [{ data: painel }, { data: desvios }, { data: abc }, { data: forn }, { data: caixa }, { data: lancs }] =
    await Promise.all([
      supabase.from('painel_ceo').select('*').order('codigo'),
      supabase.from('desvio_etapa').select('*').order('ordem'),
      supabase.from('curva_abc').select('*').order('valor', { ascending: false }),
      supabase.from('ranking_fornecedores').select('*').order('valor_contratado', { ascending: false, nullsFirst: false }),
      supabase.from('caixa_config').select('*').eq('id', 1).maybeSingle(),
      supabase.from('lancamentos').select('natureza, valor, vencimento, status').in('status', ['previsto', 'confirmado']),
    ]);

  return (
    <PainelCeoClient
      obras={painel ?? []} desvios={desvios ?? []} abc={abc ?? []}
      fornecedores={forn ?? []} saldo={Number(caixa?.saldo_inicial ?? 0)} lancamentos={lancs ?? []}
    />
  );
}
