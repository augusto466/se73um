# SINAPI AUTOMÁTICO — sem subir planilha

## O que existe e o que não existe

**A Caixa não tem API.** Publica ZIP com XLSX, por estado, todo mês (por volta do dia 11). Isso não mudou.

**O Orçamentador** reprocessa essas planilhas e expõe via REST, com webhook de atualização. É dependência de terceiro — por isso **o importador CSV continua existindo como plano B**. Se o Orçamentador sair do ar, você não fica na mão.

## Como funciona

```
Caixa publica → Orçamentador processa → webhook avisa o se73um
                                              ↓
              busca os preços dos códigos que os SEUS modelos usam
                                              ↓
                    enfileira as diferenças em "Pendências"
                                              ↓
                       você revisa e aprova (ou ignora)
                                              ↓
                              modelo atualizado
```

**Nada entra no modelo sozinho.** Preço de composição mexe em orçamento — é decisão, não sincronização. O sistema busca, compara, calcula o impacto no m² e te apresenta ordenado pelo que mais pesa.

**Só os códigos em uso.** Não sincroniza as 15 mil composições da tabela: busca os ~40 que seus modelos de fato usam. Rápido e econômico em cota.

## Comparar MT × GO — resolve o custo alto hoje

Comercial → Base de Preços → **"comparar MT × GO"**.

Pega cada código SINAPI do seu modelo, busca o preço nos dois estados e mostra o impacto por m². É a resposta direta para o custo/m² que você achou alto: o orçamento da Moda Verão usa a base de **MT**, e suas obras são em **GO**.

## Webhook

Registre uma vez e esquece. A configuração é por API, e o Orçamentador devolve um segredo que valida a assinatura (HMAC-SHA256) — sem isso qualquer um poderia disparar sincronização no seu sistema.

**Para ativar:**
1. Registre: `GET https://orcamentador.com.br/api/webhook/?mode=register&callback_url=https://se73um.vercel.app/api/webhook/sinapi&apikey=SUA_CHAVE`
2. Copie o `secret` da resposta
3. Vercel → Settings → Environment Variables → `ORCAMENTADOR_WEBHOOK_SECRET` = o segredo
4. Redeploy

A partir daí, todo mês que a Caixa publicar, as pendências aparecem sozinhas.

## O advisor

Ferramenta nova: **`consultar_sinapi`**, com três modos:
- **histórico** — "quanto o aço subiu em 12 meses?" → série mensal com variação
- **explodir** — abre a composição até o insumo, ordenada por peso. Mostra quanto é mão de obra
- **indicadores** — INCC, INCC acumulado, IPCA, IGP-M, SELIC. O INCC acumulado é o índice de reajuste de contrato de obra

## Variáveis de ambiente

| Variável | Obrigatória | Padrão |
|---|---|---|
| `ORCAMENTADOR_API_KEY` | sim | — |
| `ORCAMENTADOR_WEBHOOK_SECRET` | só para o webhook | — |
| `SINAPI_UF` | não | `GO` |
| `SINAPI_REGIME` | não | `NAO_DESONERADO` |

**O regime importa:** o orçamento da Moda Verão usa não desonerado. Trocar muda o preço de tudo que tem mão de obra.

## Cota

O sistema usa cache de 1h (a tabela muda uma vez por mês) e busca só os códigos em uso. As consultas são sequenciais de propósito: rajada queima a cota horária. Se a cota estourar no meio, ele para e reporta o que conseguiu — não falha silenciosamente.

O painel mostra o consumo em "status".

## Deploy

1. Supabase → SQL Editor: `supabase/migracao-sinapi-api.sql`
2. Atualizar, commit, push
3. Comercial → Base de Preços → **"comparar MT × GO"** (a resposta do custo alto)
4. Depois: **"Sincronizar GO"** → revisar pendências → aplicar
5. Opcional: registrar o webhook (ver acima)

## Limites conhecidos

- Depende do Orçamentador estar no ar. O CSV é o plano B.
- Só sincroniza **composições**, não insumos avulsos. Seus modelos usam composições, então cobre o caso.
- Os códigos da Base MODO e Própria não existem no SINAPI — e não deveriam mesmo. São seu diferencial.
