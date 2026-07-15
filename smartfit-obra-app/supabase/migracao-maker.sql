-- ============================================================
-- MIGRAÇÃO MAKER — centros de custo, colaboradores e rastro de agente.
--
-- Centro de custo é dimensão DA EMPRESA (RH, Jurídico, Operações...),
-- independente da obra. As três perguntas ficam separadas:
--   categoria_id  → que tipo de gasto é (material, folha, seguro)
--   obra_id       → de qual obra (null = overhead da empresa)
--   centro_id     → de qual área da empresa
--
-- Rodar no SQL Editor do Supabase ANTES do push.
-- ============================================================

-- ---------- 1) CENTROS DE CUSTO ----------
create table if not exists public.centros_custo (
  id text primary key,                    -- cc_operacoes, cc_rh...
  nome text not null,
  tipo text not null check (tipo in ('operacional','administrativo','comercial','suporte')),
  descricao text,
  responsavel_id uuid references public.profiles(id),
  ativo boolean not null default true,
  ordem int not null default 0
);

insert into public.centros_custo (id, nome, tipo, descricao, ordem) values
  ('cc_operacoes',  'Operações / Obras',      'operacional',    'Execução, engenharia e canteiro. Custo direto das obras.', 10),
  ('cc_suprimentos','Suprimentos',            'operacional',    'Compras, cotações e relacionamento com fornecedores.',     11),
  ('cc_qualidade',  'Qualidade e Segurança',  'operacional',    'FVS, conformidade técnica e SST.',                          12),
  ('cc_projetos',   'Projetos e Engenharia',  'operacional',    'Desenvolvimento e compatibilização de projetos.',           13),
  ('cc_comercial',  'Comercial',              'comercial',      'Prospecção, propostas e novos contratos.',                  20),
  ('cc_marketing',  'Marketing',              'comercial',      'Marca, comunicação e presença de mercado.',                 21),
  ('cc_financeiro', 'Financeiro',             'administrativo', 'Contas a pagar/receber, caixa e fluxo.',                    30),
  ('cc_contabil',   'Contábil e Fiscal',      'administrativo', 'Contabilidade, tributos e obrigações acessórias.',          31),
  ('cc_juridico',   'Jurídico',               'administrativo', 'Contratos, compliance e contencioso.',                      32),
  ('cc_rh',         'RH e Pessoas',           'administrativo', 'Folha, admissões, treinamento e cultura.',                  33),
  ('cc_admin',      'Administrativo',         'administrativo', 'Escritório, utilidades e serviços gerais.',                 34),
  ('cc_ti',         'TI e Sistemas',          'suporte',        'Infraestrutura, software e a própria plataforma.',          40),
  ('cc_diretoria',  'Diretoria',              'administrativo', 'Direção executiva e decisões estratégicas.',                50)
on conflict (id) do nothing;

-- ---------- 2) COLABORADORES (pessoas SEM login) ----------
-- Quem executa trabalho não precisa de acesso ao sistema para receber tarefa.
create table if not exists public.colaboradores (
  id bigint generated always as identity primary key,
  nome text not null,
  funcao text,                            -- Engenheiro, Encarregado, Mestre de obras...
  empresa text,                           -- própria, terceirizado, fornecedor
  vinculo text not null default 'proprio' check (vinculo in ('proprio','terceirizado','fornecedor','autonomo')),
  centro_id text references public.centros_custo(id),
  email text,
  telefone text,
  usuario_id uuid references public.profiles(id),  -- preenchido se um dia ganhar login
  ativo boolean not null default true,
  observacoes text,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);
create index if not exists idx_colab_nome  on public.colaboradores(nome);
create index if not exists idx_colab_ativo on public.colaboradores(ativo);

-- vínculo colaborador x obra (quem está em qual frente)
create table if not exists public.colaborador_obras (
  colaborador_id bigint not null references public.colaboradores(id) on delete cascade,
  obra_id bigint not null references public.obras(id) on delete cascade,
  primary key (colaborador_id, obra_id)
);

