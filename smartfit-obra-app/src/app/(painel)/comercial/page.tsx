import ComercialClient from '@/components/ComercialClient';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Comercial() {
  const supabase = supabaseServer();
  const { data: ops } = await supabase.from('oportunidades').select('*').order('atualizado_em', { ascending: false });
  const lista = ops ?? [];
  return (
    <ComercialClient
      iniciais={lista.filter(o => !['assinada', 'perdida'].includes(o.estagio))}
      ganhas={lista.filter(o => o.estagio === 'assinada')}
      perdidas={lista.filter(o => o.estagio === 'perdida')}
    />
  );
}
