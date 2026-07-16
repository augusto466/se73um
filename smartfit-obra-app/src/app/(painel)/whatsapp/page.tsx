import WhatsappClient from '@/components/WhatsappClient';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Whatsapp() {
  const supabase = supabaseServer();
  const [{ data: inst }, { data: contatos }, { data: colabs }, { data: msgs }] = await Promise.all([
    supabase.from('wa_instancias').select('*').order('id').limit(1).maybeSingle(),
    supabase.from('wa_contatos').select('*').order('criado_em', { ascending: false }).limit(50),
    supabase.from('colaboradores').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('wa_mensagens').select('*').order('criado_em', { ascending: false }).limit(40),
  ]);
  return (
    <WhatsappClient instancia={inst} contatos={contatos ?? []}
      colaboradores={colabs ?? []} mensagens={msgs ?? []} />
  );
}
