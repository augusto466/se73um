-- ============================================================
-- CLIENTE + PAINEL_CEO — BASE (documentacao do estado atual)
-- ============================================================
-- ATENCAO: estas views e a tabela JA EXISTEM no banco. Foram criadas
-- via SQL Editor e nunca versionadas (ou a versao no git esta
-- desatualizada em relacao ao banco vivo). Este arquivo registra o
-- estado REAL atual, extraido via pg_get_viewdef / pg_policies.
--
-- Idempotente. Rodar de novo NAO altera dados. Serve como planta de
-- reconstrucao e fonte de verdade versionada.
--
-- >>> NOTA DE SEGURANCA (importante) <<<
-- As views do papel cliente NAO sao consistentes em security_invoker:
--   obra_cliente    : security_invoker = TRUE  (respeita a RLS de baixo)
--   evento_cliente  : security_invoker = FALSE (roda como dono)
--   pedido_cliente  : security_invoker = FALSE (roda como dono)
--   painel_ceo      : security_invoker = FALSE (roda como dono)
-- evento_cliente e pedido_cliente NAO vazam hoje porque tem o filtro
-- de seguranca ESCRITO NA PROPRIA QUERY (EXISTS em obra_usuarios com
-- auth.uid()). Ou seja: a protecao depende do WHERE interno, nao da RLS.
-- Se criar nova view do cliente, OU replique o EXISTS, OU use
-- security_invoker=true. Nao confie so no invoker=false sem o filtro.
--
-- >>> NOTA DE CONSISTENCIA (margem) <<<
-- painel_ceo calcula margem_atual = medido - custo_comprado, onde
-- custo_comprado vem de pedidos_materiais (status aprovado/comprado).
-- Ja a view orcamento_item_controle calcula "contratado" a partir de
-- lancamento_item (apropriacao). Sao DUAS fontes para "custo ja
-- comprometido" e podem divergir. Se um dia a margem do cockpit e o
-- contratado do orcamento nao baterem, a causa e esta.
-- ============================================================

-- 1. VIEW painel_ceo -----------------------------------------
-- Fonte consolidada por obra (cockpit CEO). security_invoker = false
-- (explicito; no banco aparece como default/null, mesmo efeito).
create or replace view painel_ceo
with (security_invoker = false) as
select o.id as obra_id, o.codigo, o.nome, o.cliente, o.status,
  o.valor_global, o.entrega_final, o.mes_atual, o.meses,
  coalesce(m.medido, 0::numeric) as medido,
  case when o.valor_global > 0::numeric
       then coalesce(m.medido, 0::numeric) / o.valor_global * 100::numeric
       else 0::numeric end as avanco_pct,
  coalesce(orc.custo, 0::numeric)   as custo_orcado,
  coalesce(orc.preco, 0::numeric)   as preco_orcado,
  coalesce(cmp.comprado, 0::numeric) as custo_comprado,
  coalesce(fin.a_receber, 0::numeric) as a_receber,
  coalesce(fin.a_pagar, 0::numeric)   as a_pagar,
  coalesce(m.medido, 0::numeric) - coalesce(cmp.comprado, 0::numeric) as margem_atual,
  coalesce(v.em_validacao, 0::bigint)  as em_validacao,
  coalesce(pd.aguardando, 0::bigint)   as pedidos_aguardando,
  coalesce(dc.docs_vencidos, 0::bigint) as docs_vencidos,
  coalesce(q.nc_abertas, 0::bigint)    as fvs_reprovadas
from obras o
left join lateral (
  select sum(e.valor_bruto - coalesce(e.valor_glosa, 0::numeric)) as medido
  from eventos e where e.obra_id = o.id and e.status in ('aprovado','glosado')
) m on true
left join lateral (
  select sum(custo_orcado) as custo, sum(valor_orcado) as preco
  from orcamento where obra_id = o.id
) orc on true
left join lateral (
  select sum(c.valor_total) as comprado
  from pedidos_materiais p join cotacoes c on c.id = p.cotacao_vencedora
  where p.obra_id = o.id and p.status in ('aprovado','comprado')
) cmp on true
left join lateral (
  select sum(case when natureza='receber' then valor else 0::numeric end) as a_receber,
         sum(case when natureza='pagar'   then valor else 0::numeric end) as a_pagar
  from lancamentos where obra_id = o.id and status in ('previsto','confirmado')
) fin on true
left join lateral (
  select count(*) as em_validacao from eventos
  where obra_id = o.id and status = 'validacao'
) v on true
left join lateral (
  select count(*) as aguardando from pedidos_materiais
  where obra_id = o.id and status = 'enviado'
) pd on true
left join lateral (
  select count(*) as docs_vencidos from documentos
  where (obra_id = o.id or obra_id is null)
    and validade is not null and validade < current_date
) dc on true
left join lateral (
  select count(*) as nc_abertas from fvs_inspecoes
  where obra_id = o.id and resultado in ('reprovado','aprovado_ressalvas')
) q on true;

