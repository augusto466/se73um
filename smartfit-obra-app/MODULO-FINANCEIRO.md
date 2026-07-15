# Módulo Financeiro — contas, agenda, fluxo de caixa e DRE

## A ideia central
O dado **já existe** no sistema. O módulo transforma o que você já opera em previsão de caixa:

- **Cotação aprovada** (Materiais & Compras) → vira **conta a pagar** automaticamente, com fornecedor, valor e vencimento pela data de necessidade em obra.
- **Medição aprovada** (Cronograma) → vira **conta a receber** com o valor **líquido de retenção**, vencimento em 15 dias (Cl. 3.2).
- Lançamentos manuais e recorrentes cobrem o que é fora de obra (aluguel, folha, pró-labore, contador).

## O que a aba Financeiro entrega

| Sub-aba | Para quê |
|---|---|
| **Agenda de pagamentos** | O que vence nos próximos 7 dias + vencidos. Sua rotina de segunda-feira |
| **Contas a pagar** | Tudo em aberto, com origem rastreada (pedido, medição, manual) |
| **Contas a receber** | Recebíveis por obra, já líquidos de retenção |
| **Fluxo de caixa** | Projeção semanal (12 semanas) a partir do saldo atual — alerta se o caixa fura |
| **DRE por obra** | Receita medida × custo apropriado = **margem real de cada contrato** |
| **Recorrentes** | Cadastra despesa fixa uma vez e gera os lançamentos dos próximos meses |

## Permissões (importante)
- **Admin**: vê e movimenta tudo.
- **Contratante**: vê o financeiro **apenas das obras dele**.
- **Contratada**: **não acessa** o financeiro — protege margem e custos entre as partes.

Regra gravada no banco (RLS), não só na tela.

## Como publicar
1. **Supabase → SQL Editor → New query** → cole `supabase/migracao-financeiro.sql` → **Run**.
   O script já faz *backfill*: gera os lançamentos do que hoje está aprovado (medições E01/E02 e o pedido PM-001, se aprovado).
2. Suba o código (script PowerShell ou GitHub Desktop) → a Vercel republica.
3. No painel: aba **Financeiro** → botão **atualizar saldo** no card "Saldo em caixa" → informe a posição real de caixa/banco. É o que ancora a projeção.
4. Sub-aba **Recorrentes** → cadastre aluguel, folha, pró-labore, software → **Gerar lançamentos dos próximos 3 meses**.

## Rotina sugerida (15 min/semana)
- **Segunda:** abra a **Agenda** → baixe o que foi pago/recebido → olhe o **Fluxo de caixa**: se o menor saldo projetado ficar negativo, o painel avisa em vermelho.
- **Ao aprovar compra ou medição:** nada a fazer — o lançamento nasce sozinho.
- **Mensal:** confira o **DRE por obra** — é o número que diz se o contrato está entregando a margem prevista.
