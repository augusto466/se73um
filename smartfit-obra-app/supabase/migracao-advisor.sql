-- ============================================================
-- MIGRAÇÃO ADVISOR — memória, decisões, briefing diário e
-- busca full-text no acervo (GED).
-- Rodar no SQL Editor do Supabase ANTES do push do código.
-- ============================================================

-- ---------- 1) CONVERSAS DO ADVISOR (memória) ----------
create table if not exists public.advisor_conversas (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null default 'Conversa',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_advc_user on public.advisor_conversas(usuario_id, atualizado_em desc);

create table if not exists public.advisor_mensagens (
  id bigint generated always as identity primary key,
  conversa_id bigint not null references public.advisor_conversas(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  acoes jsonb,                        -- ações propostas/executadas nesta mensagem
  criado_em timestamptz not null default now()
);
create index if not exists idx_advm_conv on public.advisor_mensagens(conversa_id, id);

-- ---------- 2) DECISÕES REGISTRADAS (o advisor não sugere o que já foi decidido) ----------
create table if not exists public.advisor_decisoes (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  obra_id bigint references public.obras(id) on delete cascade,   -- null = decisão da empresa
  titulo text not null,
  detalhe text,
  decidido_em date not null default current_date,
  criado_em timestamptz not null default now()
);
create index if not exists idx_advd_user on public.advisor_decisoes(usuario_id, decidido_em desc);

-- ---------- 3) BRIEFING DIÁRIO (proatividade) ----------
create table if not exists public.advisor_briefings (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  data date not null default current_date,
  conteudo text not null,
  retrato text,                       -- snapshot usado; o cron de amanhã compara com ele
  lido boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (usuario_id, data)
);
create index if not exists idx_advb_user on public.advisor_briefings(usuario_id, data desc);

-- ---------- 4) TEXTO EXTRAÍDO DO ACERVO (busca full-text) ----------
create table if not exists public.arquivo_textos (
  id bigint generated always as identity primary key,
  origem text not null check (origem in ('projeto','documento','anexo')),
  origem_id bigint not null,
  obra_id bigint references public.obras(id) on delete cascade,   -- null = documento da empresa
  titulo text not null,
  texto text not null,
  tsv tsvector generated always as
    (to_tsvector('portuguese', coalesce(titulo,'') || ' ' || left(coalesce(texto,''), 120000))) stored,
  atualizado_em timestamptz not null default now(),
  unique (origem, origem_id)
);
create index if not exists idx_arqtx_tsv  on public.arquivo_textos using gin(tsv);
create index if not exists idx_arqtx_obra on public.arquivo_textos(obra_id);

-- Função de busca com trecho destacado (usada pela rota do advisor via service role)
create or replace function public.buscar_acervo(q text, p_obras bigint[], p_todas boolean)
returns table (origem text, origem_id bigint, obra_id bigint, titulo text, trecho text, rank real)
language sql stable as $$
  select a.origem, a.origem_id, a.obra_id, a.titulo,
         ts_headline('portuguese', left(a.texto, 120000), websearch_to_tsquery('portuguese', q),
                     'MaxFragments=2, MaxWords=60, MinWords=20, StartSel=>>, StopSel=<<') as trecho,
         ts_rank(a.tsv, websearch_to_tsquery('portuguese', q)) as rank
  from public.arquivo_textos a
  where a.tsv @@ websearch_to_tsquery('portuguese', q)
    and (p_todas or a.obra_id is null or a.obra_id = any(p_obras))
  order by rank desc
  limit 6
$$;

-- ---------- 5) RLS ----------
alter table public.advisor_conversas enable row level security;
alter table public.advisor_mensagens enable row level security;
alter table public.advisor_decisoes  enable row level security;
alter table public.advisor_briefings enable row level security;
alter table public.arquivo_textos    enable row level security;

-- conversas: cada usuário só vê e mexe nas suas
drop policy if exists "advc: tudo" on public.advisor_conversas;
create policy "advc: tudo" on public.advisor_conversas
  for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- mensagens: através da conversa do próprio usuário
drop policy if exists "advm: tudo" on public.advisor_mensagens;
create policy "advm: tudo" on public.advisor_mensagens
  for all to authenticated
  using (exists (select 1 from public.advisor_conversas c
                 where c.id = conversa_id and c.usuario_id = auth.uid()))
  with check (exists (select 1 from public.advisor_conversas c
                      where c.id = conversa_id and c.usuario_id = auth.uid()));

-- decisões: dono vê e gere as suas
drop policy if exists "advd: tudo" on public.advisor_decisoes;
create policy "advd: tudo" on public.advisor_decisoes
  for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- briefings: cada usuário lê e marca como lido apenas os seus (criação é do cron/service role)
drop policy if exists "advb: leitura" on public.advisor_briefings;
drop policy if exists "advb: lido"    on public.advisor_briefings;
create policy "advb: leitura" on public.advisor_briefings
  for select to authenticated using (usuario_id = auth.uid());
create policy "advb: lido" on public.advisor_briefings
  for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- textos do acervo: quem vê a obra vê o texto (empresa = todos autenticados);
-- escrita fica só com o service role (rota de indexação)
drop policy if exists "arqtx: leitura" on public.arquivo_textos;
create policy "arqtx: leitura" on public.arquivo_textos
  for select to authenticated
  using (obra_id is null or public.pode_ver_obra(obra_id));
