# Fase 4 — Apoio à Decisão (Painel Executivo)

## Como publicar
1. **Supabase → SQL Editor → New query** → cole `supabase/migracao-fase4.sql` → **Run**
   (cadastra o orçamento da Proposta 328 e cria as views analíticas)
2. Copie os arquivos → GitHub Desktop → Commit `Fase 4: painel executivo, desvios, curva ABC e fornecedores` → **Push**

## O que entrou

### Painel Executivo (nova aba, primeira para gestores)
Seis números no topo: **carteira contratada · medido · margem realizada · menor caixa projetado ·
decisões esperando você · pontos de risco**.

Abaixo, **os sinais que exigem ação** — só aparecem quando existem:
- Caixa projetado negativo nas 12 semanas
- Etapas com compra acima do orçado
- Decisões travadas com você (medição/pedido parado trava a obra e o caixa da contratada)
- Riscos contratuais (documento vencido = Cl. 13.3; FVS reprovada = retrabalho)

### Aba Carteira
Uma linha por obra com **avanço real × planejado** na mesma barra (o traço escuro é o planejado).
Se o real ficar 5 pontos abaixo, a barra fica vermelha e marca "⚠ atrasado".

### Aba Orçado × Comprado
As 15 etapas da **Proposta 328** (R$ 4,1 mi) já cadastradas: Estrutura Metálica R$ 1.456.563,44,
Fundação R$ 557.042,70, Instalações R$ 350.949,89, Vedação R$ 281.512,68, Cobertura R$ 276.598,74,
Piso R$ 266.693,32, Steel Deck R$ 253.057,55, Pintura R$ 244.713,48, Terraplenagem R$ 240.473,61, etc.

Mostra orçado × contratado × medido × **comprado**, com a barra de consumo do orçamento
(verde <85%, amarelo <100%, vermelho acima) e o desvio em reais.

> **Importante:** o desvio só calcula se o pedido de materiais estiver **vinculado a um evento**
> daquela etapa. Sempre selecione o evento ao criar o pedido.

### Aba Curva ABC
Classifica as compras: **A** = 80% do custo (é onde negociar dá dinheiro), **B** = 15%, **C** = 5%.

### Aba Fornecedores
Cotações apresentadas, vitórias, **taxa de vitória**, ticket médio e valor contratado.
Deixa de ser "acho que o fulano é bom" e vira dado.

## Ajuste do orçamento
Se algum valor divergir da proposta, edite direto no Supabase → Table Editor → `orcamento`.
Para outras obras, cadastre as etapas ali (o comparativo funciona para qualquer obra).
