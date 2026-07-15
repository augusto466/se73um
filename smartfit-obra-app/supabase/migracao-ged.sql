-- =====================================================================
-- MIGRAÇÃO 005 — GED: PROJETOS COM REVISÃO · DOCUMENTOS · ANEXOS
-- Execute no Supabase: SQL Editor > New query > cole tudo > Run
-- =====================================================================

-- ---------- 1) BUCKET DE ARQUIVOS ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('arquivos', 'arquivos', false, 52428800)   -- 50 MB por arquivo
on conflict (id) do nothing;

-- ---------- 2) PROJETOS (com controle de revisão) ----------
create table if not exists public.projetos (
  id bigint generated always as identity primary key,
  obra_id bigint not null references public.obras(id) on delete cascade,
  disciplina text not null,
  codigo text,                       -- ex.: ARQ-01, EST-03
  titulo text not null,
  revisao text not null default 'R00',
  vigente boolean not null default true,
  substituido_por bigint references public.projetos(id),
  arquivo_path text,                 -- caminho no storage
  arquivo_nome text,
  arquivo_tamanho bigint,
  data_emissao date,
  responsavel_tecnico text,
  art_rrt text,
  observacoes text,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);
create index if not exists idx_proj_obra on public.projetos(obra_id);
create index if not exists idx_proj_vig  on public.projetos(vigente);

-- ---------- 3) DOCUMENTOS CONTRATUAIS (com validade) ----------
create table if not exists public.documentos (
  id bigint generated always as identity primary key,
  obra_id bigint references public.obras(id) on delete cascade,  -- null = documento da empresa
  tipo text not null,                -- certidao, apolice, art_rrt, licenca, contrato, outro
  titulo text not null,
  emissor text,
  numero text,
  emissao date,
  validade date,                     -- null = sem validade
  clausula text,                     -- referência contratual
  arquivo_path text,
  arquivo_nome text,
  arquivo_tamanho bigint,
  observacoes text,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);
create index if not exists idx_doc_obra on public.documentos(obra_id);
create index if not exists idx_doc_val  on public.documentos(validade);

-- ---------- 4) ANEXOS GENÉRICOS (pedidos, RDOs, FVS, eventos) ----------
create table if not exists public.anexos (
  id bigint generated always as identity primary key,
  obra_id bigint references public.obras(id) on delete cascade,
  entidade text not null,            -- pedido | diario | fvs | evento
  entidade_id text not null,
  arquivo_path text not null,
  arquivo_nome text not null,
  arquivo_tamanho bigint,
  descricao text,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);
create index if not exists idx_anx on public.anexos(entidade, entidade_id);

-- ---------- 5) RLS ----------
alter table public.projetos   enable row level security;
alter table public.documentos enable row level security;
alter table public.anexos     enable row level security;

-- projetos: quem tem acesso à obra vê e sobe; só admin exclui
drop policy if exists "proj: leitura" on public.projetos;
drop policy if exists "proj: criar"   on public.projetos;
drop policy if exists "proj: editar"  on public.projetos;
drop policy if exists "proj: excluir" on public.projetos;
create policy "proj: leitura" on public.projetos for select to authenticated using (public.pode_ver_obra(obra_id));
create policy "proj: criar"   on public.projetos for insert to authenticated with check (public.pode_ver_obra(obra_id));
create policy "proj: editar"  on public.projetos for update to authenticated using (public.pode_ver_obra(obra_id));
create policy "proj: excluir" on public.projetos for delete to authenticated
  using (public.eh_admin() or criado_por = auth.uid());

drop policy if exists "doc: leitura" on public.documentos;
drop policy if exists "doc: criar"   on public.documentos;
drop policy if exists "doc: editar"  on public.documentos;
drop policy if exists "doc: excluir" on public.documentos;
create policy "doc: leitura" on public.documentos for select to authenticated
  using (obra_id is null or public.pode_ver_obra(obra_id));
create policy "doc: criar" on public.documentos for insert to authenticated
  with check (obra_id is null and public.eh_admin() or (obra_id is not null and public.pode_ver_obra(obra_id)));
create policy "doc: editar" on public.documentos for update to authenticated
  using (obra_id is null and public.eh_admin() or (obra_id is not null and public.pode_ver_obra(obra_id)));
create policy "doc: excluir" on public.documentos for delete to authenticated
  using (public.eh_admin() or criado_por = auth.uid());

drop policy if exists "anx: leitura" on public.anexos;
drop policy if exists "anx: criar"   on public.anexos;
drop policy if exists "anx: excluir" on public.anexos;
create policy "anx: leitura" on public.anexos for select to authenticated
  using (obra_id is null or public.pode_ver_obra(obra_id));
create policy "anx: criar" on public.anexos for insert to authenticated
  with check (obra_id is null or public.pode_ver_obra(obra_id));
create policy "anx: excluir" on public.anexos for delete to authenticated
  using (public.eh_admin() or criado_por = auth.uid());