-- 2. VIEW obra_cliente ---------------------------------------
-- Recorte de painel_ceo SEM custo/preco/margem — o cliente nunca ve
-- custo nem margem. security_invoker = TRUE.
create or replace view obra_cliente
with (security_invoker = true) as
select obra_id, codigo, nome, cliente, status, valor_global, entrega_final,
       mes_atual, meses, medido, avanco_pct, em_validacao, docs_vencidos
from painel_ceo;

-- 3. VIEW evento_cliente -------------------------------------
-- Eventos da obra do cliente. security_invoker = FALSE — protegida
-- pelo EXISTS interno (obra_usuarios + auth.uid()), NAO pela RLS.
create or replace view evento_cliente
with (security_invoker = false) as
select id, obra_id, etapa, descricao, status, valor_bruto, mes,
       base_inicio, base_fim, prev_inicio, prev_fim, real_inicio, real_fim,
       duracao_dias, critico
from eventos e
where exists (
  select 1 from obra_usuarios ou
  where ou.obra_id = e.obra_id and ou.usuario_id = auth.uid()
);

-- 4. VIEW pedido_cliente -------------------------------------
-- Pedidos de faturamento direto. Mostra valor_faturado (o que o
-- cliente paga), NUNCA o valor negociado com fornecedor. Exclui
-- recusado/rascunho. security_invoker = FALSE — protegida pelo EXISTS.
create or replace view pedido_cliente
with (security_invoker = false) as
select p.id, p.obra_id, p.titulo, p.status, p.necessidade, e.etapa,
       c.valor_total as valor_faturado, c.fornecedor, p.itens
from pedidos_materiais p
join eventos e on e.id = p.evento_id and e.obra_id = p.obra_id
left join cotacoes c on c.id = p.cotacao_vencedora
where p.faturamento_direto = true
  and p.status <> all (array['recusado','rascunho'])
  and exists (
    select 1 from obra_usuarios ou
    where ou.obra_id = p.obra_id and ou.usuario_id = auth.uid()
  );

-- 5. TABELA pedido_decisao_cliente ---------------------------
-- Onde o cliente grava aprovacao/recusa/ajuste do faturamento direto.
-- Tabela separada do fluxo interno — preserva a integridade da auditoria.
-- (Colunas verificadas via information_schema. FK de pedido_id deduzida.)
create table if not exists pedido_decisao_cliente (
  id           bigint generated always as identity primary key,
  pedido_id    bigint not null references pedidos_materiais(id) on delete cascade,
  empresa_id   bigint,
  decisao      text,
  comentario   text,
  decidido_por uuid,
  decidido_em  timestamptz not null default now()
);

alter table pedido_decisao_cliente enable row level security;

drop policy if exists "decisao: cliente grava" on pedido_decisao_cliente;
create policy "decisao: cliente grava" on pedido_decisao_cliente for insert
with check (
  papel_atual() = 'cliente' and decidido_por = auth.uid()
  and exists (
    select 1 from pedidos_materiais p
    join obra_usuarios ou on ou.obra_id = p.obra_id and ou.usuario_id = auth.uid()
    where p.id = pedido_decisao_cliente.pedido_id and p.faturamento_direto = true
  )
);

drop policy if exists "decisao: cliente atualiza" on pedido_decisao_cliente;
create policy "decisao: cliente atualiza" on pedido_decisao_cliente for update
using      (papel_atual() = 'cliente' and decidido_por = auth.uid())
with check (decidido_por = auth.uid());

drop policy if exists "decisao: cliente le" on pedido_decisao_cliente;
create policy "decisao: cliente le" on pedido_decisao_cliente for select
using (
  (papel_atual() = 'cliente' and exists (
    select 1 from pedidos_materiais p
    join obra_usuarios ou on ou.obra_id = p.obra_id and ou.usuario_id = auth.uid()
    where p.id = pedido_decisao_cliente.pedido_id
  ))
  or papel_atual() in ('admin','contratante')
);
