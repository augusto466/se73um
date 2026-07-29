import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { perfilAtual } from '@/lib/obra';
import DecisoesClient from '@/components/DecisoesClient';

export const dynamic = 'force-dynamic';

export default async function Decisoes() {
  const supabase = supabaseServer();
  const perfil = await perfilAtual();
  if (!perfil || !['admin', 'contratante'].includes(perfil.papel)) redirect('/meu-dia');

  const [{ data: meuDia }, { data: pedidosEnviados }, { data: eventos }, { data: pedidosAprovados }, { data: obras }] = await Promise.all([
    supabase.from('meu_dia').select('*').in('tipo', ['medicao', 'pedido']),
    supabase.from('pedidos_materiais').select('*').eq('status', 'enviado').order('criado_em'),
    supabase.from('eventos').select('*').eq('status', 'validacao').order('atualizado_em'),
    supabase.from('pedidos_materiais').select('*').eq('status', 'aprovado').order('decidido_em'),
    supabase.from('obras').select('id, codigo, nome'),
  ]);

  const idsEnviados = (pedidosEnviados ?? []).map((p: any) => p.id);
  const { data: cotacoes } = idsEnviados.length
    ? await supabase.from('cotacoes').select('*').in('pedido_id', idsEnviados)
    : { data: [] as any[] };

  const idsAprovados = (pedidosAprovados ?? []).map((p: any) => p.id);
  const { data: decisoesCliente } = idsAprovados.length
    ? await supabase.from('pedido_decisao_cliente').select('*').in('pedido_id', idsAprovados)
    : { data: [] as any[] };

  // Vencimento/prioridade/situacao/valor vêm da view meu_dia (mesmo cálculo
  // do Meu Dia, incluindo o prazo real da Cl. 3.4.6 para medição) — não
  // reimplementamos essa lógica aqui.
  const meuDiaPedido = new Map((meuDia ?? []).filter((i: any) => i.tipo === 'pedido').map((i: any) => [i.id, i]));
  const meuDiaMedicao = new Map((meuDia ?? []).filter((i: any) => i.tipo === 'medicao').map((i: any) => [i.id, i]));

  const pedidos = (pedidosEnviados ?? []).map((p: any) => {
    const md = meuDiaPedido.get(String(p.id));
    return { ...p, vencimento: md?.vencimento ?? null, prioridade: md?.prioridade ?? null, situacao: md?.situacao ?? null };
  });
  const medicoes = (eventos ?? []).map((e: any) => {
    const md = meuDiaMedicao.get(`${e.obra_id}:${e.id}`);
    return { ...e, vencimento: md?.vencimento ?? null, prioridade: md?.prioridade ?? null, situacao: md?.situacao ?? null, valor: md?.valor ?? null };
  });

  return (
    <DecisoesClient
      pedidosIniciais={pedidos}
      cotacoesIniciais={cotacoes ?? []}
      medicoesIniciais={medicoes}
      pedidosAprovadosIniciais={pedidosAprovados ?? []}
      decisoesClienteIniciais={decisoesCliente ?? []}
      obras={obras ?? []}
      papel={perfil.papel}
    />
  );
}
