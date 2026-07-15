import { NextResponse } from 'next/server';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';

/**
 * Executa uma ação proposta pelo advisor DEPOIS que o usuário confirma no cartão.
 * Usa o cliente com a sessão do usuário: o RLS vale — a contratada não faz
 * aqui nada que não poderia fazer pela interface.
 */
export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { tool, input, conversa_id } = await req.json();
  if (!tool || !input) return NextResponse.json({ erro: 'Ação inválida.' }, { status: 400 });

  let resultado = '';
  try {
    if (tool === 'criar_tarefa') {
      const { error } = await supa.from('tarefas').insert({
        descricao: String(input.descricao).slice(0, 400),
        prazo: input.prazo || null,
        prioridade: ['alta', 'media', 'baixa'].includes(input.prioridade) ? input.prioridade : 'media',
        obra_id: input.obra_id ?? null,
        criado_por: user.id,
      });
      if (error) throw new Error(error.message);
      resultado = 'Tarefa criada no quadro.';

    } else if (tool === 'criar_rotina') {
      const { error } = await supa.from('rotinas').insert({
        titulo: String(input.titulo).slice(0, 200),
        detalhe: input.detalhe ? String(input.detalhe).slice(0, 500) : null,
        frequencia: input.frequencia,
        dia_semana: input.dia_semana ?? null,
        dia_mes: input.dia_mes ?? null,
        prioridade: ['alta', 'media', 'baixa'].includes(input.prioridade) ? input.prioridade : 'media',
        obra_id: input.obra_id ?? null,
        responsavel_id: user.id,
        criado_por: user.id,
      });
      if (error) throw new Error(error.message);
      resultado = 'Rotina criada. As ocorrências entram no Meu Dia conforme a frequência.';

    } else if (tool === 'registrar_decisao') {
      const { error } = await supa.from('advisor_decisoes').insert({
        usuario_id: user.id,
        obra_id: input.obra_id ?? null,
        titulo: String(input.titulo).slice(0, 250),
        detalhe: input.detalhe ? String(input.detalhe).slice(0, 1000) : null,
      });
      if (error) throw new Error(error.message);
      resultado = 'Decisão registrada. O advisor passa a respeitá-la como premissa.';

    } else {
      return NextResponse.json({ erro: 'Ferramenta desconhecida.' }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 400 });
  }

  // registra a execução na conversa, para o histórico ficar fiel
  if (conversa_id) {
    const admin = supabaseAdmin();
    const { data: dona } = await admin.from('advisor_conversas').select('usuario_id').eq('id', conversa_id).single();
    if (dona?.usuario_id === user.id) {
      await admin.from('advisor_mensagens').insert({
        conversa_id, role: 'assistant', content: `✓ ${resultado}`,
      });
    }
  }

  return NextResponse.json({ ok: true, resultado });
}
