-- =====================================================================
-- MIGRAÇÃO 006 — FASE 4: APOIO À DECISÃO
-- Orçamento base (Proposta 328) · Painel do CEO · Curva ABC · Fornecedores
-- Execute no Supabase: SQL Editor > New query > cole tudo > Run
-- =====================================================================

-- ---------- 1) ORÇAMENTO BASE POR ETAPA ----------
create table if not exists public.orcamento (
  id bigint generated always as identity primary key,
  obra_id bigint not null references public.obras(id) on delete cascade,
  ordem int not null default 0,
  etapa text not null,               -- casa com eventos.etapa
  valor_orcado numeric not null default 0,
  observacoes text,
  criado_em timestamptz not null default now(),
  unique (obra_id, etapa)
);
create index if not exists idx_orc_obra on public.orcamento(obra_id);

alter table public.orcamento enable row level security;
drop policy if exists "orc: leitura" on public.orcamento;
drop policy if exists "orc: gerir"   on public.orcamento;
create policy "orc: leitura" on public.orcamento for select to authenticated
  using (public.pode_ver_obra(obra_id));
create policy "orc: gerir" on public.orcamento for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- ---------- 2) SEED: PROPOSTA 328 (obra TK-328/2026) ----------
do $$
declare v_obra bigint;
begin
  select id into v_obra from public.obras where codigo = 'TK-328/2026';
  if v_obra is not null then
    insert into public.orcamento (obra_id, ordem, etapa, valor_orcado, observacoes) values
    (v_obra,  1, 'Projetos Executivos',           63000.00,   'Proposta 328 — projetos e compatibilização'),
    (v_obra,  2, 'Administração / Mobilização',   72776.94,   'Etapa 1 — administrativo de obras'),
    (v_obra,  3, 'Serviços Preliminares',         63264.55,   'Etapa 2 — serviços preliminares'),
    (v_obra,  4, 'Movimentação de Terra',         240473.61,  'Etapa 3 — aterro mecanizado'),
    (v_obra,  5, 'Fundação e Arrimo',             557042.70,  'Etapa 4 — estacas, blocos, baldrames'),
    (v_obra,  6, 'Impermeabilização',             10368.90,   'Etapa 5'),
    (v_obra,  7, 'Instalações Gerais',            350949.89,  'Etapa 6 — elétrica, SPDA, hidro, incêndio, gás'),
    (v_obra,  8, 'Piso Industrial',               266693.32,  'Etapa 7 — piso térreo'),
    (v_obra,  9, 'Steel Deck',                    253057.55,  'Etapa 8'),
    (v_obra, 10, 'Estrutura Metálica',            1456563.44, 'Etapa 10 — maior item do orçamento'),
    (v_obra, 11, 'Vedação Externa',               281512.68,  'Etapa 11 — Isopainel PIR'),
    (v_obra, 12, 'Cobertura',                     276598.74,  'Etapa 12 — telha isotelha'),
    (v_obra, 13, 'Pintura',                       244713.48,  'Etapa 13'),
    (v_obra, 14, 'Estrutura / Transporte',        47016.20,   'Etapa 14 — transporte de cargas'),
    (v_obra, 15, 'Serviços Diversos',             10322.17,   'Etapa 15 — limpeza final'),
    (v_obra, 16, 'Pré-entrega',                   0,          'Sem valor orçado direto'),
    (v_obra, 17, 'Acabamentos / Testes',          0,          'Sem valor orçado direto'),
    (v_obra, 18, 'Entrega Final',                 0,          'Sem valor orçado direto')
    on conflict (obra_id, etapa) do nothing;
  end if;
end $$;

-- ---------- 3) VIEW: ORÇADO × CONTRATADO × COMPRADO POR ETAPA ----------
create or replace view public.desvio_etapa as
select o.obra_id,
       o.etapa,
       o.ordem,
       o.valor_orcado,
       coalesce(ev.contratado, 0) as valor_contratado,   -- soma dos eventos daquela etapa
       coalesce(ev.medido, 0)     as valor_medido,
       coalesce(pm.comprado, 0)   as valor_comprado,     -- pedidos aprovados vinculados
       coalesce(pm.comprado, 0) - o.valor_orcado as desvio_compra,
       case when o.valor_orcado > 0
            then (coalesce(pm.comprado,0) - o.valor_orcado) / o.valor_orcado * 100
            else 0 end as desvio_pct
from public.orcamento o
left join lateral (
  select sum(e.valor_bruto) as contratado,
         sum(case when e.status in ('aprovado','glosado')
                  then e.valor_bruto - coalesce(e.valor_glosa,0) else 0 end) as medido
  from public.eventos e where e.obra_id = o.obra_id and e.etapa = o.etapa
) ev on true
left join lateral (
  select sum(c.valor_total) as comprado
  from public.pedidos_materiais p
  join public.cotacoes c on c.id = p.cotacao_vencedora
  join public.eventos e on e.obra_id = p.obra_id and e.id = p.evento_id
  where p.obra_id = o.obra_id and e.etapa = o.etapa and p.status in ('aprovado','comprado')
) pm on true;

