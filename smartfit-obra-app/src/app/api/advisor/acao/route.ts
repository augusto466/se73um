import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import { COOKIE_OBRA } from '@/lib/obra';

/**
 * Resolve a obra da ação. O advisor pode errar o ID (ou não informar):
 * a fonte de verdade é o banco, não o palpite do modelo.
 * - ID informado e acessível → usa
 * - ID informado mas inexistente → erro claro, não FK violation
 * - nada informado → obra ativa do cookie, se houver
 */
async function resolverObra(supa: any, obraId: any): Promise<number | null> {
  if (obraId !== null && obraId !== undefined && obraId !== '') {
    const { data } = await supa.from('obras').select('id, codigo').eq('id', Number(obraId)).maybeSingle();
    if (data) return data.id;
    const { data: todas } = await supa.from('obras').select('id, codigo').order('codigo');
    const lista = (todas ?? []).map((o: any) => `${o.codigo} = ${o.id}`).join(', ');
    throw new Error(`A obra ${obraId} não existe ou você não tem acesso.${lista ? ` Obras disponíveis: ${lista}.` : ''}`);
  }
  const doCookie = cookies().get(COOKIE_OBRA)?.value;
  if (doCookie) {
    const { data } = await supa.from('obras').select('id').eq('id', Number(doCookie)).maybeSingle();
    if (data) return data.id;
  }
  return null;
}

