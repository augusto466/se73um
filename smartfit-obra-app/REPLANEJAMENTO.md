# REPLANEJAMENTO — baseline intocável, revisões rastreáveis

## O princípio

O cronograma contratual (Anexo III) é a âncora de qualquer discussão de prazo. Se ele puder ser editado, não há com o que comparar — e numa disputa contratual você fica sem chão. Por isso:

- **`base_inicio` / `base_fim` / `base_mes`** — o baseline. Gravado **uma vez** e travado por trigger no banco. Nem a interface, nem o advisor, nem uma chamada direta à API conseguem alterar. Se tentar, o Postgres levanta exceção.
- **`prev_inicio` / `prev_fim`** — o replanejamento vigente. É isto que muda.
- **`real_inicio` / `real_fim`** — o que aconteceu de fato.

Idem para o cronograma financeiro da obra: `meses_base` é congelado; `meses` segue livre.

## Regra de negócio

**Antecipar ou atrasar a execução move o evento de medição junto** — o faturamento acompanha o físico. Toda simulação mostra o efeito no faturamento mês a mês, e o sistema lembra que antecipar medição depende de aceite da contratante (Cl. 3.4.6: 7 dias úteis para análise).

## Como usar

**1. Cadastrar o baseline (uma vez).** Menu Contrato → **Replanejamento** → "Preencher datas". Informe início e fim de cada evento conforme o Anexo III e marque os críticos. Confira antes de gravar: não há desfazer.

**2. Cadastrar precedências.** Sem elas, antecipar a mobilização não puxa a terraplenagem — cada data teria de ser informada na mão. Com elas, o sistema recalcula a cascata sozinho. Tipos: `FS` (fim → início, o padrão), `SS` (início → início), `FF` (fim → fim); a folga aceita negativo para sobreposição.

**3. Simular.** Informe as novas datas de início e clique em **Simular impacto**. Nada é gravado. Você vê: eventos movidos (direto × por precedência), nova data de conclusão, faturamento que muda de mês e alertas contratuais (Cl. 8.1/8.2 acendem sozinhas se a entrega furar).

**4. Aplicar.** Se o cenário fecha, informe o **motivo** e aplique. Vira a revisão R01, R02… com autor, data, diff completo e impacto — tudo imutável. O baseline segue intacto e a curva S continua mostrando as duas leituras.

## O advisor

Duas ferramentas novas:
- **`simular_replanejamento`** — roda o cenário e lê o resultado antes de te responder. Sem gravar nada.
- **`aplicar_replanejamento`** — propõe a revisão num cartão de confirmação. Só depois do seu clique é que grava.

Exemplo: *"vou antecipar a mobilização para 24/07 e emendar a terraplenagem — qual o impacto?"* Ele simula, propaga pela cascata, te mostra o que muda no faturamento de cada mês e comenta os alertas. Se você concordar, ele propõe a revisão.

O advisor agora enxerga no retrato: as datas dos eventos (baseline × previsto × real), as precedências cadastradas e o histórico de revisões.

## Novos objetos no banco

Colunas em `eventos` (base/prev/real, duração, crítico) e em `obras` (`meses_base`). Tabelas `evento_dependencias` e `cronograma_revisoes`. Views `curva_s` e `desvio_prazo`. Triggers `protege_baseline`, `protege_meses_base`, `revisao_imutavel`.

## Deploy

1. Supabase → SQL Editor: rodar `supabase/migracao-replanejamento.sql`
2. Atualizar a pasta local, commit e push
3. Cadastrar o baseline e as precedências na tela

## Limites conhecidos

- Cálculo em **dias corridos**. Calendário de obra (feriados, dias úteis) não entra ainda.
- Sem detecção de ciclo nas precedências — o motor estabiliza em 50 passadas, mas uma dependência circular passaria despercebida no cadastro.
- Caminho crítico é marcado à mão (campo `critico`), não calculado.