-- ---------- 6) STORAGE: políticas do bucket ----------
drop policy if exists "arquivos: ler"     on storage.objects;
drop policy if exists "arquivos: subir"   on storage.objects;
drop policy if exists "arquivos: apagar"  on storage.objects;
create policy "arquivos: ler" on storage.objects for select to authenticated
  using (bucket_id = 'arquivos');
create policy "arquivos: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'arquivos');
create policy "arquivos: apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'arquivos' and owner = auth.uid());

-- ---------- 7) NOVA REVISÃO OBSOLETA A ANTERIOR ----------
create or replace function public.marcar_revisao_anterior()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- ao inserir revisão nova do mesmo projeto (mesma obra+disciplina+código),
  -- marca as anteriores como obsoletas
  update public.projetos
     set vigente = false, substituido_por = new.id
   where obra_id = new.obra_id
     and disciplina = new.disciplina
     and coalesce(codigo, titulo) = coalesce(new.codigo, new.titulo)
     and id <> new.id
     and vigente = true;
  return new;
end $$;

drop trigger if exists trg_revisao on public.projetos;
create trigger trg_revisao after insert on public.projetos
  for each row execute procedure public.marcar_revisao_anterior();

-- ---------- 8) MEU DIA: incluir documentos vencendo ----------
create or replace view public.meu_dia as
select 'tarefa' as tipo, t.id::text as id, t.obra_id, t.descricao as titulo,
       t.prazo as vencimento, t.prioridade,
       case when t.coluna = 2 then 'em validação' else 'em execução' end as situacao,
       t.responsavel as responsavel_txt, null::uuid as responsavel_id
from public.tarefas t where t.coluna < 3
union all
select 'rotina', o.id::text, o.obra_id, r.titulo, o.vencimento, r.prioridade,
       'rotina ' || r.frequencia, null::text, r.responsavel_id
from public.rotina_ocorrencias o
join public.rotinas r on r.id = o.rotina_id
where o.status = 'pendente'
union all
select 'medicao', e.obra_id::text || ':' || e.id, e.obra_id,
       'Validar medição ' || e.id || ' — ' || e.etapa, current_date, 'alta',
       'aguardando fiscalização', null::text, null::uuid
from public.eventos e where e.status = 'validacao'
union all
select 'pedido', p.id::text, p.obra_id,
       'Aprovar pedido PM-' || lpad(p.id::text, 3, '0') || ' — ' || p.titulo,
       coalesce(p.necessidade, current_date), 'alta', 'aguardando aprovação', null::text, null::uuid
from public.pedidos_materiais p where p.status = 'enviado'
union all
select 'financeiro', l.id::text, l.obra_id,
       (case when l.natureza = 'pagar' then 'Pagar: ' else 'Receber: ' end) || l.descricao,
       l.vencimento, case when l.vencimento < current_date then 'alta' else 'media' end,
       l.natureza, null::text, null::uuid
from public.lancamentos l
where l.status in ('previsto','confirmado') and l.vencimento <= current_date + 7
union all
-- documentos vencendo em 30 dias (Cl. 13.3: doc vencido autoriza reter medição)
select 'documento', d.id::text, d.obra_id,
       'Renovar: ' || d.titulo || coalesce(' (' || d.emissor || ')', ''),
       d.validade, case when d.validade < current_date + 7 then 'alta' else 'media' end,
       'documento ' || d.tipo, null::text, null::uuid
from public.documentos d
where d.validade is not null and d.validade <= current_date + 30;

-- ---------- 9) DOCUMENTOS ESPERADOS (checklist inicial da Cl. 13.2) ----------
do $$
declare v_obra bigint;
begin
  select id into v_obra from public.obras where codigo = 'TK-328/2026';
  if v_obra is not null and not exists (select 1 from public.documentos) then
    insert into public.documentos (obra_id, tipo, titulo, emissor, clausula, observacoes) values
    (v_obra, 'apolice',  'Seguro garantia 10% do valor global', 'Seguradora SUSEP', 'Cl. 13.1.1', 'Cadastre a apólice e a validade.'),
    (v_obra, 'apolice',  'Seguro de responsabilidade civil e riscos de engenharia', 'Seguradora', 'Cl. 13.1', 'Vigência durante toda a execução.'),
    (null,   'certidao', 'Certidão de regularidade do FGTS', 'Caixa', 'Cl. 13.2', 'Renovação periódica.'),
    (null,   'certidao', 'Certidão negativa de débitos trabalhistas (CNDT)', 'TST', 'Cl. 13.2', 'Renovação periódica.'),
    (null,   'certidao', 'Certidão de regularidade fiscal (RFB/PGFN)', 'Receita Federal', 'Cl. 13.2', 'Renovação periódica.'),
    (v_obra, 'art_rrt',  'ART do projeto estrutural', 'CREA', 'Cl. 2.1', 'Anexe a ART emitida.'),
    (v_obra, 'licenca',  'Alvará de construção', 'Prefeitura de Goiânia', 'Cl. 1.3', 'Necessário à execução regular.');
  end if;
end $$;
