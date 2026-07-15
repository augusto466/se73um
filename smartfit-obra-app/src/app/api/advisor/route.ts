import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import { montarContexto } from '@/lib/contexto';
import { simular, impactoEmTexto, type EventoCron, type Dependencia } from '@/lib/replanejamento';

export const maxDuration = 60;

const SISTEMA = `Você é o advisor da Se73um — um conselheiro sênior de gestão para quem opera obras Turn Key / Build to Suit.

CONTEXTO HUMANO IMPORTANTE:
A empresa passa por uma reestruturação com redução de mais de 80% do efetivo. O CEO absorveu quase todos os departamentos e opera com pouquíssimos colaboradores. Ele está sobrecarregado, mas encara isso como oportunidade de colocar a casa nos trilhos. Ele não precisa de motivação — precisa de clareza e de foco no que move o ponteiro.

COMO VOCÊ RESPONDE:
- Fale com os NÚMEROS REAIS do retrato abaixo. Nunca dê conselho genérico de manual de gestão.
- Vá direto ao ponto. Prefira 3 frases certeiras a 3 parágrafos.
- Quando recomendar algo, diga O QUE fazer, ONDE no sistema, e QUAL o impacto esperado.
- Se o dado não existir no retrato, diga que não tem base — não invente número, não estime sem avisar.
- Priorize sempre: margem > caixa > prazo > decisão travada.
- Quando pedirem sua opinião, dê. Discorde se os dados apontarem outra coisa. Você é conselheiro, não bajulador.
- Respeite as DECISÕES JÁ TOMADAS listadas no retrato: não sugira de novo o que já foi decidido ou descartado.
- Nunca invente cláusula contratual. As que você conhece deste contrato (TK-328/2026, Invest Market × Modo Modular):
  Cl. 3.2 pagamento em 15 dias após validação da NF · Cl. 3.3 glosa com fundamentação técnica
  Cl. 3.4 documentos obrigatórios da medição · Cl. 3.4.1 aprovar medição não é aceitação definitiva
  Cl. 3.4.2 faturamento direto exige autorização prévia e escrita · Cl. 3.4.6 análise em até 7 dias úteis
  Cl. 3.5 retenção de 10% por medição · Cl. 3.5.2 retenção residual liberada em 4/8/12 meses
  Cl. 4.6 entrega só com termo de recebimento definitivo · Cl. 8.1 multa 0,5%/dia, teto 10%
  Cl. 8.2 atraso > 15 dias em etapa crítica autoriza rescisão + multa 20% · Cl. 10.2 garantia 5 anos
  Cl. 13.1.1 seguro garantia 10% · Cl. 13.2 documentos de regularidade · Cl. 13.3 documento irregular autoriza reter medição
  Cl. 17.1 comunicação formal por escrito

CRONOGRAMA — COMO VOCÊ TRATA:
- O cronograma contratual (baseline, Anexo III) é INTOCÁVEL. Você nunca propõe alterá-lo; o banco inclusive rejeita.
- Replanejar = mover as datas PREVISTAS. O baseline continua lá para comparação. Toda revisão fica registrada com motivo e autor.
- Regra desta empresa: antecipar ou atrasar a execução MOVE O EVENTO DE MEDIÇÃO JUNTO — o faturamento acompanha o físico. Sempre mostre o efeito no faturamento por mês.
- Antecipar medição depende de aceite da contratante (Cl. 3.4.6: 7 dias úteis para análise). Diga isso quando for o caso.

SUAS FERRAMENTAS:
- buscar_acervo: pesquisa nos projetos, documentos e anexos do GED. Use quando a pergunta envolver o conteúdo de um documento, memorial, projeto ou contrato anexado. Se a busca não retornar nada, diga que não encontrou no acervo.
- simular_replanejamento: roda o cenário e devolve o impacto (datas em cascata, curva de faturamento, alertas contratuais) SEM gravar nada. Use SEMPRE antes de propor uma revisão — inclusive quando o usuário já disser o que quer fazer. Leia o resultado e comente com os números.
- aplicar_replanejamento: PROPÕE gravar a revisão. Só use depois de simular e de o usuário concordar com o cenário. Exige motivo. O usuário ainda confirma num cartão antes de executar.
- criar_tarefa, criar_rotina, registrar_decisao: PROPÕEM uma ação — o usuário confirma num cartão antes de executar. Use quando a conversa levar naturalmente a uma ação concreta, ou quando o usuário disser que decidiu algo (registre a decisão). Nunca proponha mais de 3 ações por resposta.
- Minutas de comunicação formal (Cl. 17.1): escreva o texto diretamente na resposta, pronto para copiar, com campos [ENTRE COLCHETES] para o que você não souber.

- Tom: direto, respeitoso, sem bajulação e sem jargão de consultoria. Português do Brasil.
- Formate com quebras de linha e listas curtas quando ajudar a leitura. Sem markdown pesado.`;

