import { supabaseServer } from '@/lib/supabase/server';
import { perfilAtual } from '@/lib/obra';
import DocumentosClient from '@/components/DocumentosClient';

export const dynamic = 'force-dynamic';

export default async function Documentos() {
  const supabase = supabaseServer();
  const [perfil, { data: docs }, { data: obras }] = await Promise.all([
    perfilAtual(),
    supabase.from('documentos').select('*').order('validade', { nullsFirst: false }),
    supabase.from('obras').select('id, codigo'),
  ]);
  return <DocumentosClient docsIniciais={docs ?? []} obras={obras ?? []} papel={perfil?.papel ?? 'contratada'} />;
}
