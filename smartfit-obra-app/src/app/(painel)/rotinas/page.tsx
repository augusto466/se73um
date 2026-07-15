import { supabaseServer } from '@/lib/supabase/server';
import RotinasClient from '@/components/RotinasClient';
import { perfilAtual } from '@/lib/obra';

export const dynamic = 'force-dynamic';

export default async function Rotinas() {
  const supabase = supabaseServer();
  const [perfil, { data: rotinas }, { data: ocorrencias }, { data: obras }, { data: pessoas }] = await Promise.all([
    perfilAtual(),
    supabase.from('rotinas').select('*').order('titulo'),
    supabase.from('rotina_ocorrencias').select('*').gte('vencimento', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)),
    supabase.from('obras').select('id, codigo'),
    supabase.from('profiles').select('id, nome, email'),
  ]);
  return (
    <RotinasClient
      rotinasIniciais={rotinas ?? []}
      ocorrencias={ocorrencias ?? []}
      obras={obras ?? []}
      pessoas={pessoas ?? []}
      papel={perfil?.papel ?? 'contratada'}
    />
  );
}
