-- ============================================================
-- MIGRAÇÃO SINAPI API — sincronização automática via Orçamentador.
--
-- A Caixa não tem API: publica ZIP com XLSX por estado, todo mês. O
-- Orçamentador reprocessa e expõe via REST, com webhook de atualização.
-- Isso troca "subir planilha toda vez" por "o sistema avisa e você aprova".
--
-- Dependência de terceiro: o importador CSV continua existindo como plano B.
--
-- Rodar no SQL Editor do Supabase ANTES do push.
-- ============================================================

-- ---------- 1) A base de GO ganha rastro de sincronização ----------
alter table public.bases_preco add column if not exists fonte text
  check (fonte in ('api','csv','manual'));
alter table public.bases_preco add column if not exists sincronizado_em timestamptz;
alter table public.bases_preco add column if not exists api_uf text;

update public.bases_preco set fonte = 'api', api_uf = 'GO' where id = 'sinapi_go';
update public.bases_preco set fonte = 'csv' where id = 'sinapi_04_2025_mt';
update public.bases_preco set fonte = 'manual' where tipo = 'propria' and fonte is null;

-- ---------- 2) FILA DE ATUALIZAÇÃO ----------
-- Quando a Caixa publica, o sistema busca os preços novos e enfileira aqui.
-- Nada é aplicado sozinho: você revisa e aprova. Preço de composição mexe
-- em orçamento — é decisão, não sincronização.
create table if not exists public.sinapi_pendencias (
  id bigint generated always as identity primary key,
  base_id text not null references public.bases_preco(id),
  referencia date not null,
  codigo text not null,
  descricao text,
  unidade text,
  preco_atual numeric(14,4),
  preco_novo numeric(14,4) not null,
  variacao_pct numeric(8,2),
  usado_em_modelo boolean not null default false,
  impacto_m2 numeric(14,4),
  status text not null default 'pendente' check (status in ('pendente','aplicada','ignorada')),
  criado_em timestamptz not null default now(),
  decidido_em timestamptz,
  decidido_por uuid references public.profiles(id),
  unique (base_id, referencia, codigo)
);
create index if not exists idx_sinpend_status on public.sinapi_pendencias(status, impacto_m2 desc);

-- ---------- 3) LOG DE SINCRONIZAÇÃO ----------
create table if not exists public.sinapi_sincronizacoes (
  id bigint generated always as identity primary key,
  base_id text not null references public.bases_preco(id),
  referencia date,
  origem text not null check (origem in ('webhook','manual','cron')),
  codigos_consultados int not null default 0,
  codigos_alterados int not null default 0,
  variacao_media_pct numeric(8,2),
  erro text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_sinsinc on public.sinapi_sincronizacoes(criado_em desc);

-- ---------- 4) RLS ----------
alter table public.sinapi_pendencias      enable row level security;
alter table public.sinapi_sincronizacoes  enable row level security;

drop policy if exists "sinpend: gestor" on public.sinapi_pendencias;
create policy "sinpend: gestor" on public.sinapi_pendencias
  for all to authenticated
  using (public.papel_atual() in ('admin','contratante'))
  with check (public.papel_atual() in ('admin','contratante'));

drop policy if exists "sinsinc: gestor" on public.sinapi_sincronizacoes;
create policy "sinsinc: gestor" on public.sinapi_sincronizacoes
  for all to authenticated
  using (public.papel_atual() in ('admin','contratante'))
  with check (public.papel_atual() in ('admin','contratante'));