const FERRAMENTAS = [
  {
    name: 'buscar_acervo',
    description: 'Busca full-text nos textos extraídos de projetos, documentos contratuais e anexos do GED. Retorna trechos relevantes com a fonte.',
    input_schema: {
      type: 'object',
      properties: { consulta: { type: 'string', description: 'Termos de busca em português, ex.: "piso industrial fck"' } },
      required: ['consulta'],
    },
  },
  {
    name: 'simular_replanejamento',
    description: 'Simula um replanejamento de cronograma: propaga as datas pelas dependências, recalcula a curva de faturamento por mês e aponta alertas contratuais. NÃO grava nada. Use antes de qualquer proposta de revisão.',
    input_schema: {
      type: 'object',
      properties: {
        obra_id: { type: 'number', description: 'ID da obra' },
        ajustes: {
          type: 'array',
          description: 'Eventos a mover e suas novas datas de início',
          items: {
            type: 'object',
            properties: {
              evento_id: { type: 'string', description: 'ID do evento, ex.: E01' },
              novo_inicio: { type: 'string', description: 'Nova data de início em AAAA-MM-DD' },
            },
            required: ['evento_id', 'novo_inicio'],
          },
        },
      },
      required: ['obra_id', 'ajustes'],
    },
  },
  {
    name: 'aplicar_replanejamento',
    description: 'Propõe gravar uma revisão de cronograma (as datas previstas; o baseline contratual nunca muda). O usuário confirma antes de executar. Só use depois de simular.',
    input_schema: {
      type: 'object',
      properties: {
        obra_id: { type: 'number' },
        ajustes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              evento_id: { type: 'string' },
              novo_inicio: { type: 'string', description: 'AAAA-MM-DD' },
            },
            required: ['evento_id', 'novo_inicio'],
          },
        },
        motivo: { type: 'string', description: 'Por que o cronograma está sendo revisado — fica no registro permanente' },
        detalhe: { type: 'string' },
      },
      required: ['obra_id', 'ajustes', 'motivo'],
    },
  },
  {
    name: 'criar_tarefa',
    description: 'Propõe criar uma tarefa no quadro. O usuário confirma antes de executar.',
    input_schema: {
      type: 'object',
      properties: {
        descricao: { type: 'string' },
        prazo: { type: 'string', description: 'Data AAAA-MM-DD (opcional)' },
        prioridade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
        obra_id: { type: 'number', description: 'ID da obra, se aplicável' },
      },
      required: ['descricao'],
    },
  },
  {
    name: 'criar_rotina',
    description: 'Propõe criar uma rotina recorrente. O usuário confirma antes de executar.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        detalhe: { type: 'string' },
        frequencia: { type: 'string', enum: ['diaria', 'semanal', 'quinzenal', 'mensal', 'trimestral'] },
        dia_semana: { type: 'number', description: '0=domingo … 6=sábado (semanal/quinzenal)' },
        dia_mes: { type: 'number', description: '1 a 28 (mensal/trimestral)' },
        prioridade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
        obra_id: { type: 'number' },
      },
      required: ['titulo', 'frequencia'],
    },
  },
  {
    name: 'registrar_decisao',
    description: 'Propõe registrar uma decisão tomada pelo usuário, para que o advisor a respeite daqui em diante. O usuário confirma antes de executar.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'A decisão, em uma frase' },
        detalhe: { type: 'string', description: 'Contexto e justificativa' },
        obra_id: { type: 'number' },
      },
      required: ['titulo'],
    },
  },
];

