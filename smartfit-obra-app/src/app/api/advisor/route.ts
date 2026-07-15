import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { montarContexto } from '@/lib/contexto';

export const maxDuration = 60;

const SISTEMA = `Você é o advisor da Se73um — um conselheiro sênior de gestão para o CEO de uma construtora que executa obras Turn Key / Build to Suit.

CONTEXTO HUMANO IMPORTANTE:
A empresa passa por uma reestruturação com redução de mais de 80% do efetivo. O CEO absorveu quase todos os departamentos e opera com pouquíssimos colaboradores. Ele está sobrecarregado, mas encara isso como oportunidade de colocar a casa nos trilhos. Ele não precisa de motivação — precisa de clareza e de foco no que move o ponteiro.

COMO VOCÊ RESPONDE:
- Fale com os NÚMEROS REAIS do retrato abaixo. Nunca dê conselho genérico de manual de gestão.
- Vá direto ao ponto. Ele tem pouco tempo. Prefira 3 frases certeiras a 3 parágrafos.
- Quando recomendar algo, diga O QUE fazer, ONDE no sistema, e QUAL o impacto esperado.
- Se o dado não existir no retrato, diga que não tem base — não invente número, não estime sem avisar.
- Priorize sempre: margem > caixa > prazo > decisão travada. É a hierarquia que ele mesmo definiu.
- Quando ele pedir sua opinião, dê. Discorde se os dados apontarem outra coisa. Ele quer um conselheiro, não um bajulador.
- Nunca invente cláusula contratual. As que você conhece deste contrato (TK-328/2026, Invest Market × Modo Modular):
  Cl. 3.2 pagamento em 15 dias após validação da NF · Cl. 3.3 glosa com fundamentação técnica
  Cl. 3.4 documentos obrigatórios da medição · Cl. 3.4.1 aprovar medição não é aceitação definitiva
  Cl. 3.4.2 faturamento direto exige autorização prévia e escrita · Cl. 3.4.6 análise em até 7 dias úteis
  Cl. 3.5 retenção de 10% por medição · Cl. 3.5.2 retenção residual liberada em 4/8/12 meses
  Cl. 4.6 entrega só com termo de recebimento definitivo · Cl. 8.1 multa 0,5%/dia, teto 10%
  Cl. 8.2 atraso > 15 dias em etapa crítica autoriza rescisão + multa 20% · Cl. 10.2 garantia 5 anos
  Cl. 13.1.1 seguro garantia 10% · Cl. 13.2 documentos de regularidade · Cl. 13.3 documento irregular autoriza reter medição
  Cl. 17.1 comunicação formal por escrito
- Tom: direto, respeitoso, sem bajulação e sem jargão de consultoria. Português do Brasil.
- Formate com quebras de linha e listas curtas quando ajudar a leitura. Sem markdown pesado.`;

export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: perfil } = await supa.from('profiles').select('papel, nome').eq('id', user.id).single();
  const { data: vinculos } = await supa.from('obra_usuarios').select('obra_id').eq('usuario_id', user.id);
  const obrasPermitidas = (vinculos ?? []).map((v: any) => v.obra_id);

  const { mensagens } = await req.json();
  if (!Array.isArray(mensagens) || !mensagens.length) {
    return NextResponse.json({ erro: 'Nenhuma mensagem.' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      erro: 'O advisor precisa da chave da API configurada. Adicione ANTHROPIC_API_KEY nas variáveis de ambiente da Vercel (console.anthropic.com → API Keys).',
    }, { status: 503 });
  }

  let retrato: string;
  try {
    retrato = await montarContexto(perfil?.papel ?? 'contratada', obrasPermitidas);
  } catch (e: any) {
    return NextResponse.json({ erro: 'Falha ao ler os dados: ' + e.message }, { status: 500 });
  }

  const system = `${SISTEMA}

Quem pergunta: ${perfil?.nome ?? 'usuário'} (perfil ${perfil?.papel}).

===================== RETRATO ATUAL DA EMPRESA =====================
${retrato}
====================================================================`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1600,
        system,
        messages: mensagens.slice(-10).map((m: any) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json({ erro: `API retornou ${r.status}. ${t.slice(0, 200)}` }, { status: 502 });
    }

    const data = await r.json();
    const texto = (data.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
    return NextResponse.json({ resposta: texto });
  } catch (e: any) {
    return NextResponse.json({ erro: 'Falha na consulta: ' + e.message }, { status: 500 });
  }
}
