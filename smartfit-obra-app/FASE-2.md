# Fase 2 — Meu Dia · Rotinas · Qualidade (FVS) · Metas

## Como publicar
1. **Supabase → SQL Editor → New query** → cole `supabase/migracao-fase2.sql` → **Run**
2. Copie os arquivos, **Commit** `Fase 2: Meu Dia, rotinas, qualidade e metas` → **Push** (GitHub Desktop)
3. No painel: aba **Rotinas** → botão **Gerar ocorrências (30 dias)** → abra **Meu Dia**

## 1. Meu Dia — seu cockpit (nova tela inicial)
Consolida **de todas as obras**, num lugar só:
- Tarefas do kanban em aberto
- Ocorrências de rotina pendentes
- **Medições aguardando sua validação**
- **Pedidos de materiais aguardando aprovação**
- Lançamentos financeiros vencendo em 7 dias

Agrupado por urgência: **Atrasado → Hoje → Próximos 7 dias → Adiante**. Rotinas se concluem ali mesmo; o resto leva direto à tela de decisão.

## 2. Rotinas — o que se repete sai da sua cabeça
Cadastre uma vez (diária/semanal/quinzenal/mensal/trimestral, com responsável e prioridade) e clique em **Gerar ocorrências**. Elas aparecem no Meu Dia no dia certo.

Já vêm 7 rotinas sugeridas: RDO diário, relatório fotográfico semanal, reunião de obra, conciliação bancária, fechamento de medição (dia 25), conferência de certidões (Cl. 13.2) e revisão do fluxo de caixa.

O KPI **Aderência** mostra o % concluído no prazo — disciplina operacional medida, sem microgerenciar.

## 3. Qualidade (FVS) — evidência que vira medição
6 modelos prontos com itens e normas: Fundação (NBR 6122/6118), Estrutura Metálica (NBR 8800, AWS D1.1), Cobertura e Vedação (NBR 10844), Elétrica e SPDA (NBR 5410/5419), Hidráulica e Incêndio (NBR 5626/13714) e Piso Industrial (NBR 12655).

**Fluxo:** contratada abre a inspeção → marca cada item **C / NC / N/A** com observação → finaliza (o sistema classifica: aprovado, com ressalvas ou reprovado, e lista as pendências) → **contratante valida**.

Vincule a FVS ao evento de medição: ela vira evidência técnica documental (Cl. 3.4) e reduz retrabalho.

## 4. Metas — o número que importa
Cards com alvo, realizado, barra e % de atingimento (verde ≥100%, amarelo ≥70%, vermelho abaixo).

**Automáticas** (calculadas pelo sistema, sem digitação): avanço físico-financeiro da obra, RDOs no mês, margem bruta da carteira, aderência às rotinas.
**Manuais:** crie qualquer indicador e atualize o realizado com um clique.

## Rotina sugerida (o ganho real)
- **Manhã (5 min):** abra **Meu Dia**. Se está vazio, o dia é seu.
- **Segunda (15 min):** Financeiro → Agenda + Fluxo de caixa. Metas → o que saiu do trilho.
- **Ao aprovar medição/compra:** o financeiro se atualiza sozinho.
- **Mensal:** DRE por obra (margem real) + aderência às rotinas.
