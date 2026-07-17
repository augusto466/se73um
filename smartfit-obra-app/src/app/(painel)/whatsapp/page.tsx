import WhatsappClient from '@/components/WhatsappClient';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Whatsapp() {
  const supabase = supabaseServer();

  // A inbox abre na lista de conversas, não nas mensagens soltas: o resumo
  // vem materializado em wa_contatos, então isto é uma leitura barata mesmo
  // com 20 mil mensagens no banco.
  const [{ data: inst }, { data: contatos }, { data: colabs }] = await Promise.all([
    supabase.from('wa_instancias').select('*').order('id').limit(1).maybeSingle(),
    supabase.from('wa_contatos').select('*')
      .order('ultima_em', { ascending: false, nullsFirst: false }).limit(200),
    supabase.from('colaboradores').select('id, nome').eq('ativo', true).order('nome'),
  ]);

  return (
    <WhatsappClient
      instancia={inst}
      contatos={contatos ?? []}
      colaboradores={colabs ?? []}
    />
  );
}