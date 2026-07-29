-- ============================================================
-- RECEBIMENTO DE MATERIAIS — Fatia 1 (núcleo)
--
-- O campo confere item a item o que chega de um pedido aprovado
-- (recebimento parcial, acumulativo). Divergência (item recusado, ou
-- quantidade recebida diferente da pedida quando a entrega é marcada como
-- final) trava o pagamento do lançamento que veio daquele pedido.
--
-- PRÉ-REQUISITO DE SEGURANÇA (seção 1 deste arquivo): a policy de leitura
-- de `cotacoes` estava sem checar papel — qualquer papel vinculado à obra
-- (inclusive contratada/campo) conseguia ler valor_total e fornecedor via
-- API direta, apesar de a tela só esconder os BOTÕES de aprovar/recusar.
-- Corrige isso antes de criar a tela de recebimento "sem custo" — não faz
-- sentido construir uma tela nova protegida do lado de um vazamento aberto.
-- `pedidos_materiais` NÃO é restringida aqui (ver comentário na seção 1) —
-- ela não carrega custo estruturado, e apertar sua leitura quebra o fluxo
-- de criação de pedido pela própria contratada (insert().select() deixa
-- de devolver a linha recém-criada).
--
-- Idempotente: create table if not exists / create or replace view /
-- create or replace function / drop policy + create policy. Rodar de novo
-- não altera dados nem quebra o que existe.
-- ============================================================

-- ---------- 1) RLS: cotações só para admin/contratante ----------
-- cotacoes só tem valor/fornecedor — dado que campo não precisa e não pode
-- ver. pedidos_materiais fica como está (pode_ver_obra, sem checar papel):
-- não tem coluna de custo estruturado, e restringir quebraria o insert
-- da própria contratada (insert().select() não devolveria a linha).
drop policy if exists "cotacoes: leitura" on public.cotacoes;
create policy "cotacoes: leitura" on public.cotacoes for select to authenticated
  using (
    public.papel_atual() in ('admin','contratante')
    and exists (select 1 from public.pedidos_materiais p where p.id = pedido_id and public.pode_ver_obra(p.obra_id))
  );

-- ---------- 2) TABELAS recebimento / recebimento_item ----------
-- pedidos_materiais.itens é jsonb sem id estável (cada item só existe como
-- posição no array; nunca é alterado após o insert em nenhum código deste
-- repo). pedido_item_idx referencia essa posição (0-based, igual o
-- .map((it,i)) que o resto do código já usa); descricao/unidade/qtd_pedida
-- ficam copiadas em recebimento_item para não depender de o array nunca
-- mudar. Nenhuma coluna de valor em nenhuma das duas tabelas.

create table if not exists public.recebimento (
  id bigint generated always as identity primary key,
  obra_id bigint not null references public.obras(id) on delete cascade,
  empresa_id bigint not null,
  pedido_id bigint not null references public.pedidos_materiais(id) on delete cascade,
  recebido_por uuid references public.profiles(id),
  recebido_em timestamptz not null default now(),
  -- marca que esta é a última entrega esperada do pedido — só a partir
  -- daqui "recebido ≠ pedido" passa a valer como divergência (recebimento
  -- parcial em andamento não é divergência)
  final_do_pedido boolean not null default false,
  observacao text,
  status text not null default 'registrado' check (status in ('registrado','resolvido','cancelado')),
  criado_em timestamptz not null default now()
);

create table if not exists public.recebimento_item (
  id bigint generated always as identity primary key,
  recebimento_id bigint not null references public.recebimento(id) on delete cascade,
  obra_id bigint not null,
  pedido_item_idx int not null,
  descricao text not null,
  unidade text,
  qtd_pedida numeric not null,
  qtd_recebida numeric not null default 0,
  qtd_aceita numeric not null default 0,
  qtd_recusada numeric not null default 0,
  motivo_recusa text,
  foto_path text,
  check (qtd_aceita + qtd_recusada <= qtd_recebida)
);

