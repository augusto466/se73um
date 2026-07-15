-- ============================================================
-- MIGRAÇÃO REPLANEJAMENTO — baseline imutável, datas previstas,
-- precedências, revisões e curva S comparada.
--
-- REGRA DE OURO: o cronograma contratual (baseline) é gravado UMA VEZ
-- e nunca mais muda. Todo replanejamento vive nas colunas "prev_*" e
-- fica registrado em cronograma_revisoes com autor, motivo e diff.
--
-- REGRA DE NEGÓCIO (definida pelo CEO): antecipar/atrasar a EXECUÇÃO
-- move o evento de medição junto — o faturamento acompanha o físico.
--
-- Rodar no SQL Editor do Supabase ANTES do push.
-- ============================================================

-- ---------- 1) DATAS NOS EVENTOS ----------
-- base_* : contratual (Anexo III). Imutável.
-- prev_* : replanejamento vigente. É o que muda.
-- real_* : o que aconteceu de fato.
alter table public.eventos add column if not exists base_inicio date;
alter table public.eventos add column if not exists base_fim    date;
alter table public.eventos add column if not exists base_mes    int;      -- mês contratual congelado
alter table public.eventos add column if not exists prev_inicio date;
alter table public.eventos add column if not exists prev_fim    date;
alter table public.eventos add column if not exists real_inicio date;
alter table public.eventos add column if not exists real_fim    date;
alter table public.eventos add column if not exists duracao_dias int;     -- duração planejada (dias corridos)
alter table public.eventos add column if not exists critico boolean not null default false;

-- baseline nasce do que já existe hoje; prev nasce igual ao baseline
update public.eventos set base_mes = mes where base_mes is null;

create index if not exists idx_ev_prev on public.eventos(obra_id, prev_inicio);

-- ---------- 2) TRAVA DO BASELINE ----------
-- Ninguém altera base_* depois de gravado: nem a interface, nem o advisor,
-- nem uma chamada direta à API. A integridade probatória do contrato vale mais
-- que a conveniência de corrigir um erro de digitação (nesse caso: nova obra).
create or replace function public.protege_baseline()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'UPDATE' then
    if OLD.base_inicio is not null and NEW.base_inicio is distinct from OLD.base_inicio then
      raise exception 'Baseline contratual e imutavel: base_inicio do evento % nao pode ser alterado.', OLD.id;
    end if;
    if OLD.base_fim is not null and NEW.base_fim is distinct from OLD.base_fim then
      raise exception 'Baseline contratual e imutavel: base_fim do evento % nao pode ser alterado.', OLD.id;
    end if;
    if OLD.base_mes is not null and NEW.base_mes is distinct from OLD.base_mes then
      raise exception 'Baseline contratual e imutavel: base_mes do evento % nao pode ser alterado.', OLD.id;
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_protege_baseline on public.eventos;
create trigger trg_protege_baseline before update on public.eventos
  for each row execute function public.protege_baseline();

-- também congela o cronograma financeiro contratual da obra
alter table public.obras add column if not exists meses_base jsonb;
update public.obras set meses_base = meses where meses_base is null;

create or replace function public.protege_meses_base()
returns trigger language plpgsql as $$
begin
  if OLD.meses_base is not null and NEW.meses_base is distinct from OLD.meses_base then
    raise exception 'Cronograma financeiro contratual (meses_base) e imutavel.';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_protege_meses_base on public.obras;
create trigger trg_protege_meses_base before update on public.obras
  for each row execute function public.protege_meses_base();

-- ---------- 3) PRECEDÊNCIAS ENTRE EVENTOS ----------
-- Sem isso, antecipar a mobilização não puxa a terraplenagem junto.
create table if not exists public.evento_dependencias (
  id bigint generated always as identity primary key,
  obra_id bigint not null references public.obras(id) on delete cascade,
  evento_id text not null,            -- o sucessor
  depende_de text not null,           -- o predecessor
  tipo text not null default 'FS' check (tipo in ('FS','SS','FF')),  -- fim-inicio, inicio-inicio, fim-fim
  folga_dias int not null default 0,  -- lag positivo = espera; negativo = sobreposição
  criado_em timestamptz not null default now(),
  unique (obra_id, evento_id, depende_de),
  check (evento_id <> depende_de)
);
create index if not exists idx_dep_obra on public.evento_dependencias(obra_id, evento_id);

