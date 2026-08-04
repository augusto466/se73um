import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { perfilAtual } from '@/lib/obra';
import ConciliacaoClient from '@/components/ConciliacaoClient';

export const dynamic = 'force-dynamic';

export default async function Conciliacao() {
  const perfil = await perfilAtual();
  if (!perfil || perfil.papel !== 'admin') redirect('/meu-dia');

  const supabase = supabaseServer();
  const [{ data: lancamentos }, { data: obras }, { data: extratos }] = await Promise.all([
    supabase.from('lancamentos').select('*').in('status', ['previsto', 'confirmado']).order('vencimento'),
    supabase.from('obras').select('id, codigo, nome').order('codigo'),
    supabase.from('extrato_importado').select('*').order('importado_em', { ascending: false }),
  ]);
  const extratoIds = (extratos ?? []).map((e: any) => e.id);
  const { data: linhas } = extratoIds.length
    ? await supabase.from('extrato_linha').select('*').in('extrato_id', extratoIds).order('data', { ascending: false })
    : { data: [] as any[] };

  return (
    <ConciliacaoClient
      lancamentosIniciais={lancamentos ?? []}
      obras={obras ?? []}
      extratosIniciais={extratos ?? []}
      linhasIniciais={linhas ?? []}
    />
  );
}
