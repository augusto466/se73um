-- =====================================================================
-- MIGRAÇÃO 003 — MÓDULO FINANCEIRO
-- Contas a pagar/receber · Agenda de pagamentos · Fluxo de caixa · DRE
-- Execute no Supabase: SQL Editor > New query > cole tudo > Run
-- Seguro com o sistema no ar: só adiciona, não altera o que existe.
-- =====================================================================

-- ---------- 1) PLANO DE CONTAS (categorias) ----------
create table if not exists public.categorias_financeiras (
  id text primary key,
  nome text not null,
  tipo text not null check (tipo in ('receita','custo_direto','despesa_operacional','despesa_administrativa','tributo','financeiro')),
  ordem int not null default 0
);

insert into public.categorias_financeiras (id, nome, tipo, ordem) values
  ('rec_medicao',    'Medições de obra',              'receita', 1),
  ('rec_outras',     'Outras receitas',               'receita', 2),
  ('cd_material',    'Materiais',                     'custo_direto', 10),
  ('cd_mao_obra',    'Mão de obra / subcontratados',  'custo_direto', 11),
  ('cd_equipamento', 'Equipamentos e locações',       'custo_direto', 12),
  ('cd_transporte',  'Transporte e logística',        'custo_direto', 13),
  ('cd_projeto',     'Projetos e consultorias',       'custo_direto', 14),
  ('cd_outros',      'Outros custos de obra',         'custo_direto', 15),
  ('do_canteiro',    'Canteiro e administração local','despesa_operacional', 20),
  ('do_seguro',      'Seguros e garantias',           'despesa_operacional', 21),
  ('da_pessoal',     'Folha e pró-labore',            'despesa_administrativa', 30),
  ('da_escritorio',  'Escritório e utilidades',       'despesa_administrativa', 31),
  ('da_servicos',    'Serviços (contab., jurídico, TI)','despesa_administrativa', 32),
  ('trib_impostos',  'Impostos sobre faturamento',    'tributo', 40),
  ('fin_bancario',   'Tarifas, juros e financiamentos','financeiro', 50)
on conflict (id) do nothing;

-- ---------- 2) LANÇAMENTOS FINANCEIROS ----------
-- Um único modelo para pagar/receber: `natureza` define o lado.
create table if not exists public.lancamentos (
  id bigint generated always as identity primary key,
  obra_id bigint references public.obras(id) on delete cascade,  -- null = despesa da empresa (rateio geral)
  natureza text not null check (natureza in ('pagar','receber')),
  categoria_id text references public.categorias_financeiras(id),
  descricao text not null,
  contraparte text,                       -- fornecedor ou cliente
  documento text,                         -- NF, pedido de compra, contrato
  valor numeric not null check (valor >= 0),
  vencimento date not null,
  competencia date,                       -- regime de competência (DRE)
  status text not null default 'previsto' check (status in ('previsto','confirmado','pago','recebido','cancelado')),
  pago_em date,
  valor_pago numeric,
  forma_pagamento text,
  parcela int not null default 1,
  total_parcelas int not null default 1,
  origem text not null default 'manual' check (origem in ('manual','pedido','medicao','recorrente')),
  origem_id text,                         -- id do pedido/evento que gerou
  observacoes text,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_lanc_obra   on public.lancamentos(obra_id);
create index if not exists idx_lanc_venc   on public.lancamentos(vencimento);
create index if not exists idx_lanc_status on public.lancamentos(status);
create index if not exists idx_lanc_nat    on public.lancamentos(natureza);

-- ---------- 3) DESPESAS RECORRENTES (aluguel, folha, software...) ----------
create table if not exists public.recorrentes (
  id bigint generated always as identity primary key,
  obra_id bigint references public.obras(id) on delete cascade,
  natureza text not null default 'pagar' check (natureza in ('pagar','receber')),
  categoria_id text references public.categorias_financeiras(id),
  descricao text not null,
  contraparte text,
  valor numeric not null,
  dia_vencimento int not null check (dia_vencimento between 1 and 28),
  inicio date not null,
  fim date,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------- 4) SALDO INICIAL DE CAIXA ----------
create table if not exists public.caixa_config (
  id int primary key default 1,
  saldo_inicial numeric not null default 0,
  data_saldo date not null default current_date,
  atualizado_em timestamptz not null default now(),
  constraint uma_linha check (id = 1)
);
insert into public.caixa_config (id, saldo_inicial, data_saldo)
values (1, 0, current_date) on conflict (id) do nothing;

-- ---------- 5) RLS ----------
alter table public.categorias_financeiras enable row level security;
alter table public.lancamentos            enable row level security;
alter table public.recorrentes            enable row level security;
alter table public.caixa_config           enable row level security;

