import { supabaseServer } from '@/lib/supabase/server';
import RelatoriosClienteView from '@/components/RelatoriosClienteView';

export const dynamic = 'force-dynamic';

export default async function RelatoriosCliente() {
  const supabase = supabaseServer();

  // A RLS ja garante que o cliente so enxerga documento com visivel_cliente=true
  // e da obra vinculada a ele. O select nao precisa repetir o filtro — mas a
  // clareza de intencao fica no eq abaixo mesmo assim.
  const { data: docs } = await supabase
    .from('documentos')
    .select('id, tipo, titulo, emissor, numero, emissao, arquivo_path, arquivo_nome, arquivo_tamanho')
    .eq('visivel_cliente', true)
    .order('tipo')
    .order('emissao', { ascending: false, nullsFirst: false });

  return <RelatoriosClienteView docs={docs ?? []} />;
}
