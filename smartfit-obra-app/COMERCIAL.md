# COMERCIAL — do pipeline ao orçamento paramétrico

## A correção que vinha antes de tudo

**O Cockpit estava mostrando margem errada.** `orcamento.valor_orcado` guarda PREÇO (custo + BDI de 25%), mas a margem era calculada como `valor_global − valor_orcado` — subtraindo preço de preço.

TK-328: aparecia **−2,3%**. A real é **≈ +18%**:
- Preço orçado: R$ 4.194.354 (o que continha BDI embutido)
- Custo real: R$ 4.194.354 ÷ 1,25 ≈ R$ 3.355.483
- Margem: R$ 4.100.000 − R$ 3.355.483 = **R$ 744.517 (+18,2%)**

O erro estava em três lugares e se propagava para tudo, inclusive para o advisor:
- `orcamento`: agora tem `custo_orcado` e `bdi_pct` separados de `valor_orcado`
- view `painel_ceo`: o campo chamado `custo_orcado` somava `valor_orcado` (preço). Corrigido, e ganhou `preco_orcado`
- view `desvio_etapa` e `bi.ts`: consumo e margem passam a medir contra o CUSTO

A migração deriva o custo dividindo por 1,25. **Se algum item tiver BDI diferente de 25%, ajuste depois em Financeiro.**

## O motor de orçamento

O gargalo não era pipeline — era você fazendo orçamento sozinho. O motor ataca isso.

**Como funciona:** um modelo guarda a receita de um tipo de obra — etapas, itens e o **índice** de cada um (quanto se consome por unidade do driver). Informadas as premissas, ele multiplica e devolve o orçamento inteiro.

**Drivers:**
| Driver | O que escala | Exemplo |
|---|---|---|
| `area_proj` | área de projeção | cobertura, estrutura, piso |
| `area_laje` | laje/mezanino | steel deck, laje |
| `area_fachada` | fachada (ou estimada pelo perímetro × pé-direito) | vedação |
| `prazo` | meses de obra | engenheiro, container, encarregado |
| `fixo` | não escala | mobilização, projetos |

**O modelo que nasce pronto:** "Galpão metálico — padrão MODO", com **68 itens e índices extraídos da obra Moda Verão real** (1.111,11 m² de projeção + 858,38 m² de laje, 5 meses).

Índices reveladores que saíram dela:
- **49,23 kg de estrutura metálica por m²** de projeção
- Cobertura 1,0 m²/m² · Pintura 2,43 m²/m² · Steel deck 1,11 m²/m²
- Custo de referência: **R$ 2.406/m²** de projeção
- Estrutura metálica = 37,5% do custo; Pisos 16,4%; Instalações 12,9%

**Validação:** alimentado com as premissas da própria Moda Verão, o motor reproduz o orçamento original com **diferença de R$ 0,00** — custo R$ 2.673.700,82 e preço R$ 3.325.648,24.

**Padrão de acabamento** ajusta só o que varia com ele (pintura, vedação, cobertura, pisos, instalações): simples −8%, médio referência, alto +18%.

## Base de composições

- **SINAPI 04/2025 - MT** (a base do seu XLSX) — **atenção: é MT, não GO.** Se as obras são em Goiânia, vale importar a tabela de GO.
- **Base MODO** e **Própria** — suas composições. É o diferencial que não existe no SINAPI: estrutura metálica, isopainel, montagem.
- 62 composições importadas com custo unitário.

Sobre automatizar o SINAPI: a Caixa publica planilhas mensais por estado, sem API oficial. Seria um importador de arquivo, não sincronização automática.

## O funil

`contato → premissas → orçamento → proposta → negociação → assinada` (ou `perdida`, com motivo obrigatório).

Origem: indicação, RFP de rede, prospecção ativa, recorrente. Cada estágio tem probabilidade padrão, e o pipeline mostra valor bruto e ponderado.

## Proposta

- **Versionada** (R01, R02...). Nova versão marca a anterior como substituída — o histórico fica.
- **PDF com a marca Se73um**, gerado pelo sistema: resumo por etapa, planilha detalhada, escopo e condições. **Mostra só o preço — nunca o custo.** Sua composição é sua.
- **Ganhou → cria obra:** um clique. O orçamento da proposta vira o orçamento da obra, com custo e BDI separados. Zero redigitação.