drop policy if exists "categorias: leitura" on public.categorias_financeiras;
create policy "categorias: leitura" on public.categorias_financeiras for select to authenticated using (true);

-- Financeiro é sensível: admin vê tudo; contratante vê o das SUAS obras;
-- contratada NÃO acessa (evita expor margem/custos entre partes).
drop policy if exists "lanc: leitura"   on public.lancamentos;
drop policy if exists "lanc: gerir"     on public.lancamentos;
create policy "lanc: leitura" on public.lancamentos for select to authenticated
  using (
    public.eh_admin()
    or (public.papel_atual() = 'contratante' and obra_id is not null and public.pode_ver_obra(obra_id))
  );
create policy "lanc: gerir" on public.lancamentos for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists "recor: leitura" on public.recorrentes;
drop policy if exists "recor: gerir"   on public.recorrentes;
create policy "recor: leitura" on public.recorrentes for select to authenticated using (public.eh_admin());
create policy "recor: gerir"   on public.recorrentes for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists "caixa: leitura" on public.caixa_config;
drop policy if exists "caixa: gerir"   on public.caixa_config;
create policy "caixa: leitura" on public.caixa_config for select to authenticated using (public.eh_admin());
create policy "caixa: gerir"   on public.caixa_config for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- ---------- 6) AUTOMAÇÃO: PEDIDO APROVADO -> CONTA A PAGAR ----------
create or replace function public.gerar_pagar_do_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cot record; v_venc date;
begin
  -- dispara quando o pedido é aprovado ou marcado como comprado
  if new.status in ('aprovado','comprado') and new.cotacao_vencedora is not null
     and (old.status is distinct from new.status) then

    -- evita duplicar
    if exists (select 1 from public.lancamentos
               where origem = 'pedido' and origem_id = new.id::text and status <> 'cancelado') then
      return new;
    end if;

    select * into v_cot from public.cotacoes where id = new.cotacao_vencedora;
    if v_cot is null then return new; end if;

    -- vencimento estimado: necessidade em obra, senão 30 dias
    v_venc := coalesce(new.necessidade, current_date + 30);

    insert into public.lancamentos
      (obra_id, natureza, categoria_id, descricao, contraparte, documento, valor,
       vencimento, competencia, status, origem, origem_id, observacoes, criado_por)
    values
      (new.obra_id, 'pagar', 'cd_material',
       'PM-' || lpad(new.id::text, 3, '0') || ' · ' || new.titulo,
       v_cot.fornecedor, coalesce(new.compra_info->>'pedido_compra', null),
       v_cot.valor_total, v_venc, v_venc, 'previsto', 'pedido', new.id::text,
       'Gerado automaticamente da aprovação do pedido (cotação: ' || v_cot.fornecedor ||
       coalesce(' · pagamento: ' || v_cot.condicoes_pagamento, '') || ')',
       new.decidido_por);
  end if;
  return new;
end $$;

drop trigger if exists trg_pagar_pedido on public.pedidos_materiais;
create trigger trg_pagar_pedido after update on public.pedidos_materiais
  for each row execute procedure public.gerar_pagar_do_pedido();

-- ---------- 7) AUTOMAÇÃO: MEDIÇÃO APROVADA -> CONTA A RECEBER ----------
-- Recebível líquido (valor - glosa - retenção). Cl. 3.2: pagamento em até
-- 15 dias após validação da NF.
create or replace function public.gerar_receber_da_medicao()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_obra record; v_liq numeric; v_ret numeric;
begin
  if new.status in ('aprovado','glosado') and (old.status is distinct from new.status) then

    if exists (select 1 from public.lancamentos
               where origem = 'medicao' and origem_id = new.obra_id::text || ':' || new.id
                 and status <> 'cancelado') then
      return new;
    end if;

    select * into v_obra from public.obras where id = new.obra_id;
    if v_obra is null then return new; end if;

    v_liq := new.valor_bruto - coalesce(new.valor_glosa, 0);
    v_ret := v_liq * coalesce(v_obra.retencao_pct, 0);

    insert into public.lancamentos
      (obra_id, natureza, categoria_id, descricao, contraparte, valor,
       vencimento, competencia, status, origem, origem_id, observacoes, criado_por)
    values
      (new.obra_id, 'receber', 'rec_medicao',
       'Medição ' || new.id || ' · ' || new.etapa,
       v_obra.cliente, v_liq - v_ret,
       current_date + 15, current_date, 'previsto', 'medicao',
       new.obra_id::text || ':' || new.id,
       'Líquido de retenção (' || round(coalesce(v_obra.retencao_pct,0) * 100) || '%): ' ||
       to_char(v_ret, 'FM999G999G990D00') || '. Prazo Cl. 3.2: 15 dias após validação da NF.',
       new.atualizado_por);
  end if;
  return new;
