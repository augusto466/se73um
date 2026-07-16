import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import { montarContexto } from '@/lib/contexto';
import { simular, impactoEmTexto, type EventoCron, type Dependencia } from '@/lib/replanejamento';
import { gerar as gerarOrcamento, compararComReal, type ModeloItem } from '@/lib/orcamento';
import { historico as sinapiHistorico, indicadores as sinapiIndicadores, explodir as sinapiExplodir, UF_PADRAO } from '@/lib/sinapi';
import { orcarGalpao } from '@/lib/orcamento-galpao';
import { consultar as consultarGerdau } from '@/lib/gerdau';
import { MODELO, outputConfig, cacheBreakpoint, montarSystem, logUso } from '@/lib/ia';

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

MARGEM — COMO SE MEDE (não erre isto):
- O orçamento tem CUSTO e PREÇO separados. O preço é o custo + BDI (~25%), e é o que foi para a proposta.
- Margem SEMPRE se mede contra o CUSTO: margem = valor_global − custo_orcado. Nunca subtraia preço de preço.
- Ao falar de margem, diga de qual você fala: margem de contrato (o que a proposta previa) ou margem projetada (com o custo já comprado).

COMERCIAL:
- O funil é: contato → premissas → orçamento → proposta → negociação → assinada.
- O orçamento sai de um modelo paramétrico: premissas (área, prazo, padrão) × índices extraídos de obras reais. Ele não substitui análise — tira do zero.
- Proposta ganha vira obra com o orçamento dentro, sem redigitação.
- Quando o usuário falar de uma obra nova ou de proposta, ofereça simular o orçamento antes de qualquer palpite de preço.
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

VOCÊ NÃO É SÓ CONSELHEIRO — VOCÊ CONSTRÓI:
- Quando o usuário pedir algo que vira trabalho no sistema, MONTE. Não descreva o que ele deveria fazer: proponha a coisa pronta.
- Decomponha pedidos compostos. "Pedir ao Cleiton para mobilizar a máquina, nivelar o terreno e aplicar brita" são tarefas encadeadas, com responsável, prazo, centro de custo e obra — proponha a sequência, não uma tarefa genérica.
- Resolva nomes antes de agir: use buscar_pessoa para achar o colaborador. Se não existir, proponha cadastrar. Se houver mais de um com o mesmo nome, PERGUNTE — nunca chute.
- Centro de custo é OBRIGATÓRIO em toda tarefa e rotina. É dimensão da EMPRESA (Operações, RH, Jurídico, Comercial...), não da obra. SEMPRE preencha centro_id com o que fizer mais sentido: trabalho de obra → cc_operacoes; compra/cotação → cc_suprimentos; FVS/segurança → cc_qualidade; projeto → cc_projetos; contrato/notificação → cc_juridico; folha/pessoas → cc_rh; cobrança/caixa → cc_financeiro. O usuário corrige na lista suspensa do cartão se você errar — então escolha o mais provável e siga, não pergunte.
- Você NÃO cadastra centro de custo. Os 13 existentes são estrutura fixa da empresa. Se nenhum servir, diga ao usuário e sugira o mais próximo.
- Preencha o que dá para inferir e diga o que inferiu. Não pergunte o que já está no retrato.