-- ---------- 4) REVISÕES DE CRONOGRAMA ----------
create table if not exists public.cronograma_revisoes (
  id bigint generated always as identity primary key,
  obra_id bigint not null references public.obras(id) on delete cascade,
  numero int not null,                -- R01, R02...
  motivo text not null,
  detalhe text,
  origem text not null default 'manual' check (origem in ('manual','advisor')),
  diff jsonb not null,                -- [{evento_id, etapa, de_inicio, para_inicio, de_fim, para_fim, dias}]
  impacto jsonb,                      -- {entrega_de, entrega_para, dias_entrega, faturamento_por_mes, alerta_contratual}
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now(),
  unique (obra_id, numero)
);
create index if not exists idx_rev_obra on public.cronograma_revisoes(obra_id, numero desc);

-- revisões são registro histórico: não se edita nem se apaga
create or replace function public.revisao_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'Revisoes de cronograma sao imutaveis (integridade do historico de replanejamento).';
end $$;

drop trigger if exists trg_rev_upd on public.cronograma_revisoes;
drop trigger if exists trg_rev_del on public.cronograma_revisoes;
create trigger trg_rev_upd before update on public.cronograma_revisoes
  for each row execute function public.revisao_imutavel();
create trigger trg_rev_del before delete on public.cronograma_revisoes
  for each row execute function public.revisao_imutavel();

-- ---------- 5) CURVA S: BASELINE x REPLANEJADO x REAL ----------
-- Agrega o valor dos eventos por mês em cada uma das três leituras.
create or replace view public.curva_s as
with base as (
  select obra_id,
         coalesce(to_char(base_inicio, 'YYYY-MM'), 'M' || lpad(base_mes::text, 2, '0')) as periodo,
         sum(valor_bruto) as valor
  from public.eventos group by 1, 2
),
prev as (
  select obra_id, to_char(coalesce(prev_inicio, base_inicio), 'YYYY-MM') as periodo,
         sum(valor_bruto) as valor
  from public.eventos where coalesce(prev_inicio, base_inicio) is not null group by 1, 2
),
real as (
  select obra_id, to_char(real_fim, 'YYYY-MM') as periodo,
         sum(valor_bruto - coalesce(valor_glosa, 0)) as valor
  from public.eventos where real_fim is not null and status in ('aprovado','glosado') group by 1, 2
)
select coalesce(b.obra_id, p.obra_id, r.obra_id) as obra_id,
       coalesce(b.periodo, p.periodo, r.periodo) as periodo,
       coalesce(b.valor, 0) as valor_base,
       coalesce(p.valor, 0) as valor_prev,
       coalesce(r.valor, 0) as valor_real
from base b
full join prev p on p.obra_id = b.obra_id and p.periodo = b.periodo
full join real r on r.obra_id = coalesce(b.obra_id, p.obra_id) and r.periodo = coalesce(b.periodo, p.periodo)
order by 1, 2;

-- ---------- 6) DESVIO DE PRAZO POR EVENTO ----------
create or replace view public.desvio_prazo as
select e.obra_id, e.id as evento_id, e.etapa, e.status, e.valor_bruto,
       e.base_inicio, e.base_fim, e.prev_inicio, e.prev_fim, e.real_inicio, e.real_fim, e.critico,
       (e.prev_inicio - e.base_inicio) as dias_desvio_inicio,
       (e.prev_fim    - e.base_fim)    as dias_desvio_fim,
       case
         when e.real_fim is not null and e.prev_fim is not null then (e.real_fim - e.prev_fim)
         when e.prev_fim is not null and e.status not in ('aprovado','glosado') and e.prev_fim < current_date
           then (current_date - e.prev_fim)
         else null
       end as dias_atraso_real
from public.eventos e;

-- ---------- 7) RLS ----------
alter table public.evento_dependencias  enable row level security;
alter table public.cronograma_revisoes  enable row level security;

drop policy if exists "dep: leitura" on public.evento_dependencias;
drop policy if exists "dep: escrita" on public.evento_dependencias;
create policy "dep: leitura" on public.evento_dependencias
  for select to authenticated using (public.pode_ver_obra(obra_id));
create policy "dep: escrita" on public.evento_dependencias
  for all to authenticated
  using (public.pode_ver_obra(obra_id) and public.papel_atual() in ('admin','contratante'))
  with check (public.pode_ver_obra(obra_id) and public.papel_atual() in ('admin','contratante'));

drop policy if exists "rev: leitura" on public.cronograma_revisoes;
drop policy if exists "rev: criar"   on public.cronograma_revisoes;
create policy "rev: leitura" on public.cronograma_revisoes
  for select to authenticated using (public.pode_ver_obra(obra_id));
create policy "rev: criar" on public.cronograma_revisoes
  for insert to authenticated
  with check (public.pode_ver_obra(obra_id) and public.papel_atual() in ('admin','contratante'));
