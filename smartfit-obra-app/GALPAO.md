# ORÇAMENTO DE GALPÃO — engenharia, não índice médio

## A diferença

O motor paramétrico orça por **índice médio**: pega o kg/m² da Moda Verão e multiplica pela área nova. Funciona como estimativa, mas erra quando a obra é diferente — foi de onde veio o custo/m² alto.

Este orça por **cálculo**:
- **Estrutura** → tabelas do manual Gerdau: o perfil e o peso saem do vão, altura e vento reais
- **Fechamento** → geometria, com desconto de porta
- **Fundação** → reações do pórtico (Rv, Rh, Mx do próprio manual)

## Manual Gerdau

"Galpões em Pórticos com Perfis Estruturais Laminados", 7ª edição (2018). As **144 combinações** (3 alturas × 8 vãos × 6 estágios) foram extraídas das tabelas do capítulo 6.4 e estão embutidas em `src/lib/gerdau.ts`.

**Validação contra o exemplo resolvido do manual** (pág. 53) — H=9 m, L=30 m, Q6:

| | Sistema | Manual |
|---|---|---|
| Viga | W410x46.1 | W 410 x 46,1 |
| Coluna | W410x67.0 | W 410 x 67,0 |
| Rv1 / Rv2 | 58 / −3 kN | 58 / −3 |
| Rh1 / Rh2 | 35 / 26 kN | 35 / 26 |
| Mx1 / Mx2 | 124 / 84 kN·m | 124 / 84 |

**Validação do peso** contra a lista de material (pág. 60) — GMQ6/30/9/6, 1.080 m²:

| Item | Sistema | Manual |
|---|---|---|
| Colunas | 8.723 kg | 8.723,4 kg |
| Vigas | 9.729 kg | 9.719,7 kg |
| Terças | 3.044 kg | 3.044,2 kg |
| Escoras | 1.620 kg | 1.620,0 kg |
| **Total** | **28.650 kg** | **27.612 kg** |
| **Taxa** | **26,5 kg/m²** | **25,6 kg/m²** |

Diferença de +3,8% — conservador de propósito. Orçamento erra para mais, não para menos.

## Estágio de ação

Combina vento (NBR 6123) com espaçamento entre pórticos. **Goiás está na isopleta de 30 m/s**; com B = 6 m, dá **Q6** — o mesmo do exemplo do manual.

## Premissas do manual (se a obra fugir, o número não vale)

- Pórtico de alma cheia, engastado, aço ASTM A572 Grau 50
- Inclinação 10% · sem ponte rolante
- Sobrecarga 0,25 kN/m² · terreno categoria III classe B · S1 = S3 = 1
- Vão de 15 a 50 m · altura até 12 m · B de 6, 9 ou 12 m

Medida intermediária **arredonda para cima** (H = 11 m usa a tabela de 12 m), como manda o exemplo 2 da pág. 54. É conservador.

## O que a tela pergunta

**Geometria:** vão, comprimento, pé-direito, espaçamento, vento, inclinação, laje/mezanino, terreno, prazo.

**Composição:** fechamento (alvenaria total · alvenaria parcial + isopainel, com a altura do bloco · isopainel total · TP-40 pintada), cobertura (TP-40 branca · galvanizada · isotérmica PIR), piso (fck 20/25/30 · polido · sem piso) e espessura.

**Portas:** tipo, largura, altura, quantidade. **A área é descontada do fechamento** — quem esquece isso orça parede onde tem portão.

**Fundação:** capacidade da estaca.

## Fundação — o limite honesto

O manual dá as reações e as dimensões da placa de base. Isso permite calcular a carga por base (vertical + o efeito do momento de engaste). Mas **dimensionar estaca exige sondagem SPT** — sem o laudo, qualquer número é chute com aparência de cálculo.

Então: a capacidade da estaca é **premissa explícita**. Se você não informar, o sistema usa 40 tf e **avisa que é genérico**. A fundação é o item que mais surpreende em obra.

## Memória de cálculo

Toda proposta gerada por este motor guarda: perfis escolhidos, estágio, peso, reações, geometria completa, dados da fundação e as premissas. É o que permite defender o número numa negociação — e conferir depois.

## O advisor

Ferramenta **`orcar_galpao`**: "quanto sai um galpão de 25 × 40, pé-direito 8, isopainel, com dois portões de 4×4,5?" → ele calcula, mostra os perfis, o peso, as reações e o preço por etapa. E repassa os avisos.

O system prompt manda **preferir este ao paramétrico** quando for galpão com dimensões conhecidas.

