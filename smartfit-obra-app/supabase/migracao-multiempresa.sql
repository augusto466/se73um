-- ============================================================
-- MIGRAÇÃO MULTIEMPRESA — o sistema vira SaaS.
--
-- A Se73um é a DONA do sistema. Cada cliente é um TENANT que só enxerga os
-- próprios dados. A Modo Modular vira empresa_id = 1.
--
-- POR QUE A FUNDAÇÃO VEM ANTES DA TELA: sem empresa_id no RLS, o branding
-- seria fachada e a Construtora A veria o funil da Construtora B. Isso não é
-- bug de interface — é o que mata um SaaS no primeiro cliente.
--
-- ESTRATÉGIA: as tabelas-raiz (obras, oportunidades, colaboradores...) ganham
-- empresa_id. As filhas (eventos, orcamento, proposta_itens...) herdam pela
-- FK — não precisam da coluna, e duplicá-la criaria risco de divergência.
--
-- Rodar no SQL Editor do Supabase ANTES do push.
-- ============================================================

-- ---------- 1) EMPRESAS ----------
create table if not exists public.empresas (
  id bigint generated always as identity primary key,
  slug text unique not null,
  razao_social text not null,
  nome_fantasia text,
  cnpj text,
  -- identidade visual: aparece nos documentos
  logo_path text,                      -- no bucket 'arquivos'
  cor_marca text default '#FD1843',
  -- contato e endereço: vão no cabeçalho da proposta
  email text,
  telefone text,
  site text,
  endereco text,
  cidade text,
  uf text,
  cep text,
  -- e-mail: cada empresa manda do próprio domínio
  email_remetente text,                -- comercial@cliente.com.br
  dominio_verificado boolean not null default false,
  resend_dominio_id text,
  -- comercial da Se73um
  plano text not null default 'trial' check (plano in ('trial','ativo','suspenso')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

insert into public.empresas (id, slug, razao_social, nome_fantasia, email, cidade, uf)
  overriding system value
values (1, 'modo', 'Modo Modular', 'Modo', 'vendas@modo.tec.br', 'Goiânia', 'GO')
on conflict (id) do nothing;
select setval(pg_get_serial_sequence('public.empresas','id'), greatest((select max(id) from public.empresas), 1));

-- ---------- 2) O USUÁRIO PERTENCE A UMA EMPRESA ----------
alter table public.profiles add column if not exists empresa_id bigint references public.empresas(id);
-- superadmin = Se73um: enxerga todas as empresas. É o único papel que atravessa o tenant.
alter table public.profiles add column if not exists superadmin boolean not null default false;

update public.profiles set empresa_id = 1 where empresa_id is null;
alter table public.profiles alter column empresa_id set not null;
alter table public.profiles alter column empresa_id set default 1;

-- ---------- 3) EMPRESA NAS TABELAS-RAIZ ----------
do $$
declare t text;
begin
  foreach t in array array[
    'obras', 'oportunidades', 'colaboradores', 'centros_custo',
    'bases_preco', 'composicoes', 'modelos_orcamento',
    'categorias_financeiras', 'fvs_modelos', 'metas', 'recorrentes'
  ] loop
    execute format('alter table public.%I add column if not exists empresa_id bigint references public.empresas(id)', t);
    execute format('update public.%I set empresa_id = 1 where empresa_id is null', t);
    execute format('alter table public.%I alter column empresa_id set not null', t);
    execute format('alter table public.%I alter column empresa_id set default 1', t);
    execute format('create index if not exists idx_%s_empresa on public.%I(empresa_id)', t, t);
  end loop;
end $$;

-- ---------- 4) FUNÇÕES DE TENANT ----------
-- Toda política passa por aqui. Se a função mentir, o sistema vaza.
create or replace function public.minha_empresa()
returns bigint language sql stable security definer set search_path = public as $$
  select empresa_id from public.profiles where id = auth.uid()
$$;

create or replace function public.eh_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select superadmin from public.profiles where id = auth.uid()), false)
$$;