SUAS FERRAMENTAS:
- buscar_acervo: pesquisa nos projetos, documentos e anexos do GED. Use quando a pergunta envolver o conteúdo de um documento, memorial, projeto ou contrato anexado. Se a busca não retornar nada, diga que não encontrou no acervo.
- consultar_sinapi: preço, histórico de 12 meses de uma composição SINAPI, ou os indicadores econômicos (INCC, IPCA, IGP-M). Use quando perguntarem quanto um insumo/serviço subiu, ou para embasar reajuste contratual. Roda na hora.
- orcar_galpao: orça um galpão por ENGENHARIA — a estrutura sai das tabelas do manual Gerdau (perfil e peso reais para o vão/altura/vento), o fechamento sai da geometria com desconto de porta, e a fundação é calculada por Décourt-Quaresma (NBR 6122) a partir do perfil de solo. Sem sondagem, ele usa perfil típico de Goiânia e AVISA que o solo é presumido — repasse esse aviso ao usuário, é risco de proposta. Use SEMPRE que a obra for um galpão metálico e você tiver as dimensões. É muito melhor que o paramétrico: prefira este.
- simular_orcamento: orçamento paramétrico por índice médio (kg/m² de obra anterior). Use só quando não tiver as dimensões do galpão, ou quando a obra não for um galpão em pórtico (área de projeção, laje, prazo, padrão). Roda na hora, sem gravar. Devolve custo, BDI, preço, preço/m² e o comparativo com o custo real de obras já executadas. Use SEMPRE que o usuário perguntar quanto custa/quanto cobrar por uma obra — nunca chute preço de cabeça.
- simular_replanejamento: roda o cenário e devolve o impacto (datas em cascata, curva de faturamento, alertas contratuais) SEM gravar nada. Use SEMPRE antes de propor uma revisão — inclusive quando o usuário já disser o que quer fazer. Leia o resultado e comente com os números.
- aplicar_replanejamento: PROPÕE gravar a revisão. Só use depois de simular e de o usuário concordar com o cenário. Exige motivo. O usuário ainda confirma num cartão antes de executar.
- buscar_pessoa: encontra colaboradores pelo nome/função. Roda na hora, sem confirmação. Use SEMPRE antes de atribuir trabalho a alguém.
- criar_tarefa, criar_rotina, registrar_decisao, cadastrar_colaborador: PROPÕEM uma ação — o usuário confirma num cartão. Para uma sequência de trabalho, proponha as tarefas na ordem (máx. 6 por resposta).
- criar_obra: PROPÕE cadastrar uma obra nova. Use quando o usuário falar de um contrato/obra que ainda não existe no sistema. Peça os dados que faltarem antes de propor.
- aprovar_pedido: PROPÕE aprovar um pedido de compra. O cartão mostra o pedido inteiro (cotações, valores, prazos, impacto no orçado) para o usuário conferir antes de confirmar. Se não houver cotação vencedora definida, NÃO use — pergunte qual cotação ele escolhe.

