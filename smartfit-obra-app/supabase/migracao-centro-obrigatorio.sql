-- ============================================================
-- MIGRAÇÃO CENTRO OBRIGATÓRIO — toda tarefa tem centro de custo.
--
-- Sem exceção: é o que garante que a métrica por centro nunca tenha buraco.
-- As tarefas antigas recebem um default sensato antes da trava entrar.
--
-- Rodar no SQL Editor do Supabase ANTES do push.
-- ============================================================

-- ---------- 1) CLASSIFICAR O QUE JÁ EXISTE ----------
-- Tarefa de obra é operação; tarefa da empresa fica em Administrativo
-- (revise depois em Tarefas: o filtro por centro mostra o que precisa de ajuste).
update public.tarefas set centro_id = 'cc_operacoes'
  where centro_id is null and obra_id is not null;
update public.tarefas set centro_id = 'cc_admin'
  where centro_id is null and obra_id is null;

-- ---------- 2) TRAVA ----------
alter table public.tarefas alter column centro_id set not null;
alter table public.tarefas alter column centro_id set default 'cc_operacoes';

-- ---------- 3) MÉTRICAS POR CENTRO DE CUSTO ----------
-- Coluna 3 = concluída (kanban: 0 a fazer, 1 fazendo, 2 revisão, 3 feito).
create or replace view public.metricas_centro as
select c.id as centro_id, c.nome as centro_nome, c.tipo,
       t.obra_id,
       count(*)                                                              as total,
       count(*) filter (where t.coluna < 3)                                  as abertas,
       count(*) filter (where t.coluna = 3)                                  as concluidas,
       count(*) filter (where t.coluna < 3 and t.prazo < current_date)       as atrasadas,
       count(*) filter (where t.coluna < 3 and t.prazo = current_date)       as vencem_hoje,
       count(*) filter (where t.coluna < 3 and t.prazo is null)              as sem_prazo,
       count(*) filter (where t.coluna < 3 and t.prioridade = 'alta')        as alta_prioridade,
       count(*) filter (where t.via_agente)                                  as via_advisor,
       round(
         100.0 * count(*) filter (where t.coluna = 3)
         / nullif(count(*), 0)
       , 1)                                                                  as pct_concluido,
       round(
         100.0 * count(*) filter (where t.coluna < 3 and t.prazo < current_date)
         / nullif(count(*) filter (where t.coluna < 3), 0)
       , 1)                                                                  as pct_atraso
from public.centros_custo c
join public.tarefas t on t.centro_id = c.id
where c.ativo
group by c.id, c.nome, c.tipo, c.ordem, t.obra_id
order by c.ordem;

-- ---------- 4) RESUMO CONSOLIDADO (todas as obras juntas) ----------
create or replace view public.metricas_centro_total as
select c.id as centro_id, c.nome as centro_nome, c.tipo,
       count(t.id)                                                           as total,
       count(t.id) filter (where t.coluna < 3)                               as abertas,
       count(t.id) filter (where t.coluna < 3 and t.prazo < current_date)    as atrasadas,
       count(t.id) filter (where t.coluna = 3)                               as concluidas,
       round(
         100.0 * count(t.id) filter (where t.coluna < 3 and t.prazo < current_date)
         / nullif(count(t.id) filter (where t.coluna < 3), 0)
       , 1)                                                                  as pct_atraso
from public.centros_custo c
left join public.tarefas t on t.centro_id = c.id
where c.ativo
group by c.id, c.nome, c.tipo, c.ordem
order by c.ordem;