-- ---------- 4) VIEW: RANKING DE FORNECEDORES ----------
create or replace view public.ranking_fornecedores as
select c.fornecedor,
       max(c.cnpj) as cnpj,
       count(*) as cotacoes_apresentadas,
       count(*) filter (where p.cotacao_vencedora = c.id) as cotacoes_vencidas,
       case when count(*) > 0
            then count(*) filter (where p.cotacao_vencedora = c.id)::numeric / count(*) * 100
            else 0 end as taxa_vitoria,
       sum(c.valor_total) filter (where p.cotacao_vencedora = c.id) as valor_contratado,
       avg(c.valor_total) as ticket_medio,
       count(*) filter (where p.status = 'comprado' and p.cotacao_vencedora = c.id) as compras_efetivadas
from public.cotacoes c
join public.pedidos_materiais p on p.id = c.pedido_id
group by c.fornecedor;

-- ---------- 5) VIEW: CURVA ABC DE COMPRAS ----------
create or replace view public.curva_abc as
with base as (
  select p.obra_id, p.titulo as item, c.fornecedor, c.valor_total as valor
  from public.pedidos_materiais p
  join public.cotacoes c on c.id = p.cotacao_vencedora
  where p.status in ('aprovado','comprado')
),
tot as (select obra_id, sum(valor) as total from base group by obra_id),
ord as (
  select b.*, t.total,
         sum(b.valor) over (partition by b.obra_id order by b.valor desc
                            rows between unbounded preceding and current row) as acumulado
  from base b join tot t on t.obra_id = b.obra_id
)
select obra_id, item, fornecedor, valor, total,
       valor / nullif(total,0) * 100 as pct_item,
       acumulado / nullif(total,0) * 100 as pct_acumulado,
       case when acumulado / nullif(total,0) <= 0.8 then 'A'
            when acumulado / nullif(total,0) <= 0.95 then 'B'
            else 'C' end as classe
from ord;

-- ---------- 6) VIEW: PAINEL EXECUTIVO (uma linha por obra) ----------
create or replace view public.painel_ceo as
select o.id as obra_id, o.codigo, o.nome, o.cliente, o.status,
       o.valor_global, o.entrega_final, o.mes_atual, o.meses,
       coalesce(m.medido, 0) as medido,
       case when o.valor_global > 0 then coalesce(m.medido,0) / o.valor_global * 100 else 0 end as avanco_pct,
       coalesce(orc.orcado, 0) as custo_orcado,
       coalesce(cmp.comprado, 0) as custo_comprado,
       coalesce(fin.a_receber, 0) as a_receber,
       coalesce(fin.a_pagar, 0) as a_pagar,
       coalesce(m.medido,0) - coalesce(cmp.comprado,0) as margem_atual,
       coalesce(v.em_validacao, 0) as em_validacao,
       coalesce(pd.aguardando, 0) as pedidos_aguardando,
       coalesce(dc.docs_vencidos, 0) as docs_vencidos,
       coalesce(q.nc_abertas, 0) as fvs_reprovadas
from public.obras o
left join lateral (
  select sum(e.valor_bruto - coalesce(e.valor_glosa,0)) as medido
  from public.eventos e where e.obra_id = o.id and e.status in ('aprovado','glosado')
) m on true
left join lateral (
  select sum(valor_orcado) as orcado from public.orcamento where obra_id = o.id
) orc on true
left join lateral (
  select sum(c.valor_total) as comprado
  from public.pedidos_materiais p join public.cotacoes c on c.id = p.cotacao_vencedora
  where p.obra_id = o.id and p.status in ('aprovado','comprado')
) cmp on true
left join lateral (
  select sum(case when natureza='receber' then valor else 0 end) as a_receber,
         sum(case when natureza='pagar' then valor else 0 end) as a_pagar
  from public.lancamentos where obra_id = o.id and status in ('previsto','confirmado')
) fin on true
left join lateral (
  select count(*) as em_validacao from public.eventos where obra_id = o.id and status = 'validacao'
) v on true
left join lateral (
  select count(*) as aguardando from public.pedidos_materiais where obra_id = o.id and status = 'enviado'
) pd on true
left join lateral (
  select count(*) as docs_vencidos from public.documentos
  where (obra_id = o.id or obra_id is null) and validade is not null and validade < current_date
) dc on true
left join lateral (
  select count(*) as nc_abertas from public.fvs_inspecoes
  where obra_id = o.id and resultado in ('reprovado','aprovado_ressalvas')
) q on true;
