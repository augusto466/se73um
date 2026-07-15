/**
 * Configuração central da IA.
 *
 * Um lugar só para o modelo e os parâmetros: quando a Anthropic lançar a próxima
 * versão, muda-se aqui e vale para o chat e para o briefing.
 */

/** Modelo padrão do advisor. Sonnet 5: melhor relação preço/inteligência do lineup. */
export const MODELO = process.env.ADVISOR_MODELO || 'claude-sonnet-5';

/**
 * Esforço de raciocínio (low | medium | high | xhigh | max).
 *
 * No Sonnet 5 o raciocínio adaptativo é sempre ativo e o padrão da API é 'high':
 * cada resposta gera um bloco de pensamento cobrado como token de SAÍDA (o lado
 * caro). Para o advisor — que lê contexto e chama ferramenta — 'medium' entrega
 * a mesma qualidade por uma fração do custo. O modelo ainda pensa fundo quando a
 * pergunta realmente exige; 'effort' é sinal de comportamento, não teto de token.
 *
 * IMPORTANTE: vai em output_config, não solto no corpo da requisição.
 */
export const ESFORCO = process.env.ADVISOR_ESFORCO || 'medium';

/** Formato correto do parâmetro na Messages API. */
export const outputConfig = { effort: ESFORCO };

/**
 * Prompt caching.
 *
 * O cache é um prefixo BYTE A BYTE, na ordem: tools → system → messages.
 * Por isso a divisão do system prompt importa:
 *   - parte FIXA (instruções, cláusulas, regras)  → estável → vale cachear
 *   - RETRATO (dados vivos da operação)           → muda sempre → fica fora
 *
 * Cachear o retrato junto seria pagar cache-write toda vez e nunca ter cache-hit.
 * Com o breakpoint no fim da parte fixa, as ferramentas entram de graça no
 * prefixo (elas vêm antes) e a leitura sai por ~10% da tarifa de input.
 *
 * TTL de 1h: o custo de escrita é maior, mas uma conversa de trabalho se
 * estende por mais de 5 minutos, e o cron do briefing roda vários usuários
 * em sequência reaproveitando o mesmo prefixo.
 */
export const cacheBreakpoint = { type: 'ephemeral' as const, ttl: '1h' as const };

/** Monta o system em blocos: fixo (cacheado) + retrato (volátil). */
export function montarSystem(fixo: string, retrato: string) {
  return [
    { type: 'text' as const, text: fixo, cache_control: cacheBreakpoint },
    { type: 'text' as const, text: retrato },
  ];
}

/** Registra o aproveitamento do cache no log da Vercel — dá para conferir em Runtime Logs. */
export function logUso(onde: string, usage: any) {
  if (!usage) return;
  const leu = usage.cache_read_input_tokens ?? 0;
  const escreveu = usage.cache_creation_input_tokens ?? 0;
  const novo = usage.input_tokens ?? 0;
  const total = leu + escreveu + novo;
  const pct = total ? Math.round((leu / total) * 100) : 0;
  console.log(`[advisor:${onde}] cache ${pct}% | lido ${leu} | escrito ${escreveu} | novo ${novo} | saida ${usage.output_tokens ?? 0}`);
}