O QUE VOCÊ NÃO FAZ, NUNCA:
- Aprovar ou validar MEDIÇÃO. É ato de análise técnica com consequência contratual (Cl. 3.4.1: aprovar não é aceitação definitiva; Cl. 3.4.6: 7 dias úteis de análise). Se pedirem, explique e mande para a tela de Cronograma/Validações.
- Enviar e-mail ou qualquer comunicação a terceiro. Você redige, o usuário envia.
- Alterar o baseline contratual do cronograma.
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
    name: 'buscar_pessoa',
    description: 'Busca colaboradores cadastrados por nome ou função. Executa na hora, sem confirmação. Use antes de atribuir trabalho a alguém.',
    input_schema: {
      type: 'object',
      properties: { termo: { type: 'string', description: 'Nome ou função, ex.: "Cleiton" ou "engenheiro"' } },
      required: ['termo'],
    },
  },
  {
    name: 'cadastrar_colaborador',
    description: 'Propõe cadastrar uma pessoa que executa trabalho mas não tem login no sistema. O usuário confirma.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string' },
        funcao: { type: 'string', description: 'Ex.: Engenheiro, Encarregado, Mestre de obras' },
        vinculo: { type: 'string', enum: ['proprio', 'terceirizado', 'fornecedor', 'autonomo'] },
        empresa: { type: 'string' },
        centro_id: { type: 'string', description: 'Centro de custo, ex.: cc_operacoes' },
        email: { type: 'string' },
        telefone: { type: 'string' },
        obra_id: { type: 'number', description: 'Vincula à obra, se aplicável' },
      },
      required: ['nome'],
    },
  },
  {
    name: 'criar_tarefa',
    description: 'Propõe criar uma tarefa no quadro, com responsável, prazo e centro de custo. O usuário confirma antes de executar.',
    input_schema: {
      type: 'object',
      properties: {
        descricao: { type: 'string' },
        colaborador_id: { type: 'number', description: 'ID do colaborador responsável (use buscar_pessoa antes)' },
        responsavel: { type: 'string', description: 'Nome do responsável, se não houver cadastro' },
        prazo: { type: 'string', description: 'Data AAAA-MM-DD' },
        prioridade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
        centro_id: { type: 'string', description: 'Centro de custo, ex.: cc_operacoes' },
        obra_id: { type: 'number', description: 'ID da obra, se for trabalho de obra' },
        evento_id: { type: 'string', description: 'Evento de medição vinculado, ex.: E03' },
      },
      required: ['descricao'],
    },
  },
  {
    name: 'orcar_galpao',
    description: 'Orça um galpão metálico por engenharia: manual Gerdau para a estrutura, geometria para fechamento/cobertura/piso, reações do pórtico para a fundação. Roda na hora, sem gravar. Prefira este ao simular_orcamento quando for galpão e houver dimensões.',
    input_schema: {
      type: 'object',
      properties: {
        vao: { type: 'number', description: 'Vão livre L em metros (15 a 50) — obrigatório' },
        comprimento: { type: 'number', description: 'Comprimento do galpão em metros — obrigatório' },
        altura: { type: 'number', description: 'Pé-direito H em metros (até 12) — obrigatório' },
        espacamento: { type: 'number', description: 'Entre pórticos: 6, 9 ou 12 m. Padrão 6' },
        v0: { type: 'number', description: 'Vento básico NBR 6123. Goiás = 30 m/s. Padrão 30' },
        fechamento: { type: 'string', enum: ['alvenaria_total', 'alvenaria_parcial', 'isopainel', 'tp40'] },
        altura_alvenaria: { type: 'number', description: 'Só para alvenaria_parcial: até que altura vai o bloco' },
        cobertura: { type: 'string', enum: ['tp40_branca', 'tp40_galvanizada', 'isotermica_pir'] },
        piso: { type: 'string', enum: ['industrial_20', 'industrial_25', 'industrial_30', 'polido', 'nenhum'] },
        area_laje: { type: 'number', description: 'Mezanino em steel deck, m²' },
        area_terreno: { type: 'number' },
        prazo_meses: { type: 'number' },
        perfil_tipico: { type: 'string', enum: ['goiania_residual', 'goiania_raso', 'goiania_profundo'], description: 'Perfil de solo presumido, quando não há sondagem. Padrão: goiania_residual' },
        tipo_estaca: { type: 'string', enum: ['helice_continua', 'escavada', 'raiz', 'pre_moldada'] },
        diametro_estaca_cm: { type: 'number', description: '30 a 80. Padrão 40' },
        portas: {
          type: 'array',
          description: 'A área delas é descontada do fechamento',
          items: {
            type: 'object',
            properties: {
              tipo: { type: 'string', enum: ['enrolar', 'seccional', 'pivotante', 'social'] },
              largura: { type: 'number' }, altura: { type: 'number' }, quantidade: { type: 'number' },
            },
            required: ['tipo', 'largura', 'altura', 'quantidade'],
          },
        },
      },
      required: ['vao', 'comprimento', 'altura'],
    },
  },
  {
    name: 'consultar_sinapi',
    description: 'Consulta a base SINAPI ao vivo: histórico de preço de uma composição (12 meses), a composição aberta até o insumo, ou indicadores econômicos (INCC, IPCA, IGP-M, SELIC). Executa na hora.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['historico', 'explodir', 'indicadores'], description: 'historico: evolução do preço · explodir: abre a composição por insumo · indicadores: INCC/IPCA' },
        codigo: { type: 'string', description: 'Código SINAPI da composição (para historico e explodir)' },
        uf: { type: 'string', description: 'Estado, padrão GO' },
        periodo: { type: 'string', description: 'Para histórico: 6m, 12m. Padrão 12m' },
      },
      required: ['tipo'],
    },
  },
  {
    name: 'simular_orcamento',
    description: 'Gera o orçamento de uma obra a partir das premissas, usando os modelos paramétricos calibrados com obras reais. Executa na hora, sem gravar nada. Use sempre que perguntarem preço/custo de obra nova.',
    input_schema: {
      type: 'object',
      properties: {
        area_projecao: { type: 'number', description: 'Área de projeção em m² — obrigatória, é o principal driver' },
        area_laje: { type: 'number', description: 'Área de laje/mezanino em m²' },
        pe_direito: { type: 'number' },
        prazo_meses: { type: 'number' },
        padrao_acabamento: { type: 'string', enum: ['simples', 'medio', 'alto'] },
        tipo_obra: { type: 'string', description: 'galpao_metalico (padrão), bts_academia' },
      },
      required: ['area_projecao'],
    },
  },
  {
    name: 'criar_obra',
    description: 'Propõe cadastrar uma obra nova no sistema. O usuário confirma. Use quando ele mencionar um contrato ou obra que ainda não existe.',
    input_schema: {
      type: 'object',
      properties: {
        codigo: { type: 'string', description: 'Código do contrato, ex.: TK-329/2026' },
        nome: { type: 'string', description: 'Nome da obra, ex.: BTS Smart Fit — Setor Bueno' },
        cliente: { type: 'string', description: 'Contratante' },
        contratada: { type: 'string', description: 'Construtora responsável' },
        local: { type: 'string' },
        valor_global: { type: 'number', description: 'Valor do contrato em reais' },
        retencao_pct: { type: 'number', description: 'Retenção por medição (0.10 = 10%)' },
        assinatura: { type: 'string', description: 'AAAA-MM-DD' },
        entrega_final: { type: 'string', description: 'AAAA-MM-DD' },
      },
      required: ['codigo', 'nome'],
    },
  },
  {
    name: 'aprovar_pedido',
    description: 'Propõe aprovar um pedido de compra. O cartão mostra as cotações e o impacto para o usuário conferir. Exige que o pedido tenha cotação vencedora definida.',
    input_schema: {
      type: 'object',
      properties: {
        pedido_id: { type: 'number', description: 'Número do pedido, ex.: 12 para PM-012' },
        justificativa: { type: 'string', description: 'Por que aprovar — fica no registro' },
      },
      required: ['pedido_id'],
    },
    // breakpoint na última ferramenta: todas entram no prefixo cacheado
    cache_control: cacheBreakpoint,
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
  if (tool === 'cadastrar_colaborador') return `Cadastrar ${input.nome}${input.funcao ? ` — ${input.funcao}` : ''}`;
  if (tool === 'criar_obra') return `Cadastrar obra ${input.codigo} — ${input.nome}`;
  if (tool === 'aprovar_pedido') return `Aprovar PM-${String(input.pedido_id).padStart(3, '0')}`;
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

/** Busca colaboradores por nome ou função — executa na hora, não precisa de confirmação. */
async function executarBuscaPessoa(termo: string) {
  const db = supabaseAdmin();
  const t = String(termo ?? '').trim();
  if (!t) return 'Informe um nome ou função para buscar.';
  const { data } = await db.from('colaboradores')
    .select('id, nome, funcao, empresa, vinculo, centro_id, email, telefone, ativo')
    .or(`nome.ilike.%${t}%,funcao.ilike.%${t}%`)
    .eq('ativo', true).limit(8);
  if (!data?.length) {
    return `Nenhum colaborador encontrado para "${t}". Se a pessoa ainda não está cadastrada, proponha cadastrar_colaborador antes de atribuir a tarefa.`;
  }
  return data.map((c: any) =>
    `id ${c.id}: ${c.nome}${c.funcao ? ` — ${c.funcao}` : ''} (${c.vinculo}${c.empresa ? `, ${c.empresa}` : ''})${c.centro_id ? ` · ${c.centro_id}` : ''}`
  ).join('\n') + (data.length > 1 ? '\n\nMais de um resultado: confirme com o usuário qual é a pessoa antes de atribuir.' : '');
}

/** Monta o detalhe do pedido para o cartão de aprovação — o usuário vê o que está aprovando. */
async function detalharPedido(pedidoId: number, obrasPermitidas: number[], papel: string) {
  const db = supabaseAdmin();
  const { data: p } = await db.from('pedidos_materiais').select('*').eq('id', pedidoId).maybeSingle();
  if (!p) return { erro: `Pedido PM-${String(pedidoId).padStart(3, '0')} não encontrado.` };
  if (papel !== 'admin' && !obrasPermitidas.includes(p.obra_id)) return { erro: 'Sem acesso a esse pedido.' };
  if (p.status !== 'enviado') return { erro: `PM-${String(pedidoId).padStart(3, '0')} está como "${p.status}" — só dá para aprovar pedido aguardando aprovação.` };
  if (!p.cotacao_vencedora) return { erro: `PM-${String(pedidoId).padStart(3, '0')} não tem cotação vencedora definida. Pergunte ao usuário qual cotação ele escolhe — não escolha por ele.` };

  const { data: cots } = await db.from('cotacoes').select('*').eq('pedido_id', pedidoId);
  const venc = (cots ?? []).find((c: any) => c.id === p.cotacao_vencedora);
  if (!venc) return { erro: 'A cotação vencedora do pedido não foi encontrada.' };

  let orcado: any = null;
  if (p.evento_id) {
    const { data: o } = await db.from('orcamento').select('etapa, custo_orcado, valor_orcado').eq('obra_id', p.obra_id).eq('evento_id', p.evento_id).maybeSingle();
    orcado = o;
  }
  return { pedido: p, cotacoes: cots ?? [], vencedora: venc, orcado };
}

/** Orça um galpão por engenharia (manual Gerdau + geometria). */
async function executarGalpao(input: any) {
  const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const db = supabaseAdmin();
  const { data: comps } = await db.from('composicoes')
    .select('codigo, base_id, descricao, custo_unitario, unidade').eq('ativo', true);

  const p: any = {
    vao: Number(input.vao), comprimento: Number(input.comprimento), altura: Number(input.altura),
    espacamento: Number(input.espacamento ?? 6), v0: Number(input.v0 ?? 30),
    fechamento: input.fechamento ?? 'isopainel',
    altura_alvenaria: input.altura_alvenaria,
    cobertura: input.cobertura ?? 'isotermica_pir',
    piso: input.piso ?? 'industrial_20',
    area_laje: input.area_laje, area_terreno: input.area_terreno,
    prazo_meses: input.prazo_meses, portas: input.portas ?? [],
  };

  const r: any = orcarGalpao(p, (comps ?? []) as any, { bdi_pct: 0.25 });
  if (r.erro) return `Não deu para orçar: ${r.erro}`;

  const L: string[] = [];
  L.push(`GALPÃO ${p.vao} × ${p.comprimento} m, pé-direito ${p.altura} m — ${r.geometria.areaProjecao} m² de projeção`);
  L.push(`\nESTRUTURA (manual Gerdau, estágio ${r.estrutura.estagio}):`);
  L.push(`  Viga ${r.estrutura.perfis.viga} | Coluna ${r.estrutura.perfis.coluna} | ${r.estrutura.n_porticos} pórticos`);
  L.push(`  Peso: ${r.estrutura.peso_total_kg.toLocaleString('pt-BR')} kg (${r.estrutura.taxa_kg_m2} kg/m²)`);
  L.push(`  Reações por base: Rv ${r.estrutura.reacoes.rv1} kN | Rh ${r.estrutura.reacoes.rh1} kN | Mx ${r.estrutura.reacoes.mx1} kN·m`);
  if (r.fundacao) {
    const fd = r.fundacao;
    L.push(`\nFUNDAÇÃO (Décourt-Quaresma, NBR 6122, FS 2,0):`);
    L.push(`  ${fd.estaca.tipo.replace('_',' ')} Ø${fd.estaca.diametro_cm} cm × ${fd.estaca.profundidade_m} m — ${fd.n_bases} bases × ${fd.estacas_por_base} = ${fd.metros_estaca} m`);
    L.push(`  Compressão ${fd.compressao_max_kn} kN | Tração ${fd.tracao_max_kn} kN | Capacidade ${fd.estaca.R_admissivel_kn} kN`);
    L.push(`  Condicionante: ${fd.condicionante}`);
    L.push(`  Solo: ${fd.solo_sondado ? 'sondagem informada' : 'PERFIL PRESUMIDO — não é a sondagem da obra'}`);
  }
  L.push(`\nGEOMETRIA: cobertura ${r.geometria.areaCobertura} m² | fachada ${r.geometria.areaFachadaBruta} m² − ${r.geometria.areaPortas} m² de portas = ${r.geometria.areaFachadaLiquida} m²`);
  L.push(`\nCUSTO: ${brl(r.custo_total)} | BDI ${r.bdi_efetivo.toFixed(1)}% | PREÇO: ${brl(r.preco_total)}`);
  L.push(`Custo/m²: ${brl(r.custo_m2)} | Preço/m²: ${brl(r.preco_m2)}`);
  L.push('\nPor etapa:');
  r.etapas.forEach((e: any) => L.push(`  ${e.etapa}: ${brl(e.preco)} (${e.pct}%)`));
  if (r.avisos.length) { L.push('\nAVISOS (leia e repasse ao usuário o que importar):'); r.avisos.forEach((a: string) => L.push(`  - ${a}`)); }
  L.push('\nIsto é PRÉ-DIMENSIONAMENTO. O manual Gerdau é explícito: projeto executivo exige profissional habilitado. Serve para orçar, não para construir.');
  return L.join('\n');
}

/** Consulta a base SINAPI ao vivo. */
async function executarSinapi(input: any) {
  const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  try {
    if (input.tipo === 'indicadores') {
      const d: any = await sinapiIndicadores();
      return `INCC (mês): ${d.incc}% | INCC acumulado 12m: ${d.incc_acumulado_12m}% | IPCA: ${d.ipca}% | SELIC: ${d.selic}% | dólar: ${d.dolar}\nFonte: ${d.fonte ?? 'Banco Central'}.\nO INCC acumulado é o índice usado em reajuste de contrato de obra.`;
    }

    if (!input.codigo) return 'Informe o código SINAPI da composição. Se não souber, pergunte ao usuário ou consulte a Base de Preços.';
    const uf = (input.uf ?? UF_PADRAO).toUpperCase();

    if (input.tipo === 'historico') {
      const h = await sinapiHistorico(input.codigo, uf, 'composicao', input.periodo ?? '12m');
      if (!h.serie.length) return `Sem histórico para ${input.codigo} em ${uf}.`;
      const p0 = h.serie[0].preco, pN = h.serie[h.serie.length - 1].preco;
      const varPct = p0 > 0 ? ((pN / p0 - 1) * 100).toFixed(1) : '0';
      const L = [`${h.nome} (${h.codigo}) — ${uf}`];
      h.serie.forEach((x: any) => L.push(`  ${x.data.slice(0, 7)}: ${brl(x.preco)}`));
      L.push(`\nVariação no período: ${varPct}% (${brl(p0)} → ${brl(pN)})`);
      return L.join('\n');
    }

    if (input.tipo === 'explodir') {
      const c = await sinapiExplodir(input.codigo, uf);
      const L = [`${c.descricao} (${c.codigo}) — ${c.unidade} — ${brl(c.valor_total)} em ${uf}`];
      L.push(`Mão de obra: ${brl(c.mao_de_obra)} (${c.valor_total > 0 ? Math.round(c.mao_de_obra / c.valor_total * 100) : 0}%)`);
      L.push('Insumos, do que mais pesa para o que menos pesa:');
      c.insumos.slice(0, 12).forEach((i: any) =>
        L.push(`  ${brl(i.valor_total)} · ${i.nome} (${i.quantidade} ${i.unidade} × ${brl(i.preco_unitario)}) [${i.tipo}]`));
      return L.join('\n');
    }

    return 'Tipo inválido.';
  } catch (e: any) {
    return `Falha na consulta ao SINAPI: ${e.message}`;
  }
}

/** Gera o orçamento paramétrico de uma obra nova — sem gravar nada. */
async function executarOrcamento(input: any) {
  const area = Number(input?.area_projecao);
  if (!area || area <= 0) return 'A área de projeção é obrigatória e é o principal driver do orçamento. Pergunte ao usuário.';

  const db = supabaseAdmin();
  const tipo = input.tipo_obra || 'galpao_metalico';
  const { data: modelo } = await db.from('modelos_orcamento')
    .select('id, nome, area_referencia').eq('tipo_obra', tipo).eq('ativo', true).limit(1).maybeSingle();
  if (!modelo) return `Não há modelo de orçamento para "${tipo}". Modelos existem em Comercial; sem modelo, não há como orçar — não invente preço.`;

  const { data: itens } = await db.from('modelo_itens').select('*').eq('modelo_id', modelo.id).order('ordem');
  if (!itens?.length) return 'O modelo não tem itens cadastrados.';

  const orc = gerarOrcamento(itens as ModeloItem[], {
    area_projecao: area,
    area_laje: input.area_laje ? Number(input.area_laje) : null,
    pe_direito: input.pe_direito ? Number(input.pe_direito) : null,
    prazo_meses: input.prazo_meses ? Number(input.prazo_meses) : null,
    padrao_acabamento: input.padrao_acabamento ?? 'medio',
  });

  const { data: real } = await db.from('desvio_etapa').select('etapa, custo_orcado, valor_comprado');
  const alertas = compararComReal(orc, (real ?? []) as any);

  const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const L: string[] = [];
  L.push(`Modelo: ${modelo.nome} (calibrado com obra de ${modelo.area_referencia} m²)`);
  L.push(`Premissas: ${area} m² de projeção${input.area_laje ? `, ${input.area_laje} m² de laje` : ''}${input.prazo_meses ? `, ${input.prazo_meses} meses` : ''}, padrão ${input.padrao_acabamento ?? 'medio'}`);
  L.push(`\nCUSTO: ${brl(orc.custo_total)} | BDI ${orc.bdi_efetivo.toFixed(1)}%: ${brl(orc.preco_total - orc.custo_total)} | PREÇO: ${brl(orc.preco_total)}`);
  L.push(`Custo/m²: ${brl(orc.custo_m2 ?? 0)} | Preço/m²: ${brl(orc.preco_m2 ?? 0)}`);
  L.push('\nPor etapa (preço):');
  orc.etapas.forEach(e => L.push(`  ${e.etapa}: ${brl(e.preco)} (${e.pct}%)`));
  if (orc.avisos.length) { L.push('\nAvisos:'); orc.avisos.forEach(a => L.push(`  - ${a}`)); }
  if (alertas.length) {
    L.push('\nHISTÓRICO DE OBRAS REAIS (use isto, é o que evita repetir erro):');
    alertas.forEach(a => L.push(`  - ${a.etapa}: ${a.nota}`));
  }
  L.push('\nEsta é uma estimativa paramétrica para balizar conversa. A proposta formal se monta em Comercial, onde dá para ajustar item a item.');
  return L.join('\n');
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
  // O que é estável fica no bloco cacheado; o retrato (dados vivos) fica fora.
  const system = montarSystem(
    SISTEMA,
    `Quem pergunta: ${perfil?.nome ?? 'usuário'} (perfil ${papel}).\n\n===================== RETRATO ATUAL DA EMPRESA =====================\n${retrato}\n====================================================================`
  );

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
              model: MODELO,
              // o raciocínio adaptativo do Sonnet 5 consome tokens de saída:
              // 2000 apertaria a resposta depois do bloco de pensamento
              max_tokens: 8000,
              output_config: outputConfig,
              system,
              tools: FERRAMENTAS,
              stream: true,
              messages: apiMsgs,
            }),
          });

          if (!r.ok || !r.body) {
            const t = await r.text();
            // 404 em modelo costuma ser nome errado: diz onde arrumar em vez de morrer calado
            const dica = r.status === 404 && t.includes('model')
              ? ` O modelo "${MODELO}" não foi aceito pela API. Ajuste a variável ADVISOR_MODELO na Vercel.`
              : '';
            emitir({ t: 'erro', v: `API retornou ${r.status}.${dica} ${t.slice(0, 200)}` });
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
                const tipo = ev.content_block?.type;
                if (tipo === 'tool_use') {
                  atual = { type: 'tool_use', id: ev.content_block.id, name: ev.content_block.name, json: '' };
                } else if (tipo === 'thinking' || tipo === 'redacted_thinking') {
                  // raciocínio adaptativo: não vai para a tela, mas precisa voltar
                  // intacto no turno do assistente quando há ferramenta na sequência
                  atual = { type: tipo, thinking: '', signature: '', data: ev.content_block?.data };
                } else {
                  atual = { type: 'text', text: '' };
                }
              } else if (ev.type === 'content_block_delta') {
                if (ev.delta?.type === 'thinking_delta' && atual?.type === 'thinking') {
                  atual.thinking += ev.delta.thinking ?? '';
                } else if (ev.delta?.type === 'signature_delta' && atual?.type === 'thinking') {
                  atual.signature += ev.delta.signature ?? '';
                } else if (ev.delta?.type === 'text_delta' && atual?.type === 'text') {
                  atual.text += ev.delta.text;
                  textoFinal += ev.delta.text;
                  emitir({ t: 'txt', v: ev.delta.text });
                } else if (ev.delta?.type === 'input_json_delta' && atual?.type === 'tool_use') {
                  atual.json += ev.delta.partial_json;
                }
              } else if (ev.type === 'content_block_stop') {
                if (atual) blocos.push(atual);
                atual = null;
              } else if (ev.type === 'message_start') {
                if (ev.message?.usage) logUso('chat', ev.message.usage);
              } else if (ev.type === 'message_delta') {
                if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
              }
            }
          }

          // ---- se não pediu ferramenta, terminou
          const usos = blocos.filter(b => b.type === 'tool_use');
          if (stopReason !== 'tool_use' || !usos.length) break;

          // reconstrói o turno do assistente para continuar a conversa com a API
          const conteudoAssistente = blocos.map(b => {
            if (b.type === 'text') return { type: 'text', text: b.text };
            if (b.type === 'thinking') return { type: 'thinking', thinking: b.thinking, signature: b.signature };
            if (b.type === 'redacted_thinking') return { type: 'redacted_thinking', data: b.data };
            return { type: 'tool_use', id: b.id, name: b.name, input: JSON.parse(b.json || '{}') };
          }).filter((b: any) => b.type !== 'text' || b.text.trim());
          apiMsgs.push({ role: 'assistant', content: conteudoAssistente });

          const resultados: any[] = [];
          for (const u of usos) {
            let input: any = {};
            try { input = JSON.parse(u.json || '{}'); } catch {}

            if (u.name === 'buscar_acervo') {
              emitir({ t: 'busca', v: input.consulta ?? '' });
              const res = await executarBusca(String(input.consulta ?? ''), papel, obrasPermitidas);
              resultados.push({ type: 'tool_result', tool_use_id: u.id, content: res });
            } else if (u.name === 'buscar_pessoa') {
              emitir({ t: 'busca', v: `procurando "${input.termo ?? ''}"` });
              const res = await executarBuscaPessoa(String(input.termo ?? ''));
              resultados.push({ type: 'tool_result', tool_use_id: u.id, content: res });
            } else if (u.name === 'orcar_galpao') {
              emitir({ t: 'busca', v: `orçando galpão ${input.vao}×${input.comprimento} m` });
              const res = await executarGalpao(input);
              resultados.push({ type: 'tool_result', tool_use_id: u.id, content: res });
            } else if (u.name === 'consultar_sinapi') {
              emitir({ t: 'busca', v: `consultando SINAPI: ${input.tipo}${input.codigo ? ` ${input.codigo}` : ''}` });
              const res = await executarSinapi(input);
              resultados.push({ type: 'tool_result', tool_use_id: u.id, content: res });
            } else if (u.name === 'simular_orcamento') {
              emitir({ t: 'busca', v: `orçando ${input.area_projecao} m²` });
              const res = await executarOrcamento(input);
              resultados.push({ type: 'tool_result', tool_use_id: u.id, content: res });
            } else if (u.name === 'simular_replanejamento') {
              emitir({ t: 'busca', v: 'simulando o replanejamento' });
              const res = await executarSimulacao(input, obrasPermitidas, papel);
              resultados.push({ type: 'tool_result', tool_use_id: u.id, content: res });
            } else if (u.name === 'aprovar_pedido') {
              // o cartão mostra o pedido inteiro: o usuário aprova vendo, não de memória
              const det = await detalharPedido(Number(input.pedido_id), obrasPermitidas, papel);
              if ((det as any).erro) {
                resultados.push({ type: 'tool_result', tool_use_id: u.id, content: (det as any).erro });
              } else {
                const d = det as any;
                const acao = {
                  id: `${Date.now()}_${acoesPropostas.length}`, tool: u.name,
                  input: { ...input, obra_id: d.pedido.obra_id },
                  rotulo: rotuloAcao(u.name, input),
                  detalhe: {
                    tipo: 'pedido',
                    numero: `PM-${String(d.pedido.id).padStart(3, '0')}`,
                    titulo: d.pedido.titulo,
                    evento_id: d.pedido.evento_id,
                    necessidade: d.pedido.necessidade,
                    cotacoes: d.cotacoes.map((c: any) => ({
                      fornecedor: c.fornecedor, valor: Number(c.valor_total),
                      prazo: c.prazo_entrega, condicoes: c.condicoes_pagamento,
                      vencedora: c.id === d.pedido.cotacao_vencedora,
                    })),
                    valor: Number(d.vencedora.valor_total),
                    fornecedor: d.vencedora.fornecedor,
                    orcado: d.orcado ? { etapa: d.orcado.etapa, valor: Number(d.orcado.custo_orcado) } : null,
                  },
                  status: 'pendente',
                };
                acoesPropostas.push(acao);
                emitir({ t: 'acao', v: acao });
                resultados.push({
                  type: 'tool_result', tool_use_id: u.id,
                  content: `Cartão de aprovação apresentado ao usuário com o pedido completo (${d.vencedora.fornecedor}, ${Number(d.vencedora.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}). NÃO está aprovado — ele confere e confirma. Comente brevemente a escolha e o impacto no orçado, sem repetir a tabela.`,
                });
              }
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