/** A trava base: ou é da minha empresa, ou eu sou a Se73um. */
create or replace function public.pode_ver_empresa(p_empresa bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_superadmin() or p_empresa = public.minha_empresa()
$$;

-- pode_ver_obra passa a checar a empresa também: sem isso, um vínculo em
-- obra_usuarios atravessaria o tenant
create or replace function public.pode_ver_obra(p_obra bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.obras o
    where o.id = p_obra
      and (public.eh_superadmin() or o.empresa_id = public.minha_empresa())
      and (
        public.eh_admin()
        or exists (select 1 from public.obra_usuarios ou where ou.obra_id = o.id and ou.usuario_id = auth.uid())
      )
  )
$$;

-- ---------- 5) RLS DAS TABELAS-RAIZ ----------
alter table public.empresas enable row level security;

drop policy if exists "emp: leitura" on public.empresas;
drop policy if exists "emp: escrita" on public.empresas;
create policy "emp: leitura" on public.empresas
  for select to authenticated
  using (public.eh_superadmin() or id = public.minha_empresa());
create policy "emp: escrita" on public.empresas
  for update to authenticated
  using (public.eh_superadmin() or (id = public.minha_empresa() and public.eh_admin()))
  with check (public.eh_superadmin() or (id = public.minha_empresa() and public.eh_admin()));

-- obras: empresa + vínculo
drop policy if exists "obras: leitura" on public.obras;
create policy "obras: leitura" on public.obras
  for select to authenticated
  using (
    (public.eh_superadmin() or empresa_id = public.minha_empresa())
    and (public.eh_admin() or exists (
      select 1 from public.obra_usuarios ou where ou.obra_id = id and ou.usuario_id = auth.uid()
    ))
  );

-- comercial: gestor da própria empresa
do $$
declare t text;
begin
  foreach t in array array['oportunidades'] loop
    execute format('drop policy if exists "%s: gestor" on public.%I', t, t);
    execute format($p$create policy "%s: gestor" on public.%I for all to authenticated
      using (public.pode_ver_empresa(empresa_id) and public.papel_atual() in ('admin','contratante'))
      with check (public.pode_ver_empresa(empresa_id) and public.papel_atual() in ('admin','contratante'))$p$, t, t);
  end loop;
end $$;

-- base de preços e modelos: gestor da própria empresa
do $$
declare t text;
begin
  foreach t in array array['bases_preco','composicoes','modelos_orcamento'] loop
    execute format('drop policy if exists "%s: gestor" on public.%I', t, t);
    execute format($p$create policy "%s: gestor" on public.%I for all to authenticated
      using (public.pode_ver_empresa(empresa_id) and public.papel_atual() in ('admin','contratante'))
      with check (public.pode_ver_empresa(empresa_id) and public.papel_atual() in ('admin','contratante'))$p$, t, t);
  end loop;
end $$;

-- colaboradores e centros de custo: todos da empresa leem; gestor escreve
do $$
declare t text;
begin
  foreach t in array array['colaboradores','centros_custo','categorias_financeiras','fvs_modelos'] loop
    execute format('drop policy if exists "%s: leitura" on public.%I', t, t);
    execute format('drop policy if exists "%s: escrita" on public.%I', t, t);
    execute format('drop policy if exists "%s: tudo" on public.%I', t, t);
    execute format($p$create policy "%s: leitura" on public.%I for select to authenticated
      using (public.pode_ver_empresa(empresa_id))$p$, t, t);
    execute format($p$create policy "%s: escrita" on public.%I for all to authenticated
      using (public.pode_ver_empresa(empresa_id) and public.papel_atual() in ('admin','contratante'))
      with check (public.pode_ver_empresa(empresa_id) and public.papel_atual() in ('admin','contratante'))$p$, t, t);
  end loop;
end $$;

-- profiles: cada um vê os colegas da própria empresa
drop policy if exists "prof: leitura" on public.profiles;
create policy "prof: leitura" on public.profiles
  for select to authenticated
  using (public.eh_superadmin() or empresa_id = public.minha_empresa());

-- ---------- 6) PROPOSTAS E FILHAS: herdam pela oportunidade ----------
drop policy if exists "propostas: gestor" on public.propostas;
create policy "propostas: gestor" on public.propostas
  for all to authenticated
  using (exists (select 1 from public.oportunidades o where o.id = oportunidade_id and public.pode_ver_empresa(o.empresa_id)))
  with check (exists (select 1 from public.oportunidades o where o.id = oportunidade_id and public.pode_ver_empresa(o.empresa_id)));

