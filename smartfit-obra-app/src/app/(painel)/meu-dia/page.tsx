import { supabaseServer } from '@/lib/supabase/server';
import MeuDiaClient from '@/components/MeuDiaClient';

export const dynamic = 'force-dynamic';

export default async function MeuDia() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const hoje = new Date().toISOString().slice(0, 10);
  const [{ data: perfil }, { data: itens }, { data: obras }, { data: briefing }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase.from('meu_dia').select('*'),
    supabase.from('obras').select('id, codigo, nome'),
    supabase.from('advisor_briefings').select('id, data, conteudo, lido').eq('usuario_id', user!.id).eq('data', hoje).maybeSingle(),
  ]);
  return <MeuDiaClient itens={itens ?? []} obras={obras ?? []} perfil={perfil} briefing={briefing ?? null} />;
}