## O advisor no comercial

- **`simular_orcamento`** — "quanto sai um galpão de 1.400 m²?" Ele orça na hora com os índices reais e compara com o custo executado de obras anteriores. Nunca chuta preço.
- O retrato inclui o funil, os prazos de proposta vencidos e os motivos de perda.
- O briefing diário cobra o que está parado no pipeline.

## O ciclo que fecha

Proposta → obra → custo real → calibra o modelo → próxima proposta melhor. É isso que impede repetir o erro de orçamento na obra seguinte.

## Deploy

1. Supabase → SQL Editor: `supabase/migracao-comercial.sql`
2. Atualizar, commit, push
3. Conferir no Cockpit: a margem da TK-328 deve virar ≈ +18%
4. Comercial → nova oportunidade → premissas → gerar orçamento

## Limites conhecidos

- **O motor não lê projeto arquitetônico.** Extrair quantitativo de planta é reconhecimento de desenho técnico — não é o que ele faz. Ele lê texto (memorial, caderno de encargos), não mede área de laje em PDF.
- Um modelo só: galpão metálico. BTS academia e estrutura avulsa precisam dos seus próprios índices — a partir da segunda obra de cada tipo, dá para derivar.
- A calibração automática (custo real → índice) ainda é manual: a função `derivarIndices` existe, mas falta a tela.
- O BDI é por item, herdado do modelo. Não há ainda composição de BDI (encargos, lucro, impostos, risco) por obra.

---

# O CICLO COMPLETO — do contato ao envio

## Como as peças se ligam

```
Comercial → nova oportunidade (contato)
    ↓
abre a oportunidade → escolhe o método:
    ├─ Galpão por engenharia  (Gerdau + geometria + NBR 6122)
    └─ Paramétrico            (índice médio de obra anterior)
    ↓
preenche as premissas → Calcular → confere a memória de cálculo
    ↓
Salvar como proposta  →  R01 (o funil vai para "orçamento")
    ↓
✉ Enviar ao cliente → o sistema prepara, você confere e clica
    ↓
o funil vai para "proposta"; a versão fica marcada como enviada
    ↓
negociação → nova versão (R02, R03...) → cada uma com seu envio
    ↓
Ganhou → cria obra com o orçamento dentro
```

## O motor dentro da oportunidade

O "Orçar Galpão" deixou de ser tela solta. Dentro da oportunidade há duas abas:

- **Galpão por engenharia** — o motor Gerdau completo, com memória de cálculo
- **Paramétrico** — o índice médio, para quando ainda não há dimensões

O "Simular Galpão" continua no menu para orçar sem oportunidade — útil numa ligação, para dar uma ordem de grandeza.

## Envio

**Nada sai sozinho.** O sistema prepara: pega o e-mail de contato da oportunidade, monta o assunto (`Proposta R01 — BTS Smart Fit (OP-2026-001)`) e redige o corpo com valor, prazo e validade. Você lê, ajusta o que quiser, e clica.

E-mail a cliente não tem CTRL+Z. Por isso o advisor redige, mas **nunca envia**.

**A proposta vai como link**, não anexo — gerar PDF binário exigiria headless browser na serverless. O link abre a proposta com a identidade Se73um, pronta para o cliente imprimir ou salvar.

**Cada envio fica registrado** (destinatário, assunto, corpo, data, quem enviou) e é **imutável**: numa negociação, é a prova de que a proposta saiu e do que ela dizia.

## Configuração do e-mail

| Variável | O quê |
|---|---|
| `RESEND_API_KEY` | chave da API do Resend |
| `RESEND_FROM` | remetente verificado, ex.: `comercial@se73um.com.br` |
| `NEXT_PUBLIC_SITE_URL` | domínio, para o link da proposta |

O Resend exige **domínio verificado** — não dá para enviar de um Gmail. Sem as variáveis, o botão avisa e sugere baixar o PDF e enviar pelo seu cliente de e-mail.

## O funil anda sozinho

- **Gerar orçamento** → estágio "orçamento", 40%
- **Enviar proposta** → estágio "proposta", 60%
- **Ganhou → criar obra** → "assinada", 100%

Você move manualmente quando a realidade não segue o script (o cliente sumiu, voltou atrás, pediu revisão).