-- ---------- 3) CENTRO DE CUSTO NAS ENTIDADES ----------
alter table public.tarefas           add column if not exists centro_id text references public.centros_custo(id);
alter table public.tarefas           add column if not exists colaborador_id bigint references public.colaboradores(id);
alter table public.lancamentos       add column if not exists centro_id text references public.centros_custo(id);
alter table public.pedidos_materiais add column if not exists centro_id text references public.centros_custo(id);
alter table public.rotinas           add column if not exists centro_id text references public.centros_custo(id);

create index if not exists idx_tar_centro  on public.tarefas(centro_id);
create index if not exists idx_lanc_centro on public.lancamentos(centro_id);

-- default sensato: o que já existe vinculado a obra é operação
update public.tarefas           set centro_id = 'cc_operacoes' where centro_id is null and obra_id is not null;
update public.pedidos_materiais set centro_id = 'cc_suprimentos' where centro_id is null;

-- ---------- 4) RASTRO DO AGENTE ----------
-- Toda ação executada pelo advisor fica marcada. Numa auditoria, dá para
-- separar o que foi feito na tela do que foi feito por comando de chat.
alter table public.tarefas     add column if not exists via_agente boolean not null default false;
alter table public.rotinas     add column if not exists via_agente boolean not null default false;
alter table public.lancamentos add column if not exists via_agente boolean not null default false;
alter table public.auditoria   add column if not exists via_agente boolean not null default false;

-- ---------- 5) VISÃO: CUSTO POR CENTRO ----------
create or replace view public.custo_por_centro as
select c.id as centro_id, c.nome, c.tipo,
       count(l.id) filter (where l.status in ('previsto','confirmado','pago')) as lancamentos,
       coalesce(sum(l.valor) filter (where l.natureza = 'pagar' and l.status in ('previsto','confirmado','pago')), 0) as total_pagar,
       coalesce(sum(l.valor) filter (where l.natureza = 'pagar' and l.status = 'pago'), 0) as total_pago,
       coalesce(sum(l.valor) filter (where l.natureza = 'pagar' and l.obra_id is null and l.status in ('previsto','confirmado','pago')), 0) as overhead,
       coalesce(sum(l.valor) filter (where l.natureza = 'pagar' and l.obra_id is not null and l.status in ('previsto','confirmado','pago')), 0) as alocado_obra
from public.centros_custo c
left join public.lancamentos l on l.centro_id = c.id
where c.ativo
group by c.id, c.nome, c.tipo, c.ordem
order by c.ordem;

-- ---------- 6) RLS ----------
alter table public.centros_custo     enable row level security;
alter table public.colaboradores     enable row level security;
alter table public.colaborador_obras enable row level security;

-- centros de custo: todos leem; só admin mexe
drop policy if exists "cc: leitura" on public.centros_custo;
drop policy if exists "cc: escrita" on public.centros_custo;
create policy "cc: leitura" on public.centros_custo for select to authenticated using (true);
create policy "cc: escrita" on public.centros_custo for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- colaboradores: todos os autenticados leem (para atribuir trabalho); gestor cadastra
drop policy if exists "colab: leitura" on public.colaboradores;
drop policy if exists "colab: escrita" on public.colaboradores;
create policy "colab: leitura" on public.colaboradores for select to authenticated using (true);
create policy "colab: escrita" on public.colaboradores for all to authenticated
  using (public.papel_atual() in ('admin','contratante','contratada'))
  with check (public.papel_atual() in ('admin','contratante','contratada'));

drop policy if exists "colobra: leitura" on public.colaborador_obras;
drop policy if exists "colobra: escrita" on public.colaborador_obras;
create policy "colobra: leitura" on public.colaborador_obras for select to authenticated
  using (public.pode_ver_obra(obra_id));
create policy "colobra: escrita" on public.colaborador_obras for all to authenticated
  using (public.pode_ver_obra(obra_id)) with check (public.pode_ver_obra(obra_id));