drop policy if exists "proposta_itens: gestor" on public.proposta_itens;
create policy "proposta_itens: gestor" on public.proposta_itens
  for all to authenticated
  using (exists (
    select 1 from public.propostas p join public.oportunidades o on o.id = p.oportunidade_id
    where p.id = proposta_id and public.pode_ver_empresa(o.empresa_id)))
  with check (exists (
    select 1 from public.propostas p join public.oportunidades o on o.id = p.oportunidade_id
    where p.id = proposta_id and public.pode_ver_empresa(o.empresa_id)));

drop policy if exists "oportunidade_premissas: gestor" on public.oportunidade_premissas;
create policy "oportunidade_premissas: gestor" on public.oportunidade_premissas
  for all to authenticated
  using (exists (select 1 from public.oportunidades o where o.id = oportunidade_id and public.pode_ver_empresa(o.empresa_id)))
  with check (exists (select 1 from public.oportunidades o where o.id = oportunidade_id and public.pode_ver_empresa(o.empresa_id)));

drop policy if exists "penv: gestor" on public.proposta_envios;
create policy "penv: gestor" on public.proposta_envios
  for all to authenticated
  using (exists (
    select 1 from public.propostas p join public.oportunidades o on o.id = p.oportunidade_id
    where p.id = proposta_id and public.pode_ver_empresa(o.empresa_id)))
  with check (exists (
    select 1 from public.propostas p join public.oportunidades o on o.id = p.oportunidade_id
    where p.id = proposta_id and public.pode_ver_empresa(o.empresa_id)));

-- modelo_itens e calibrações herdam pelo modelo
drop policy if exists "modelo_itens: gestor" on public.modelo_itens;
create policy "modelo_itens: gestor" on public.modelo_itens
  for all to authenticated
  using (exists (select 1 from public.modelos_orcamento m where m.id = modelo_id and public.pode_ver_empresa(m.empresa_id)))
  with check (exists (select 1 from public.modelos_orcamento m where m.id = modelo_id and public.pode_ver_empresa(m.empresa_id)));

drop policy if exists "calib: gestor" on public.modelo_calibracoes;
create policy "calib: gestor" on public.modelo_calibracoes
  for all to authenticated
  using (exists (select 1 from public.modelos_orcamento m where m.id = modelo_id and public.pode_ver_empresa(m.empresa_id)))
  with check (exists (select 1 from public.modelos_orcamento m where m.id = modelo_id and public.pode_ver_empresa(m.empresa_id)));

-- ---------- 7) TRIGGER: empresa_id nasce do usuário ----------
-- Confiar no cliente para mandar empresa_id é o mesmo que não ter tenant.
-- O banco carimba, e ignora o que vier do app.
create or replace function public.carimba_empresa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_superadmin() then
    new.empresa_id := public.minha_empresa();
  elsif new.empresa_id is null then
    new.empresa_id := public.minha_empresa();
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'obras','oportunidades','colaboradores','centros_custo',
    'bases_preco','composicoes','modelos_orcamento',
    'categorias_financeiras','fvs_modelos','metas','recorrentes'
  ] loop
    execute format('drop trigger if exists trg_empresa_%s on public.%I', t, t);
    execute format('create trigger trg_empresa_%s before insert on public.%I
      for each row execute function public.carimba_empresa()', t, t);
  end loop;
end $$;

-- ---------- 8) O PRIMEIRO SUPERADMIN ----------
-- Rode isto com o SEU e-mail. Sem superadmin, ninguém administra o SaaS.
-- update public.profiles set superadmin = true where id = (select id from auth.users where email = 'seu@email.com');

-- ---------- 9) TAREFAS DA EMPRESA (obra_id null) ----------
-- Bug encontrado: `tarefas` aceita obra_id nulo (RH, Jurídico...), mas a
-- política usa pode_ver_obra(obra_id), que devolve NULL quando a obra é nula —
-- e NULL no RLS nega. As tarefas da empresa estavam invisíveis.
--
-- Agora: tarefa com obra segue a regra da obra; tarefa sem obra pertence à
-- empresa e é vista por quem é da empresa.
alter table public.tarefas add column if not exists empresa_id bigint references public.empresas(id);
update public.tarefas t set empresa_id = coalesce(
  (select o.empresa_id from public.obras o where o.id = t.obra_id), 1
) where t.empresa_id is null;
alter table public.tarefas alter column empresa_id set not null;
alter table public.tarefas alter column empresa_id set default 1;
create index if not exists idx_tarefas_empresa on public.tarefas(empresa_id);