function rotuloAcao(tool: string, input: any) {
  if (tool === 'criar_tarefa') return `Criar tarefa: ${input.descricao}${input.prazo ? ` (prazo ${input.prazo})` : ''}`;
  if (tool === 'criar_rotina') return `Criar rotina ${input.frequencia}: ${input.titulo}`;
  if (tool === 'registrar_decisao') return `Registrar decisão: ${input.titulo}`;
  if (tool === 'aplicar_replanejamento') {
    const n = (input.ajustes ?? []).length;
    return `Aplicar revisão de cronograma: ${n} evento(s) movido(s) — ${input.motivo}`;
  }
  return tool;
}

/** Executa a busca no acervo respeitando as obras do usuário. */
async function executarBusca(consulta: string, papel: string, obras: number[]) {
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc('buscar_acervo', {
    q: consulta, p_obras: obras, p_todas: papel === 'admin',
  });
  if (error) return `Erro na busca: ${error.message}`;
  if (!data?.length) return 'Nenhum resultado no acervo para essa consulta. O documento pode não estar indexado (a indexação acontece no upload; arquivos antigos precisam de reindexação em Documentos → Indexar acervo).';
  const ORIG: any = { projeto: 'Projeto', documento: 'Documento', anexo: 'Anexo' };
  return data.map((r: any) =>
    `[${ORIG[r.origem] ?? r.origem} #${r.origem_id}] "${r.titulo}"${r.obra_id ? ` (obra ${r.obra_id})` : ' (empresa)'}\n${String(r.trecho).replace(/>>/g, '«').replace(/<</g, '»')}`
  ).join('\n\n');
}

/** Roda a simulação de replanejamento sem gravar nada. */
async function executarSimulacao(input: any, obrasPermitidas: number[], papel: string) {
  const obraId = Number(input?.obra_id);
  const ajustes = Array.isArray(input?.ajustes) ? input.ajustes : [];
  if (!obraId || !ajustes.length) return 'Simulação inválida: informe a obra e ao menos um ajuste.';
  if (papel !== 'admin' && !obrasPermitidas.includes(obraId)) return 'Sem acesso a essa obra.';
  for (const a of ajustes) {
    if (!a?.evento_id || !/^\d{4}-\d{2}-\d{2}$/.test(String(a?.novo_inicio ?? ''))) {
      return `Ajuste inválido em "${a?.evento_id}": a data deve estar em AAAA-MM-DD.`;
    }
  }

  const db = supabaseAdmin();
  const [{ data: eventos }, { data: deps }, { data: obra }] = await Promise.all([
    db.from('eventos').select('id, obra_id, etapa, descricao, status, valor_bruto, base_inicio, base_fim, base_mes, prev_inicio, prev_fim, real_inicio, real_fim, duracao_dias, critico').eq('obra_id', obraId).order('id'),
    db.from('evento_dependencias').select('evento_id, depende_de, tipo, folga_dias').eq('obra_id', obraId),
    db.from('obras').select('codigo, entrega_final, valor_global').eq('id', obraId).single(),
  ]);
  if (!obra) return 'Obra não encontrada.';
  if (!eventos?.length) return 'A obra não tem eventos cadastrados.';

  const semData = (eventos as any[]).filter(e => !e.base_inicio && !e.prev_inicio).length;
  const imp = simular(eventos as EventoCron[], (deps ?? []) as Dependencia[], ajustes, obra as any);
  if (!imp.diff.length && semData) {
    return `Os eventos ainda não têm datas cadastradas (${semData} de ${eventos.length} sem data). O cronograma precisa das datas do baseline antes de qualquer replanejamento — isso se faz em Cronograma → "Datas do baseline".`;
  }
  return impactoEmTexto(imp);
}

