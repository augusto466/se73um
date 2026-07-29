// Trilha de auditoria compartilhada — antes duplicada dentro de
// MateriaisClient.tsx e EventosClient.tsx (uma função `audit` idêntica em
// cada um, só variando `entidade`).
export async function registrarAuditoria(
  supabase: any,
  params: { obraId: number; entidade: string; entidadeId: string | number; acao: string; detalhe: any }
) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('auditoria').insert({
    usuario: user?.id,
    acao: params.acao,
    entidade: params.entidade,
    entidade_id: String(params.entidadeId),
    detalhe: params.detalhe,
    obra_id: params.obraId,
  });
}