drop trigger if exists trg_empresa_tarefas on public.tarefas;
create trigger trg_empresa_tarefas before insert on public.tarefas
  for each row execute function public.carimba_empresa();

drop policy if exists "tarefas: leitura" on public.tarefas;
drop policy if exists "tarefas: criar"   on public.tarefas;
drop policy if exists "tarefas: editar"  on public.tarefas;
drop policy if exists "tarefas: excluir" on public.tarefas;

create policy "tarefas: leitura" on public.tarefas for select to authenticated
  using (
    public.pode_ver_empresa(empresa_id)
    and (obra_id is null or public.pode_ver_obra(obra_id))
  );
create policy "tarefas: criar" on public.tarefas for insert to authenticated
  with check (
    criado_por = auth.uid()
    and public.pode_ver_empresa(empresa_id)
    and (obra_id is null or public.pode_ver_obra(obra_id))
  );
create policy "tarefas: editar" on public.tarefas for update to authenticated
  using (
    public.pode_ver_empresa(empresa_id)
    and (obra_id is null or public.pode_ver_obra(obra_id))
    and (criado_por = auth.uid() or public.papel_atual() in ('contratante','admin'))
  );
create policy "tarefas: excluir" on public.tarefas for delete to authenticated
  using (
    public.pode_ver_empresa(empresa_id)
    and (obra_id is null or public.pode_ver_obra(obra_id))
    and (criado_por = auth.uid() or public.papel_atual() in ('contratante','admin'))
  );

-- rotinas e lançamentos têm o mesmo padrão (obra opcional)
alter table public.rotinas add column if not exists empresa_id bigint references public.empresas(id);
update public.rotinas r set empresa_id = coalesce((select o.empresa_id from public.obras o where o.id = r.obra_id), 1) where r.empresa_id is null;
alter table public.rotinas alter column empresa_id set not null;
alter table public.rotinas alter column empresa_id set default 1;

alter table public.lancamentos add column if not exists empresa_id bigint references public.empresas(id);
update public.lancamentos l set empresa_id = coalesce((select o.empresa_id from public.obras o where o.id = l.obra_id), 1) where l.empresa_id is null;
alter table public.lancamentos alter column empresa_id set not null;
alter table public.lancamentos alter column empresa_id set default 1;

do $$
declare t text;
begin
  foreach t in array array['rotinas','lancamentos'] loop
    execute format('drop trigger if exists trg_empresa_%s on public.%I', t, t);
    execute format('create trigger trg_empresa_%s before insert on public.%I
      for each row execute function public.carimba_empresa()', t, t);
  end loop;
end $$;

-- ---------- 10) DOCUMENTOS DA EMPRESA (obra_id null) ----------
alter table public.documentos add column if not exists empresa_id bigint references public.empresas(id);
update public.documentos d set empresa_id = coalesce((select o.empresa_id from public.obras o where o.id = d.obra_id), 1) where d.empresa_id is null;
alter table public.documentos alter column empresa_id set not null;
alter table public.documentos alter column empresa_id set default 1;
drop trigger if exists trg_empresa_documentos on public.documentos;
create trigger trg_empresa_documentos before insert on public.documentos
  for each row execute function public.carimba_empresa();

-- ---------- 11) ADVISOR: conversas e decisões são do usuário ----------
-- Já isoladas por usuario_id = auth.uid(), que é mais restritivo que empresa.
-- Briefings idem. Nada a fazer.

-- ---------- 12) CONFERÊNCIA ----------
select 'empresas' as tabela, count(*) from public.empresas
union all select 'usuarios sem empresa', count(*) from public.profiles where empresa_id is null
union all select 'obras da empresa 1', count(*) from public.obras where empresa_id = 1
union all select 'superadmins', count(*) from public.profiles where superadmin;