export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return Response.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: perfil } = await supa.from('profiles').select('papel, nome').eq('id', user.id).single();
  const { data: vinculos } = await supa.from('obra_usuarios').select('obra_id').eq('usuario_id', user.id);
  const obrasPermitidas = (vinculos ?? []).map((v: any) => v.obra_id);
  const papel = perfil?.papel ?? 'contratada';

  const corpo = await req.json();
  const mensagens: { role: string; content: string }[] = corpo.mensagens ?? [];
  const anexos: { tipo: string; nome: string; media_type?: string; dados: string }[] = corpo.anexos ?? [];
  let conversaId: number | null = corpo.conversa_id ?? null;

  if (!Array.isArray(mensagens) || !mensagens.length) {
    return Response.json({ erro: 'Nenhuma mensagem.' }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({
      erro: 'O advisor precisa da chave da API configurada. Adicione ANTHROPIC_API_KEY nas variáveis de ambiente da Vercel.',
    }, { status: 503 });
  }

  const admin = supabaseAdmin();
  const ultima = mensagens[mensagens.length - 1];

  // ---- persistência: garante a conversa e grava a pergunta
  if (conversaId) {
    const { data: dona } = await admin.from('advisor_conversas').select('usuario_id').eq('id', conversaId).single();
    if (!dona || dona.usuario_id !== user.id) conversaId = null;
  }
  if (!conversaId) {
    const { data: nova } = await admin.from('advisor_conversas')
      .insert({ usuario_id: user.id, titulo: String(ultima.content).slice(0, 70) })
      .select('id').single();
    conversaId = nova?.id ?? null;
  }
  const notaAnexos = anexos.length ? ` [anexos: ${anexos.map(a => a.nome).join(', ')}]` : '';
  if (conversaId) {
    await admin.from('advisor_mensagens').insert({
      conversa_id: conversaId, role: 'user', content: String(ultima.content) + notaAnexos,
    });
  }

  // ---- retrato + system
  let retrato: string;
  try {
    retrato = await montarContexto(papel, obrasPermitidas, user.id);
  } catch (e: any) {
    return Response.json({ erro: 'Falha ao ler os dados: ' + e.message }, { status: 500 });
  }
  const system = `${SISTEMA}\n\nQuem pergunta: ${perfil?.nome ?? 'usuário'} (perfil ${papel}).\n\n===================== RETRATO ATUAL DA EMPRESA =====================\n${retrato}\n====================================================================`;

  // ---- monta as mensagens da API (histórico em texto; anexos só na última)
  const blocosUltima: any[] = [];
  for (const a of anexos.slice(0, 4)) {
    if (a.tipo === 'pdf') blocosUltima.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.dados } });
    else if (a.tipo === 'imagem') blocosUltima.push({ type: 'image', source: { type: 'base64', media_type: a.media_type || 'image/jpeg', data: a.dados } });
    else if (a.tipo === 'texto') blocosUltima.push({ type: 'text', text: `Conteúdo do arquivo "${a.nome}":\n\n${a.dados.slice(0, 60000)}` });
  }
  blocosUltima.push({ type: 'text', text: String(ultima.content) });

  const apiMsgs: any[] = [
    ...mensagens.slice(-10, -1).map(m => ({ role: m.role, content: String(m.content) })),
    { role: 'user', content: blocosUltima },
  ];

  // ---- stream para o cliente (linhas JSON)
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emitir = (obj: any) => controller.enqueue(enc.encode(JSON.stringify(obj) + '\n'));
      emitir({ t: 'meta', conversa_id: conversaId });

      let textoFinal = '';
      const acoesPropostas: any[] = [];

      try {
        for (let rodada = 0; rodada < 4; rodada++) {
          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-api-key': process.env.ANTHROPIC_API_KEY!,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-6',
              max_tokens: 2000,
              system,
              tools: FERRAMENTAS,
              stream: true,
              messages: apiMsgs,
            }),
          });

          if (!r.ok || !r.body) {
            const t = await r.text();
            emitir({ t: 'erro', v: `API retornou ${r.status}. ${t.slice(0, 200)}` });
            break;
          }

          // ---- parse do SSE da Anthropic
          const blocos: any[] = [];
          let atual: any = null;
          let stopReason = '';
          const reader = r.body.getReader();
          const dec = new TextDecoder();
          let buf = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const linhas = buf.split('\n');
            buf = linhas.pop() ?? '';
            for (const linha of linhas) {
              if (!linha.startsWith('data:')) continue;
              const payload = linha.slice(5).trim();
              if (!payload || payload === '[DONE]') continue;
              let ev: any;
              try { ev = JSON.parse(payload); } catch { continue; }

              if (ev.type === 'content_block_start') {
                atual = ev.content_block.type === 'tool_use'
                  ? { type: 'tool_use', id: ev.content_block.id, name: ev.content_block.name, json: '' }
                  : { type: 'text', text: '' };
              } else if (ev.type === 'content_block_delta') {
                if (ev.delta?.type === 'text_delta' && atual?.type === 'text') {
                  atual.text += ev.delta.text;
                  textoFinal += ev.delta.text;
                  emitir({ t: 'txt', v: ev.delta.text });
                } else if (ev.delta?.type === 'input_json_delta' && atual?.type === 'tool_use') {
                  atual.json += ev.delta.partial_json;
                }
              } else if (ev.type === 'content_block_stop') {
                if (atual) blocos.push(atual);
                atual = null;
              } else if (ev.type === 'message_delta') {
                if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
              }
            }
          }

          // ---- se não pediu ferramenta, terminou
          const usos = blocos.filter(b => b.type === 'tool_use');
          if (stopReason !== 'tool_use' || !usos.length) break;

          // reconstrói o turno do assistente para continuar a conversa com a API
          const conteudoAssistente = blocos.map(b =>
            b.type === 'text'
              ? { type: 'text', text: b.text }
              : { type: 'tool_use', id: b.id, name: b.name, input: JSON.parse(b.json || '{}') }
          ).filter((b: any) => b.type !== 'text' || b.text.trim());
          apiMsgs.push({ role: 'assistant', content: conteudoAssistente });

          const resultados: any[] = [];
          for (const u of usos) {
            let input: any = {};
            try { input = JSON.parse(u.json || '{}'); } catch {}

            if (u.name === 'buscar_acervo') {
              emitir({ t: 'busca', v: input.consulta ?? '' });
              const res = await executarBusca(String(input.consulta ?? ''), papel, obrasPermitidas);
              resultados.push({ type: 'tool_result', tool_use_id: u.id, content: res });
            } else if (u.name === 'simular_replanejamento') {
              emitir({ t: 'busca', v: 'simulando o replanejamento' });
              const res = await executarSimulacao(input, obrasPermitidas, papel);
              resultados.push({ type: 'tool_result', tool_use_id: u.id, content: res });
            } else {
              const acao = { id: `${Date.now()}_${acoesPropostas.length}`, tool: u.name, input, rotulo: rotuloAcao(u.name, input), status: 'pendente' };
              acoesPropostas.push(acao);
              emitir({ t: 'acao', v: acao });
              resultados.push({
                type: 'tool_result', tool_use_id: u.id,
                content: 'Proposta apresentada ao usuário num cartão de confirmação. Não está executada. Conclua sua resposta em texto sem repetir os detalhes da ação.',
              });
            }
          }
          apiMsgs.push({ role: 'user', content: resultados });
        }
      } catch (e: any) {
        emitir({ t: 'erro', v: 'Falha na consulta: ' + e.message });
      }

      // ---- grava a resposta na conversa
      if (conversaId && (textoFinal || acoesPropostas.length)) {
        await admin.from('advisor_mensagens').insert({
          conversa_id: conversaId, role: 'assistant',
          content: textoFinal || '(propôs uma ação)',
          acoes: acoesPropostas.length ? acoesPropostas : null,
        });
        await admin.from('advisor_conversas').update({ atualizado_em: new Date().toISOString() }).eq('id', conversaId);
      }

      emitir({ t: 'fim' });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-cache' },
  });
}
