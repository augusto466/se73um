import OportunidadeClient from '@/components/OportunidadeClient';
import { supabaseServer } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function Oportunidade({ params }: { params: { id: string } }) {
  const supabase = supabaseServer();
  const id = Number(params.id);
  const [{ data: op }, { data: prem }, { data: modelos }, { data: propostas }] = await Promise.all([
    supabase.from('oportunidades').select('*').eq('id', id).maybeSingle(),
    supabase.from('oportunidade_premissas').select('*').eq('oportunidade_id', id).maybeSingle(),
    supabase.from('modelos_orcamento').select('id, nome, tipo_obra').eq('ativo', true).order('nome'),
    supabase.from('propostas').select('*').eq('oportunidade_id', id).order('versao', { ascending: false }),
  ]);
  if (!op) notFound();

  let itens: any[] = [];
  if (propostas?.length) {
    const { data } = await supabase.from('proposta_itens')
      .select('*').eq('proposta_id', propostas[0].id).order('ordem');
    itens = data ?? [];
  }

  return (
    <OportunidadeClient
      op={op} premissasIniciais={prem} modelos={modelos ?? []}
      propostas={propostas ?? []} itensProposta={itens}
    />
  );
}