create index if not exists idx_receb_pedido on public.recebimento(pedido_id);
create index if not exists idx_receb_obra on public.recebimento(obra_id);
create index if not exists idx_recebitem_receb on public.recebimento_item(recebimento_id);

-- empresa_id nasce do obra_id, carimbado no servidor — mesmo espírito do
-- carimba_empresa() geral (migracao-multiempresa.sql), mas dedicado aqui
-- pra não mexer no array de tabelas daquele trigger.
create or replace function public.carimba_empresa_recebimento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.empresa_id := coalesce(new.empresa_id, (select empresa_id from public.obras where id = new.obra_id));
  return new;
end $$;

drop trigger if exists trg_empresa_recebimento on public.recebimento;
create trigger trg_empresa_recebimento before insert on public.recebimento
  for each row execute function public.carimba_empresa_recebimento();

-- ---------- 3) RLS recebimento / recebimento_item ----------
-- Campo (qualquer papel vinculado à obra) insere e lê; só admin/contratante
-- atualiza (resolver ou cancelar um recebimento). Nenhuma coluna de valor
-- em nenhuma das duas tabelas, então não há necessidade de filtrar por
-- papel na leitura.
alter table public.recebimento enable row level security;
alter table public.recebimento_item enable row level security;

drop policy if exists "recebimento: leitura" on public.recebimento;
create policy "recebimento: leitura" on public.recebimento for select to authenticated
  using (public.pode_ver_obra(obra_id));

drop policy if exists "recebimento: inserir" on public.recebimento;
create policy "recebimento: inserir" on public.recebimento for insert to authenticated
  with check (public.pode_ver_obra(obra_id) and recebido_por = auth.uid());

drop policy if exists "recebimento: atualizar" on public.recebimento;
create policy "recebimento: atualizar" on public.recebimento for update to authenticated
  using (public.pode_ver_obra(obra_id) and public.papel_atual() in ('admin','contratante'))
  with check (public.papel_atual() in ('admin','contratante'));

drop policy if exists "recebimento_item: leitura" on public.recebimento_item;
create policy "recebimento_item: leitura" on public.recebimento_item for select to authenticated
  using (public.pode_ver_obra(obra_id));

drop policy if exists "recebimento_item: inserir" on public.recebimento_item;
create policy "recebimento_item: inserir" on public.recebimento_item for insert to authenticated
  with check (public.pode_ver_obra(obra_id));

drop policy if exists "recebimento_item: atualizar" on public.recebimento_item;
create policy "recebimento_item: atualizar" on public.recebimento_item for update to authenticated
  using (public.pode_ver_obra(obra_id) and public.papel_atual() in ('admin','contratante'))
  with check (public.papel_atual() in ('admin','contratante'));

-- ---------- 4) VIEWS LIMPAS PARA O CAMPO (sem custo) ----------
-- Mesmo padrão de evento_cliente/pedido_cliente (migracao-cliente-base.sql):
-- security_invoker = false + filtro EXISTS escrito na própria query, não
-- security_invoker = true. Nunca selecionam cotacao_vencedora,
-- motivo_decisao (pode conter comentário de preço) nem compra_info.

create or replace view public.pedido_campo
with (security_invoker = false) as
select p.id, p.obra_id, p.titulo, p.justificativa, p.necessidade, p.itens, p.status, p.evento_id
from public.pedidos_materiais p
where p.status in ('aprovado', 'comprado')
  and exists (select 1 from public.obra_usuarios ou where ou.obra_id = p.obra_id and ou.usuario_id = auth.uid());

-- Item, unidade, pedida, recebida acumulada, saldo. Nenhuma coluna de valor.
create or replace view public.pedido_item_campo
with (security_invoker = false) as
select
  p.id as pedido_id, p.obra_id, p.titulo,
  (t.ord - 1)::int as item_idx,
  t.item->>'descricao' as descricao,
  t.item->>'unidade' as unidade,
  (t.item->>'qtd')::numeric as qtd_pedida,
  coalesce(rec.qtd_recebida, 0) as qtd_recebida,
  coalesce(rec.qtd_aceita, 0) as qtd_aceita,
  greatest((t.item->>'qtd')::numeric - coalesce(rec.qtd_aceita, 0), 0) as saldo