/** Valida o colaborador e devolve o nome — mesma lógica: o banco decide. */
async function resolverColaborador(supa: any, colabId: any) {
  if (!colabId) return { id: null, nome: null };
  const { data } = await supa.from('colaboradores').select('id, nome').eq('id', Number(colabId)).maybeSingle();
  if (!data) throw new Error(`O colaborador ${colabId} não existe. Cadastre em Operação → Equipe de Campo, ou peça ao advisor para buscar a pessoa antes.`);
  return { id: data.id, nome: data.nome };
}

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
      const obraId = await resolverObra(supa, input.obra_id);
      const colab = await resolverColaborador(supa, input.colaborador_id);
      const responsavel = colab.nome ?? input.responsavel ?? null;

      // evento só existe no contexto de uma obra
      let eventoId: string | null = null;
      if (input.evento_id && obraId) {
        const { data: ev } = await supa.from('eventos').select('id').eq('obra_id', obraId).eq('id', input.evento_id).maybeSingle();
        eventoId = ev?.id ?? null;
      }

      const { error } = await supa.from('tarefas').insert({
        descricao: String(input.descricao).slice(0, 400),
        colaborador_id: colab.id,
        responsavel,
        prazo: input.prazo || null,
        prioridade: ['alta', 'media', 'baixa'].includes(input.prioridade) ? input.prioridade : 'media',
        centro_id: input.centro_id ?? (obraId ? 'cc_operacoes' : null),
        obra_id: obraId,
        evento_id: eventoId,
        coluna: 0,
        via_agente: true,
        criado_por: user.id,
      });
      if (error) throw new Error(error.message);
      resultado = `Tarefa criada em "A fazer"${responsavel ? ` para ${responsavel}` : ''}.`;

    } else if (tool === 'cadastrar_colaborador') {
      const { data: novo, error } = await supa.from('colaboradores').insert({
        nome: String(input.nome).slice(0, 150),
        funcao: input.funcao ? String(input.funcao).slice(0, 100) : null,
        vinculo: ['proprio', 'terceirizado', 'fornecedor', 'autonomo'].includes(input.vinculo) ? input.vinculo : 'proprio',
        empresa: input.empresa ? String(input.empresa).slice(0, 150) : null,
        centro_id: input.centro_id ?? null,
        email: input.email ?? null,
        telefone: input.telefone ?? null,
        criado_por: user.id,
      }).select('id, nome').single();
      if (error) throw new Error(error.message);
      const obraColab = await resolverObra(supa, input.obra_id);
      if (obraColab) {
        await supa.from('colaborador_obras').insert({ colaborador_id: novo.id, obra_id: obraColab });
      }
      resultado = `${novo.nome} cadastrado (id ${novo.id}). Já dá para atribuir tarefas.`;

    } else if (tool === 'aprovar_pedido') {
      const pid = Number(input.pedido_id);
      const { data: p } = await supa.from('pedidos_materiais').select('*').eq('id', pid).maybeSingle();
      if (!p) throw new Error(`Pedido PM-${String(pid).padStart(3, '0')} não encontrado ou sem acesso.`);
      if (p.status !== 'enviado') throw new Error(`PM-${String(pid).padStart(3, '0')} está como "${p.status}" — não dá para aprovar.`);
      if (!p.cotacao_vencedora) throw new Error('O pedido não tem cotação vencedora definida. Escolha a cotação na tela de Materiais.');

      const { error } = await supa.from('pedidos_materiais').update({
        status: 'aprovado',
        motivo_decisao: input.justificativa ? String(input.justificativa).slice(0, 500) : 'Aprovado via advisor, com confirmação do usuário.',
        decidido_por: user.id,
        decidido_em: new Date().toISOString(),
      }).eq('id', pid);
      if (error) throw new Error(error.message);

      // trilha de auditoria: fica registrado que veio por comando de chat
      await supa.from('auditoria').insert({
        usuario: user.id, obra_id: p.obra_id,
        acao: 'pedido_aprovado', entidade: 'pedidos_materiais', entidade_id: String(pid),
        detalhe: { cotacao_vencedora: p.cotacao_vencedora, motivo: input.justificativa ?? null, via: 'advisor' },
        via_agente: true,
      });

      const { data: cot } = await supa.from('cotacoes').select('fornecedor, valor_total').eq('id', p.cotacao_vencedora).maybeSingle();
      resultado = `PM-${String(pid).padStart(3, '0')} aprovado${cot ? ` — ${cot.fornecedor}, ${Number(cot.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}. O contas a pagar é gerado automaticamente.`;

    } else if (tool === 'criar_rotina') {
      const { error } = await supa.from('rotinas').insert({
        centro_id: input.centro_id ?? null,
        via_agente: true,
        titulo: String(input.titulo).slice(0, 200),
        detalhe: input.detalhe ? String(input.detalhe).slice(0, 500) : null,
        frequencia: input.frequencia,
        dia_semana: input.dia_semana ?? null,
        dia_mes: input.dia_mes ?? null,
        prioridade: ['alta', 'media', 'baixa'].includes(input.prioridade) ? input.prioridade : 'media',
        obra_id: await resolverObra(supa, input.obra_id),
        responsavel_id: user.id,
        criado_por: user.id,
      });
      if (error) throw new Error(error.message);
      resultado = 'Rotina criada. As ocorrências entram no Meu Dia conforme a frequência.';

    } else if (tool === 'registrar_decisao') {
      const { error } = await supa.from('advisor_decisoes').insert({
        usuario_id: user.id,
        obra_id: await resolverObra(supa, input.obra_id),
        titulo: String(input.titulo).slice(0, 250),
        detalhe: input.detalhe ? String(input.detalhe).slice(0, 1000) : null,
      });
      if (error) throw new Error(error.message);
      resultado = 'Decisão registrada. O advisor passa a respeitá-la como premissa.';

    } else if (tool === 'aplicar_replanejamento') {
      // reusa a rota de replanejamento: mesma validação, mesmo registro de revisão
      const r = await fetch(new URL('/api/replanejamento', req.url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
        body: JSON.stringify({
          obra_id: input.obra_id, ajustes: input.ajustes,
          motivo: input.motivo, detalhe: input.detalhe,
          aplicar: true, origem: 'advisor',
        }),
      });
      const j = await r.json();
      if (j.erro) throw new Error(j.erro);
      const dias = j.impacto?.dias_entrega ?? 0;
      resultado = `Revisão R${String(j.revisao?.numero ?? 0).padStart(2, '0')} registrada: ${j.impacto?.diff?.length ?? 0} evento(s) replanejado(s). `
        + `Conclusão projetada ${dias === 0 ? 'sem alteração' : (dias > 0 ? `+${dias} dia(s)` : `${dias} dia(s)`)} frente ao baseline. O cronograma contratual segue intacto.`;

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
