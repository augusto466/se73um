import { supabaseServer } from '@/lib/supabase/server';
import MetasClient from '@/components/MetasClient';
import { perfilAtual } from '@/lib/obra';

export const dynamic = 'force-dynamic';

/** Calcula o realizado das metas automáticas a partir dos dados do sistema. */
async function calcular(supabase: any, metas: any[]) {
  const hoje = new Date().toISOString().slice(0, 10);
  const out: any[] = [];
  for (const m of metas) {
    let realizado = Number(m.realizado ?? 0);
    if (m.fonte === 'automatica') {
      if (m.chave_automatica === 'avanco_obra' && m.obra_id) {
        const [{ data: obra }, { data: evs }] = await Promise.all([
          supabase.from('obras').select('valor_global').eq('id', m.obra_id).single(),
          supabase.from('eventos').select('valor_bruto, valor_glosa, status').eq('obra_id', m.obra_id),
        ]);
        const medido = (evs ?? []).filter((e: any) => ['aprovado', 'glosado'].includes(e.status))
          .reduce((s: number, e: any) => s + Number(e.valor_bruto) - Number(e.valor_glosa || 0), 0);
        realizado = obra?.valor_global ? medido / Number(obra.valor_global) * 100 : 0;
      } else if (m.chave_automatica === 'rdos_mes' && m.obra_id) {
        const { count } = await supabase.from('diario').select('*', { count: 'exact', head: true })
          .eq('obra_id', m.obra_id).gte('data', m.periodo_inicio).lte('data', m.periodo_fim);
        realizado = count ?? 0;
      } else if (m.chave_automatica === 'margem_carteira') {
        const { data: dre } = await supabase.from('dre_obra').select('receita_medida, custo_apropriado');
        const rec = (dre ?? []).reduce((s: number, d: any) => s + Number(d.receita_medida || 0), 0);
        const cus = (dre ?? []).reduce((s: number, d: any) => s + Number(d.custo_apropriado || 0), 0);
        realizado = rec > 0 ? (rec - cus) / rec * 100 : 0;
      } else if (m.chave_automatica === 'rotinas_prazo') {
        const { data: ocs } = await supabase.from('rotina_ocorrencias')
          .select('status, vencimento, concluida_em')
          .gte('vencimento', m.periodo_inicio).lte('vencimento', m.periodo_fim);
        const conc = (ocs ?? []).filter((o: any) => o.status === 'concluida');
        const noPrazo = conc.filter((o: any) => o.concluida_em && o.concluida_em.slice(0, 10) <= o.vencimento).length;
        realizado = conc.length ? noPrazo / conc.length * 100 : 0;
      }
    }
    out.push({ ...m, realizado });
  }
  return out;
}

export default async function Metas() {
  const supabase = supabaseServer();
  const [perfil, { data: metas }, { data: obras }, { data: pessoas }] = await Promise.all([
    perfilAtual(),
    supabase.from('metas').select('*').order('periodo_fim'),
    supabase.from('obras').select('id, codigo'),
    supabase.from('profiles').select('id, nome, email'),
  ]);
  const calculadas = await calcular(supabase, metas ?? []);
  return <MetasClient metasIniciais={calculadas} obras={obras ?? []} pessoas={pessoas ?? []} papel={perfil?.papel ?? 'contratada'} />;
}
