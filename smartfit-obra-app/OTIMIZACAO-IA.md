# OTIMIZAÇÃO DA IA — modelo, caching e custo

## O que estava errado

O código chamava `claude-sonnet-4-6`, que não está no lineup atual. Corrigido.

## Modelo: Claude Sonnet 5

`claude-sonnet-5` — a melhor relação preço/inteligência do lineup atual.

| Modelo | Input / Output (por milhão de tokens) |
|---|---|
| Haiku 4.5 | $1 / $5 |
| **Sonnet 5** | **$3 / $15 — mas $2/$10 até 31/08/2026** |
| Opus 4.8 | $5 / $25 |
| Fable 5 | $10 / $50 |

Até 31 de agosto você paga **menos** do que pagaria pelo Sonnet 4.6 ($3/$15) e roda um modelo melhor. Depois volta a $3/$15 — o mesmo que já se supunha pagar.

Opus 4.8 seria overkill: o advisor lê contexto e chama ferramenta, não faz raciocínio de horas. Haiku erraria IDs e inferências de centro de custo com mais frequência.

Trocar de modelo é uma variável de ambiente: `ADVISOR_MODELO` na Vercel. Sem ela, usa Sonnet 5.

## Prompt caching — o ganho grande

O cache é um **prefixo byte a byte**, na ordem `tools → system → messages`. Qualquer byte diferente antes do breakpoint invalida tudo.

Por isso o system prompt foi dividido:
- **Bloco fixo** (instruções, cláusulas do contrato, regras) → estável → **cacheado**
- **Retrato** (obras, eventos, colaboradores, financeiro) → muda a cada requisição → **fora do cache**

Cachear o retrato junto seria pagar cache-write toda vez e nunca ter cache-hit. Com o breakpoint no fim da parte fixa, as 9 ferramentas entram de graça no prefixo (vêm antes do system) e a leitura sai por ~10% da tarifa de input.

TTL de 1 hora: a escrita custa mais, mas conversa de trabalho passa de 5 minutos, e o cron do briefing reaproveita o mesmo prefixo entre usuários.

**Ganho esperado:** o system + ferramentas somam alguns milhares de tokens repetidos em toda mensagem. Numa conversa de 10 mensagens, paga-se ~1 vez em vez de 10.

## Effort: medium

Na API, `effort` vem como `high` por padrão no Sonnet 5 — desperdício para a maioria das perguntas do advisor. Ficou em `medium`; o raciocínio adaptativo sobe sozinho quando a pergunta exige (replanejamento, análise de margem).

Ajustável por `ADVISOR_ESFORCO` na Vercel.

## Como medir

Cada chamada loga o aproveitamento nos **Runtime Logs da Vercel**:

```
[advisor:chat] cache 87% | lido 4210 | escrito 0 | novo 612 | saida 380
```

- `cache 0%` sempre → o prefixo está sendo invalidado; algo mudou no system ou nas ferramentas
- `escrito` alto e `lido` sempre 0 → conversas curtas demais para o cache valer
- `cache 80%+` → funcionando

Também dá para acompanhar em console.anthropic.com → Usage → agrupar por token type.

## O que ficou de fora (e por quê)

**Batch API no briefing** (50% de desconto): o ganho absoluto é pequeno com poucos usuários, e o batch é assíncrono — exigiria reestruturar o cron para submeter e buscar depois. Vale quando a equipe crescer.

**Retrato sob demanda**: hoje o `montarContexto` faz ~15 queries mesmo para "quem é o Cleiton?". Dava para carregar só o núcleo e buscar o resto por ferramenta. É a próxima otimização se o custo incomodar — mas mexe no comportamento, então merece medição antes.

## Variáveis de ambiente (opcionais)

| Variável | Padrão | Para quê |
|---|---|---|
| `ADVISOR_MODELO` | `claude-sonnet-5` | Trocar de modelo sem mexer no código |
| `ADVISOR_ESFORCO` | `medium` | `low`, `medium`, `high`, `xhigh`, `max` |
