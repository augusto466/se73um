# REDESIGN — tema escuro

Só visual. Nenhum dado, nenhuma regra de negócio mudou.

## Os tokens

Toda a paleta está em `globals.css`. Nenhum componente tem cor fixa — trocar o tema é trocar variável, não caçar hex.

**Superfícies por elevação.** O fundo é o mais escuro (`#08080A`), a sidebar fica entre o fundo e o card (`#0D0D10`), o card sobe (`#121215`). Sem essa hierarquia tudo achata e nada se destaca.

**No escuro, sombra some.** A elevação vem de **borda + brilho**, não de `box-shadow`. Por isso o painel tem `border-color` que muda no hover.

## Componentes novos (`Visual.tsx`)

| | O quê |
|---|---|
| `<Anel>` | progresso circular — o valor é o próprio `stroke-dasharray`, sem lib |
| `<Conformidade>` | barras horizontais com rótulo e valor |
| `<Metricas>` | células de número grande separadas por divisor |
| `<LinhaTempo>` | eixo de marcos com o atual destacado |
| `<Spark>` | tendência com área em gradiente — sem eixo, sem grade |
| `<Tipo>` | badge colorido por tipo de item |

## O hero

É o único elemento com peso visual próprio: gradiente diagonal, brilho da marca no canto e uma malha sutil mascarada por radial. **Se tudo brilha, nada brilha** — o resto da tela é sóbrio de propósito, porque o protagonista é o dado.

## O que mudou nas telas

**Nada de estrutura.** As telas já usavam `.panel`, `.cock-hero`, `.cock-strip`, `.st-*` — todas herdaram o tema sozinhas. Foi por isso que o redesign coube numa entrega.

**Meu Dia** ganhou o painel "Seu resumo hoje" com as métricas e o anel de progresso.

## Detalhes que costumam passar

- **`color-scheme: dark`** em `select` e `input[type=date]`: sem isso o seletor nativo do sistema abre branco no meio do tema escuro.
- **Scrollbar** estilizada — a padrão do Chrome é clara e corta o clima.
- **`::selection`** com o brilho da marca.
- **Stamps** (`st-ok`, `st-risk`...) tinham borda em hex claro fixo. Agora a borda é a própria cor com alpha.
- **`--ink` virou texto claro.** Quem usava como *fundo* (`.subtab.on`, `.tag-rev`) quebraria — corrigido.

## O que ficou de fora

Do mockup, **clima e "condições da obra"** não entraram. Clima é bonito e não muda decisão. Segurança e qualidade dariam para derivar da FVS, mas produtividade não existe no sistema — e barra de progresso com número inventado é pior que barra nenhuma.

Se quiser, dá para ligar os dois primeiros à FVS real depois.
