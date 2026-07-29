import { fmtBRL } from './contrato';
import { registrarAuditoria } from './auditoria';

// Extraído de EventosClient.tsx (mudarStatus/aprovarComGlosa) para ser
// reusado também pela Central de Decisões. Comportamento idêntico ao
// original: mesmo prompt de glosa, mesmo texto de erro, mesmo payload de
// update, mesma notificação. Serve tanto para validar medição (aprovado/
// glosado) quanto para as outras transições que EventosClient já usa
// (iniciar execução, submeter para validação, reabrir análise) — a função
// é genérica por status, igual já era dentro do componente.

export async function mudarStatusEvento(
  supabase: any,
  obra: { id: number },
  papel: string,
  ev: { id: string; status: string },
  novo: string,
  glosa = 0
): Promise<Record<string, any> | null> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('eventos')
    .update({ status: novo, valor_glosa: glosa, atualizado_por: user?.id, atualizado_em: new Date().toISOString() })
    .eq('id', ev.id).eq('obra_id', obra.id);
  if (error) { alert('Sem permissão para esta transição (perfil ' + papel + ').'); return null; }
  await registrarAuditoria(supabase, {
    obraId: obra.id, entidade: 'eventos', entidadeId: ev.id,
    acao: 'mudanca_status', detalhe: { de: ev.status, para: novo, glosa },
  });
  // dispara e-mail automático conforme o evento
  if (novo === 'validacao' || novo === 'aprovado' || novo === 'glosado') {
    fetch('/api/notificar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: novo === 'validacao' ? 'submetida' : 'decidida', eventoId: ev.id, obraId: obra.id }),
    }).catch(() => {});
  }
  return { status: novo, valor_glosa: glosa };
}

export async function aprovarComGlosa(
  supabase: any,
  obra: { id: number },
  papel: string,
  ev: { id: string; status: string; valor_bruto: number }
): Promise<Record<string, any> | null> {
  const v = prompt(`Valor da glosa para ${ev.id} (Cl. 3.3 — fundamentação técnica objetiva).\nValor da etapa: ${fmtBRL(Number(ev.valor_bruto))}`, '0');
  if (v === null) return null;
  const glosa = Number(v.replace(/\./g, '').replace(',', '.')) || 0;
  return mudarStatusEvento(supabase, obra, papel, ev, 'glosado', glosa);
}