## Deploy

1. Supabase → SQL Editor: `supabase/migracao-galpao.sql`
2. Atualizar, commit, push
3. **Comercial → Orçar Galpão**

## Limites conhecidos

- **É pré-dimensionamento.** O manual é explícito: projeto executivo exige profissional habilitado. Serve para orçar, não para construir.
- Só pórtico de alma cheia com perfil laminado. Treliça, perfil soldado ou tesoura não estão nas tabelas.
- Sem ponte rolante — muda o carregamento inteiro.
- Os itens sem correspondência na base de preços entram **zerados** e o sistema avisa. Sincronize o SINAPI de GO.
- A Moda Verão consumiu 49,23 kg/m² contra os ~26 kg/m² do Gerdau: se a estrutura da MODO for diferente (treliça, mezanino pesado), calibre o preço do kg, não o peso.

---

# FUNDAÇÃO — Décourt-Quaresma, NBR 6122:2019

## Por que este método

É o mais usado no Brasil para estaca a partir de SPT, e é **semiempírico** — nasceu de prova de carga, não de teoria pura. Para orçamento, é o que dá número defensável com o dado que existe.

```
R_ponta  = α · K · N_ponta · A_ponta
R_fuste  = β · 10 · (N_fuste/3 + 1) · U · L
R_adm    = (R_ponta + R_fuste) / 2        ← NBR 6122: FS global 2,0
```

**Detalhes que separam o cálculo do chute:**
- **N do fuste limitado a 15** (Décourt). Acima disso o atrito não cresce proporcionalmente. Quem esquece, superestima a estaca.
- **α = 0,30 para estaca escavada e hélice.** Elas mobilizam pouca ponta. Aplicar a fórmula crua sem o α é o erro clássico.
- **N da ponta limitado a 50.** Acima é impenetrável; não se extrapola.

## O limite que não se contorna

A capacidade sai do **N-SPT**. Sem sondagem não há cálculo — há estimativa. O sistema faz as duas coisas, mas **nunca finge que uma é a outra**.

**Com sondagem:** informe o perfil (cota, N-SPT, tipo de solo por camada) e o cálculo é de verdade.

**Sem sondagem:** três perfis típicos de Goiânia — argila porosa sobre residual (o comum), impenetrável raso (otimista) e argila espessa (pessimista). O método roda certo, o dado é regional, e o sistema **grita** que o solo é presumido.

Goiânia assenta sobre solo residual de micaxisto com camada superficial de **argila porosa colapsível** — que colapsa quando molha. Por isso os perfis típicos desprezam os primeiros metros.

## A tração é que manda

Descoberta que o cálculo revelou, e que muda o dimensionamento:

No exemplo do manual (H=9, L=30, Q6), a base tem Rv=58 kN e Mx=124 kN·m. Num bloco de 2 estacas com 1,2 m de espaçamento:

| Combinação | Compressão | Tração |
|---|---|---|
| Permanente + sobrecarga | 132 kN | **−74 kN** |
| Permanente + vento | 201 kN | **−146 kN** |

**A estaca de barlavento é arrancada.** Em base engastada de pórtico o momento é grande e o peso próprio é pequeno — isso é regra, não exceção.

Consequências que o sistema trata:
- O **comprimento** pode ser ditado pela tração, não pela compressão. O sistema diz qual foi o condicionante.
- Na tração **só o fuste resiste** (a ponta não trabalha), mais o peso próprio da estaca.
- Estaca tracionada leva **armadura em todo o comprimento** — não é o mesmo detalhe da comprimida. O sistema lança esse item separado.

Dimensionar só pela carga vertical é o que arranca fundação de galpão em vendaval.

## Memória de cálculo

A tela mostra: as duas combinações com compressão e tração, o condicionante, resistência de ponta (com N, K e α usados), resistência de fuste **camada a camada** (com o N limitado marcado), capacidade admissível e à tração.

Dá para conferir linha por linha — que é o que um orçamento de fundação precisa ter para ser defensável.

## Limites

- **Bloco de 2 estacas**, que é o padrão para base engastada de pórtico. Bloco de 3 ou 4 exigiria outro cálculo de binário.
- Não verifica **recalque** — só capacidade. Para argila mole, recalque pode mandar.
- Não trata **atrito negativo** (aterro sobre argila mole comprime a estaca para baixo).
- O método é para estaca. **Sapata** exige outro cálculo, e em Goiânia a argila colapsível costuma inviabilizá-la mesmo.
