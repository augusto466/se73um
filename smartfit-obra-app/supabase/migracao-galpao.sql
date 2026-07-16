-- ============================================================
-- MIGRAÇÃO GALPÃO — premissas de engenharia.
--
-- O motor paramétrico orça por índice médio (kg/m² de uma obra anterior).
-- Este orça por CÁLCULO: a estrutura sai das tabelas do manual Gerdau, o
-- fechamento sai da geometria com desconto de porta, a fundação sai das
-- reações do pórtico.
--
-- Rodar no SQL Editor do Supabase ANTES do push.
-- ============================================================

-- ---------- 1) PREMISSAS DE ENGENHARIA ----------
alter table public.oportunidade_premissas add column if not exists metodo text
  not null default 'parametrico' check (metodo in ('parametrico','engenharia'));

-- geometria
alter table public.oportunidade_premissas add column if not exists vao numeric(8,2);
alter table public.oportunidade_premissas add column if not exists comprimento numeric(8,2);
alter table public.oportunidade_premissas add column if not exists espacamento_portico numeric(6,2) default 6;
alter table public.oportunidade_premissas add column if not exists inclinacao_pct numeric(5,2) default 10;

-- vento (NBR 6123) — em GO a isopleta é 30 m/s
alter table public.oportunidade_premissas add column if not exists v0 numeric(5,2) default 30;

-- composição
alter table public.oportunidade_premissas add column if not exists tipo_fechamento text
  check (tipo_fechamento in ('alvenaria_total','alvenaria_parcial','isopainel','tp40'));
alter table public.oportunidade_premissas add column if not exists altura_alvenaria numeric(6,2);
alter table public.oportunidade_premissas add column if not exists tipo_cobertura_galpao text
  check (tipo_cobertura_galpao in ('tp40_branca','tp40_galvanizada','isotermica_pir'));
alter table public.oportunidade_premissas add column if not exists tipo_piso_galpao text
  check (tipo_piso_galpao in ('industrial_20','industrial_25','industrial_30','polido','nenhum'));
alter table public.oportunidade_premissas add column if not exists espessura_piso numeric(5,2) default 14;
alter table public.oportunidade_premissas add column if not exists area_terreno numeric(12,2);

-- portas: [{tipo, largura, altura, quantidade}] — a área delas sai do fechamento
alter table public.oportunidade_premissas add column if not exists portas jsonb not null default '[]';

-- fundação: sem sondagem, é premissa explícita — não cálculo
alter table public.oportunidade_premissas add column if not exists capacidade_estaca_tf numeric(8,2);
alter table public.oportunidade_premissas add column if not exists tem_sondagem_spt boolean not null default false;

-- ---------- 2) MEMÓRIA DE CÁLCULO DA PROPOSTA ----------
-- Guarda o que o motor calculou: perfis, peso, reações, geometria. É o que
-- permite defender o número numa negociação e conferir depois.
alter table public.propostas add column if not exists memoria_calculo jsonb;
alter table public.propostas add column if not exists metodo text
  not null default 'parametrico' check (metodo in ('parametrico','engenharia','manual'));