end $$;

drop trigger if exists trg_receber_medicao on public.eventos;
create trigger trg_receber_medicao after update on public.eventos
  for each row execute procedure public.gerar_receber_da_medicao();

-- ---------- 8) GERAR LANÇAMENTOS DAS RECORRENTES ----------
create or replace function public.gerar_recorrentes(p_meses int default 3)
returns int language plpgsql security definer set search_path = public as $$
declare r record; d date; n int := 0; fim_janela date;
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  fim_janela := (date_trunc('month', current_date) + (p_meses || ' months')::interval)::date;

  for r in select * from public.recorrentes where ativo loop
    d := greatest(date_trunc('month', current_date)::date, date_trunc('month', r.inicio)::date);
    while d <= fim_janela loop
      declare venc date := (date_trunc('month', d) + ((r.dia_vencimento - 1) || ' days')::interval)::date;
      begin
        if venc >= r.inicio and (r.fim is null or venc <= r.fim)
           and not exists (select 1 from public.lancamentos
                           where origem = 'recorrente' and origem_id = r.id::text and vencimento = venc) then
          insert into public.lancamentos
            (obra_id, natureza, categoria_id, descricao, contraparte, valor,
             vencimento, competencia, status, origem, origem_id)
          values (r.obra_id, r.natureza, r.categoria_id, r.descricao, r.contraparte, r.valor,
                  venc, venc, 'previsto', 'recorrente', r.id::text);
          n := n + 1;
        end if;
      end;
      d := (date_trunc('month', d) + interval '1 month')::date;
    end loop;
  end loop;
  return n;
end $$;

-- ---------- 9) BACKFILL: gera lançamentos do que já está aprovado ----------
-- pedidos já aprovados/comprados
insert into public.lancamentos
  (obra_id, natureza, categoria_id, descricao, contraparte, valor, vencimento,
   competencia, status, origem, origem_id, observacoes)
select p.obra_id, 'pagar', 'cd_material',
       'PM-' || lpad(p.id::text, 3, '0') || ' · ' || p.titulo,
       c.fornecedor, c.valor_total,
       coalesce(p.necessidade, current_date + 30), coalesce(p.necessidade, current_date + 30),
       'previsto', 'pedido', p.id::text, 'Backfill da migração financeira.'
from public.pedidos_materiais p
join public.cotacoes c on c.id = p.cotacao_vencedora
where p.status in ('aprovado','comprado')
  and not exists (select 1 from public.lancamentos l where l.origem='pedido' and l.origem_id = p.id::text);

-- medições já aprovadas
insert into public.lancamentos
  (obra_id, natureza, categoria_id, descricao, contraparte, valor, vencimento,
   competencia, status, origem, origem_id, observacoes)
select e.obra_id, 'receber', 'rec_medicao',
       'Medição ' || e.id || ' · ' || e.etapa, o.cliente,
       (e.valor_bruto - coalesce(e.valor_glosa,0)) * (1 - coalesce(o.retencao_pct,0)),
       current_date + 15, current_date, 'previsto', 'medicao',
       e.obra_id::text || ':' || e.id, 'Backfill da migração financeira.'
from public.eventos e
join public.obras o on o.id = e.obra_id
where e.status in ('aprovado','glosado')
  and not exists (select 1 from public.lancamentos l where l.origem='medicao' and l.origem_id = e.obra_id::text || ':' || e.id);

-- ---------- 10) VIEWS DE APOIO ----------
-- posição financeira por obra (custo apropriado x receita medida)
create or replace view public.dre_obra as
select o.id as obra_id, o.codigo, o.nome, o.valor_global,
       coalesce(rec.total, 0) as receita_medida,
       coalesce(cus.total, 0) as custo_apropriado,
       coalesce(rec.total, 0) - coalesce(cus.total, 0) as margem_bruta,
       case when coalesce(rec.total,0) > 0
            then (coalesce(rec.total,0) - coalesce(cus.total,0)) / rec.total * 100 else 0 end as margem_pct
from public.obras o
left join lateral (
  select sum(l.valor) as total from public.lancamentos l
  where l.obra_id = o.id and l.natureza = 'receber' and l.status <> 'cancelado'
) rec on true
left join lateral (
  select sum(l.valor) as total from public.lancamentos l
  where l.obra_id = o.id and l.natureza = 'pagar' and l.status <> 'cancelado'
) cus on true;
