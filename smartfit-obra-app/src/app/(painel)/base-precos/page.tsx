import BaseClient from '@/components/BaseClient';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function BasePrecos() {
  const supabase = supabaseServer();
  const [{ data: bases }, { data: modelos }, { data: calib }, { data: imp }, { data: comps }] = await Promise.all([
    supabase.from('bases_preco').select('*').order('tipo').order('nome'),
    supabase.from('modelos_orcamento').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('modelo_calibracoes').select('*').order('criado_em', { ascending: false }).limit(10),
    supabase.from('importacoes_base').select('*').order('criado_em', { ascending: false }).limit(5),
    supabase.from('composicoes').select('base_id').eq('ativo', true),
  ]);

  const resumo = Object.entries(
    (comps ?? []).reduce((m: any, c: any) => { m[c.base_id] = (m[c.base_id] ?? 0) + 1; return m; }, {})
  ).map(([base_id, qtd]) => ({ base_id, qtd }));

  return (
    <BaseClient bases={bases ?? []} modelos={modelos ?? []}
      calibracoes={calib ?? []} importacoes={imp ?? []} resumo={resumo} />
  );
}
