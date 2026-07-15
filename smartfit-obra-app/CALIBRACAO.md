# CALIBRAÇÃO — o modelo aprende com a obra real

## O problema que isto resolve

O modelo nasceu com os índices da Moda Verão. Ponto de partida útil, verdade eterna não. Sem calibração, um erro de orçamento se repete indefinidamente — e o custo/m² alto que você notou continuaria alto para sempre.

## Três caminhos para corrigir o custo

**1. Contra o custo real** (Comercial → Base de Preços → "Contra o custo real")
Compara o modelo com o que as obras realmente custaram (pedidos aprovados). Se a estrutura metálica custou 12% acima do orçado na TK-328, ele propõe corrigir o custo unitário dos itens dessa etapa.

**Uma decisão de projeto:** corrige o **custo unitário**, nunca o **índice**. Se a etapa custou mais, o mais provável é que o preço estava defasado — não que a quantidade por m² mudou. Índice se corrige com medição física, não com nota fiscal.

**Travas:** variação abaixo de 3% é ruído e é ignorada; acima de 60% é erro de lançamento, não realidade — ele avisa em vez de aplicar.

**2. Contra a base de preços** (mesma tela, outra aba)
Depois de importar uma tabela SINAPI nova, compara o custo do modelo com a base atual e propõe atualizar. Mostra o impacto por m² de cada item, ordenado pelo que mais pesa.

**3. Ajuste manual na proposta**
Na oportunidade, cada item da proposta tem "editar": quantidade, custo unitário e BDI. Itens ajustados ficam marcados. É onde se resolve caso a caso, numa negociação.

## Nada é automático

O sistema **propõe**; você escolhe item a item e escreve o motivo. Custo real pode estar contaminado por uma compra atípica — quem sabe é você. Toda calibração fica registrada com autor, motivo, diff completo e o efeito no custo/m² do modelo. **Calibrações são imutáveis:** é o histórico de como o modelo aprendeu.

Cada item guarda `custo_original` e `indice_original` — dá para sempre ver o quanto ele já andou desde que nasceu.

## Importação do SINAPI

A Caixa publica planilha mensal por estado — **não há API oficial**. O caminho é: baixar, deixar as colunas `codigo · descricao · unidade · custo`, salvar como CSV e colar em Comercial → Base de Preços → Importar.

Aceita separador `;` ou `,` e decimal brasileiro (1.234,56). Mostra quantas linhas são novas, quantas foram atualizadas e a **variação média** frente à base anterior — se passar de 15%, ele avisa antes de você orçar com ela.

**A base de GO nasce criada e vazia.** É a que interessa: suas obras são em Goiânia, e o orçamento da Moda Verão usava a base de **MT**. Essa é a causa mais provável do custo/m² alto.

Importar a base atualiza `composicoes`, mas **não mexe nos modelos** — eles guardam o custo congelado. A propagação é o passo seguinte, na aba "Contra a base de preços", e também é opt-in.

## O ciclo completo

```
proposta → obra → compra aprovada → custo real
                                        ↓
              modelo calibrado ← você escolhe o que aceitar
                    ↓
            próxima proposta melhor
```

## O advisor

O retrato inclui as calibrações recentes. Se o modelo nunca foi calibrado e já existe compra aprovada, ele cobra — porque é dinheiro na mesa.

## Deploy

1. Supabase → SQL Editor: `supabase/migracao-calibracao.sql`
2. Atualizar, commit, push
3. Comercial → Base de Preços → importar o SINAPI de GO
4. Aba "Contra a base de preços" → analisar → aplicar

## Limites conhecidos

- A correspondência etapa-modelo × etapa-obra é por prefixo de texto (8 caracteres). Funciona no seu caso porque as etapas seguem o mesmo padrão; se divergirem muito, alguns itens não casam.
- Só calibra custo unitário. Corrigir índice exigiria medição física (quantos kg de aço a obra de fato consumiu), que o sistema ainda não captura.
- A importação não lê .xlsx direto — precisa de CSV. Converter é um "salvar como" no Excel.
