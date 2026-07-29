import { registrarAuditoria } from './auditoria';

// Extraído de MateriaisClient.tsx (decidir/registrarCompra) para ser
// reusado também pela Central de Decisões, sem duplicar a regra de
// negócio. Comportamento idêntico ao original: mesmos prompts, mesmo
// texto de erro, mesmo payload de update, mesma notificação.
//
// Cada função faz a mutação (+ auditoria + notificação) e devolve o que
// deve entrar no estado local de quem chamou — ou `null` se o usuário
// cancelou o prompt ou a RLS recusou (nesses casos o alert() já disparou).

export async function decidirPedido(
  supabase: any,
  obraId: number,
  pedido: { id: number },
  status: 'aprovado' | 'recusado',
  cotacaoId?: number
): Promise<Record<string, any> | null> {
  let motivo: string | null = null;
  if (status === 'recusado') {
    motivo = prompt('Motivo da recusa (comunicação formal — Cl. 17.1):');
    if (motivo === null) return null;
  } else {
    motivo = prompt('Observação da aprovação (opcional — ex.: critério menor preço × prazo):') ?? null;
  }
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('pedidos_materiais').update({
    status, cotacao_vencedora: status === 'aprovado' ? cotacaoId : null,
    motivo_decisao: motivo, decidido_por: user?.id, decidido_em: new Date().toISOString(),
  }).eq('id', pedido.id);
  if (error) { alert('Decisão exclusiva do perfil Contratante.'); return null; }
  await registrarAuditoria(supabase, {
    obraId, entidade: 'pedidos_materiais', entidadeId: pedido.id,
    acao: 'pedido_' + status, detalhe: { cotacao_vencedora: cotacaoId, motivo },
  });
  fetch('/api/notificar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo: 'pedido_decidido', pedidoId: pedido.id, obraId }) }).catch(() => {});
  return { status, cotacao_vencedora: cotacaoId ?? null, motivo_decisao: motivo };
}

export async function registrarCompraPedido(
  supabase: any,
  obraId: number,
  pedido: { id: number }
): Promise<Record<string, any> | null> {
  const pc = prompt('Nº do pedido de compra junto ao fornecedor:'); if (pc === null) return null;
  const nf = prompt('Nº da NF (se já emitida — Cl. 3.4.3: faturamento conforme cronograma e medições):') ?? '';
  const compra_info = { pedido_compra: pc, nf, data: new Date().toISOString().slice(0, 10) };
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('pedidos_materiais').update({
    status: 'comprado', compra_info, decidido_por: user?.id, decidido_em: new Date().toISOString(),
  }).eq('id', pedido.id);
  if (error) { alert('Ação exclusiva do perfil Contratante.'); return null; }
  await registrarAuditoria(supabase, {
    obraId, entidade: 'pedidos_materiais', entidadeId: pedido.id,
    acao: 'compra_efetuada', detalhe: compra_info,
  });
  fetch('/api/notificar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo: 'pedido_decidido', pedidoId: pedido.id, obraId }) }).catch(() => {});
  return { status: 'comprado', compra_info };
}
