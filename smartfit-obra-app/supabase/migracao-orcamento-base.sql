-- ============================================================
-- ORCAMENTO — BASE (documentacao do estado atual)
-- ============================================================
-- ATENCAO: estas tabelas, view e policies JA EXISTEM no banco.
-- Foram criadas via SQL Editor do Supabase em sessoes anteriores e
-- nunca haviam sido versionadas. Este arquivo registra a estrutura
-- atual no repositorio — a "planta" do que hoje so vive no Supabase.
--
-- E idempotente (if not exists / or replace / drop-then-create nas
-- policies): rodar de novo NAO altera dados nem quebra o que existe.
-- Serve como fonte de verdade versionada e para reconstruir do zero
-- em caso de perda do banco.
-- ============================================================

-- 1. TABELA orcamento_item -----------------------------------
-- Os itens do orcamento executivo (84 na TK-328). custo_orcado e o
-- custo executivo (venda_ajustada / (1+bdi_pct)); a soma e o teto de
-- contratacao da obra.
create table if not exists orcamento_item (
  id                bigint generated always as identity primary key,
  obra_id           bigint not null references obras(id) on delete cascade,
  empresa_id        bigint not null,
  orcamento_id      bigint references orcamento(id) on delete set null,
  etapa_num         integer,
  codigo            text not null,
  grupo             text,
  descricao         text not null,
  unidade           text,
  quantidade        numeric,
  pu_venda_original numeric,
  venda_original    numeric,
  venda_ajustada    numeric not null default 0,
  custo_orcado      numeric not null default 0,
  bdi_pct           numeric not null default 0.28,
  fonte             text,
  ordem             integer,
  criado_em         timestamptz not null default now(),
  unique (obra_id, codigo)
);

create index if not exists idx_orcitem_obra on orcamento_item (obra_id);
create index if not exists idx_orcitem_orc  on orcamento_item (orcamento_id);

-- 2. TABELA lancamento_item ----------------------------------
-- Apropriacao: liga um lancamento a um ou mais itens do orcamento,
-- rateado por valor. Base do "contratado" e do "realizado".
create table if not exists lancamento_item (
  id            bigint generated always as identity primary key,
  lancamento_id bigint not null references lancamentos(id) on delete cascade,
  item_id       bigint not null references orcamento_item(id) on delete cascade,
  obra_id       bigint not null,
  valor         numeric not null check (valor > 0),
  criado_em     timestamptz not null default now(),
  unique (lancamento_id, item_id)
);

create index if not exists idx_lancitem_lanc on lancamento_item (lancamento_id);
create index if not exists idx_lancitem_item on lancamento_item (item_id);

-- 3. VIEW orcamento_item_controle ----------------------------
-- Orcado x contratado x realizado x saldo x desvio, por item.
--   contratado = apropriado, natureza pagar, status previsto/confirmado/pago
--   realizado  = apropriado, natureza pagar, status pago
-- (definicao extraida de pg_get_viewdef — reflete o banco atual)
create or replace view orcamento_item_controle as
select
  oi.id, oi.obra_id, oi.orcamento_id, oi.etapa_num, oi.codigo, oi.grupo,
  oi.descricao, oi.unidade, oi.quantidade, oi.venda_ajustada, oi.custo_orcado,
  oi.ordem,
  coalesce(c.contratado, 0::numeric) as contratado,
  coalesce(r.realizado, 0::numeric)  as realizado,
  oi.custo_orcado - coalesce(c.contratado, 0::numeric) as saldo_a_contratar,
  oi.custo_orcado - coalesce(r.realizado, 0::numeric)  as saldo_a_realizar,
  case when oi.custo_orcado > 0::numeric
       then round(coalesce(r.realizado, 0::numeric) / oi.custo_orcado, 4)
       else 0::numeric end as pct_realizado,
  case when oi.custo_orcado > 0::numeric
       then round((coalesce(r.realizado, 0::numeric) - oi.custo_orcado) / oi.custo_orcado, 4)
       else 0::numeric end as desvio_pct
from orcamento_item oi
left join (
  select li.item_id, sum(li.valor) as contratado
  from lancamento_item li
  join lancamentos l on l.id = li.lancamento_id
  where l.natureza = 'pagar' and l.status in ('previsto','confirmado','pago')
  group by li.item_id
) c on c.item_id = oi.id
left join (
  select li.item_id, sum(li.valor) as realizado
  from lancamento_item li
  join lancamentos l on l.id = li.lancamento_id
  where l.natureza = 'pagar' and l.status = 'pago'
  group by li.item_id
) r on r.item_id = oi.id;

-- 4. RLS — so gestor (admin/contratante) ---------------------
-- Custo item a item revela margem: e o dado mais sensivel do sistema.
alter table orcamento_item  enable row level security;
alter table lancamento_item enable row level security;

drop policy if exists "orcitem: gestor" on orcamento_item;
create policy "orcitem: gestor" on orcamento_item for all
using      (pode_ver_obra(obra_id) and papel_atual() in ('admin','contratante'))
with check (pode_ver_obra(obra_id) and papel_atual() in ('admin','contratante'));

drop policy if exists "lancitem: gestor" on lancamento_item;
create policy "lancitem: gestor" on lancamento_item for all
using      (pode_ver_obra(obra_id) and papel_atual() in ('admin','contratante'))
with check (pode_ver_obra(obra_id) and papel_atual() in ('admin','contratante'));