from public.pedidos_materiais p
cross join lateral jsonb_array_elements(p.itens) with ordinality as t(item, ord)
left join (
  select r.pedido_id, ri.pedido_item_idx,
         sum(ri.qtd_recebida) as qtd_recebida, sum(ri.qtd_aceita) as qtd_aceita
  from public.recebimento_item ri
  join public.recebimento r on r.id = ri.recebimento_id
  where r.status = 'registrado'
  group by r.pedido_id, ri.pedido_item_idx
) rec on rec.pedido_id = p.id and rec.pedido_item_idx = (t.ord - 1)::int
where p.status in ('aprovado', 'comprado')
  and exists (select 1 from public.obra_usuarios ou where ou.obra_id = p.obra_id and ou.usuario_id = auth.uid());

-- ---------- 5) DIVERGÊNCIA E TRAVA DE PAGAMENTO ----------
-- Divergência de um pedido: algum item foi recusado (qtd_recusada > 0,
-- vale a qualquer momento) OU — só depois que alguma entrega for marcada
-- como final_do_pedido — a quantidade recebida acumulada de algum item
-- ainda não bate com a quantidade pedida. Só conta recebimento com
-- status='registrado' (resolvido/cancelado saem da conta).
create or replace function public.pedido_tem_divergencia(p_pedido_id bigint) returns boolean
language sql stable as $$
  with itens as (
    select (t.ord - 1)::int as idx, (t.item->>'qtd')::numeric as qtd_pedida
    from public.pedidos_materiais p
    cross join lateral jsonb_array_elements(p.itens) with ordinality as t(item, ord)
    where p.id = p_pedido_id
  ),
  recebido as (
    select ri.pedido_item_idx as idx,
           sum(ri.qtd_recebida) as qtd_recebida,
           sum(ri.qtd_recusada) as qtd_recusada
    from public.recebimento_item ri
    join public.recebimento r on r.id = ri.recebimento_id
    where r.pedido_id = p_pedido_id and r.status = 'registrado'
    group by ri.pedido_item_idx
  ),
  tem_final as (
    select exists(
      select 1 from public.recebimento
      where pedido_id = p_pedido_id and status = 'registrado' and final_do_pedido
    ) as sim
  )
  select
    coalesce(bool_or(recebido.qtd_recusada > 0), false)
    or (
      (select sim from tem_final)
      and coalesce(bool_or(recebido.qtd_recebida is distinct from itens.qtd_pedida), false)
    )
  from itens left join recebido on recebido.idx = itens.idx;
$$;

-- Trava real: nenhum caminho de escrita (UI de hoje, uma chamada futura a
-- mudarStatus com 'pago', acesso direto à API) consegue marcar como pago
-- um lançamento de pedido com divergência aberta. Só afeta lançamentos
-- 'pagar'/'pedido' — gerar_pagar_do_pedido() nunca gera 'receber' a partir
-- de pedido, então recebíveis e lançamentos manuais não são tocados.
create or replace function public.bloqueia_pagamento_com_divergencia() returns trigger
language plpgsql as $$
begin
  if new.status = 'pago' and old.status is distinct from new.status
     and new.origem = 'pedido' and new.natureza = 'pagar' then
    if public.pedido_tem_divergencia(new.origem_id::bigint) then
      raise exception 'Lançamento não pode ser pago: pedido % tem divergência de recebimento em aberto.', new.origem_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_bloqueia_pagamento on public.lancamentos;
create trigger trg_bloqueia_pagamento before update on public.lancamentos
  for each row execute function public.bloqueia_pagamento_com_divergencia();
