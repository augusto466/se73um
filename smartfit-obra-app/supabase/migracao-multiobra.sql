-- =====================================================================
-- MIGRAÇÃO 002 — PLATAFORMA MULTI-OBRA (CENTROS DE CUSTO)
-- Execute no Supabase: SQL Editor > New query > cole tudo > Run
-- Seguro para rodar com o sistema já em produção: preserva os dados
-- existentes, que passam a pertencer à Obra #1 (TK-328/2026).
-- =====================================================================

-- ---------- 1) TABELA DE OBRAS (centro de custo) ----------
create table if not exists public.obras (
  id bigint generated always as identity primary key,
  codigo text not null unique,              -- ex.: TK-328/2026
  nome text not null,                       -- ex.: BTS Smart Fit — César Lattes
  cliente text,                             -- contratante daquela obra
  contratada text,                          -- construtora responsável
  local text,
  valor_global numeric not null default 0,
  retencao_pct numeric not null default 0.10,
  assinatura date,
  entrega_final date,
  kickoff numeric not null default 0,
  mes_atual int not null default 1,          -- mês corrente do cronograma
  meses jsonb not null default '[]',         -- [{id, ref, plan}]
  status text not null default 'ativa' check (status in ('ativa','concluida','suspensa','arquivada')),
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);

-- ---------- 2) VÍNCULO USUÁRIO x OBRA ----------
-- O papel (contratante/contratada) é GLOBAL, no profile.
-- O vínculo define QUAIS obras cada pessoa enxerga. Admin vê todas.
create table if not exists public.obra_usuarios (
  obra_id bigint not null references public.obras(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (obra_id, usuario_id)
);

-- campo empresa no perfil (organiza múltiplas contratadas/clientes)
alter table public.profiles add column if not exists empresa text;

-- ---------- 3) FUNÇÕES DE APOIO ----------
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select papel = 'admin' from public.profiles where id = auth.uid()), false) $$;

-- true se o usuário atual pode ver a obra informada
create or replace function public.pode_ver_obra(p_obra bigint) returns boolean
language sql stable security definer set search_path = public as
$$ select public.eh_admin()
   or exists (select 1 from public.obra_usuarios ou
              where ou.obra_id = p_obra and ou.usuario_id = auth.uid()) $$;

-- ---------- 4) OBRA #1 — a partir dos dados já em produção ----------
insert into public.obras (codigo, nome, cliente, contratada, local, valor_global,
                          retencao_pct, assinatura, entrega_final, kickoff, mes_atual, meses)
select 'TK-328/2026', 'BTS Smart Fit — Av. Cesar Lattes',
       'Invest Market Construção Sob Medida LTDA', 'Modo Modular LTDA',
       'Av. Cesar Lattes, 2180 — Chácara Santa Rita, Goiânia/GO',
       4100000, 0.10, '2026-05-27', '2027-05-10', 28350, 2,
       '[{"id":1,"ref":"Jun/26","plan":28350},{"id":2,"ref":"Jul/26","plan":28350},
         {"id":3,"ref":"Ago/26","plan":342000},{"id":4,"ref":"Set/26","plan":558000},
         {"id":5,"ref":"Out/26","plan":702000},{"id":6,"ref":"Nov/26","plan":738000},
         {"id":7,"ref":"Dez/26","plan":576000},{"id":8,"ref":"Jan/27","plan":414000},
         {"id":9,"ref":"Fev/27","plan":303300},{"id":10,"ref":"Mar/27","plan":205000},
         {"id":13,"ref":"+4m RD","plan":68333.33},{"id":17,"ref":"+8m RD","plan":68333.34},
         {"id":21,"ref":"+12m RD","plan":68333.33}]'::jsonb
where not exists (select 1 from public.obras where codigo = 'TK-328/2026');

-- vincula todos os usuários já existentes à Obra #1
insert into public.obra_usuarios (obra_id, usuario_id)
select o.id, p.id from public.obras o cross join public.profiles p
where o.codigo = 'TK-328/2026'
on conflict do nothing;

-- ---------- 5) VINCULAR OS DADOS EXISTENTES À OBRA #1 ----------
alter table public.eventos            add column if not exists obra_id bigint references public.obras(id) on delete cascade;
alter table public.tarefas            add column if not exists obra_id bigint references public.obras(id) on delete cascade;
alter table public.diario             add column if not exists obra_id bigint references public.obras(id) on delete cascade;
alter table public.checklist          add column if not exists obra_id bigint references public.obras(id) on delete cascade;
alter table public.pedidos_materiais  add column if not exists obra_id bigint references public.obras(id) on delete cascade;
alter table public.auditoria          add column if not exists obra_id bigint references public.obras(id) on delete cascade;

update public.eventos           set obra_id = (select id from public.obras where codigo='TK-328/2026') where obra_id is null;
update public.tarefas           set obra_id = (select id from public.obras where codigo='TK-328/2026') where obra_id is null;
update public.diario            set obra_id = (select id from public.obras where codigo='TK-328/2026') where obra_id is null;
update public.checklist         set obra_id = (select id from public.obras where codigo='TK-328/2026') where obra_id is null;
update public.pedidos_materiais set obra_id = (select id from public.obras where codigo='TK-328/2026') where obra_id is null;
update public.auditoria         set obra_id = (select id from public.obras where codigo='TK-328/2026') where obra_id is null;

-- ---------- 6) CHAVES PRIMÁRIAS COMPOSTAS (mesmo E01 em várias obras) ----------
-- eventos: id passa a ser único POR OBRA
alter table public.pedidos_materiais drop constraint if exists pedidos_materiais_evento_id_fkey;
alter table public.tarefas           drop constraint if exists tarefas_evento_id_fkey;
alter table public.eventos           drop constraint if exists eventos_pkey;
alter table public.eventos           add primary key (obra_id, id);
alter table public.checklist         drop constraint if exists checklist_pkey;
alter table public.checklist         add primary key (obra_id, id);
-- evento_id em tarefas/pedidos vira referência textual simples (validada na aplicação)

create index if not exists idx_eventos_obra   on public.eventos(obra_id);
create index if not exists idx_tarefas_obra   on public.tarefas(obra_id);
create index if not exists idx_diario_obra    on public.diario(obra_id);
create index if not exists idx_pedidos_obra   on public.pedidos_materiais(obra_id);
create index if not exists idx_checklist_obra on public.checklist(obra_id);

-- ---------- 7) RLS — ISOLAMENTO POR OBRA ----------
alter table public.obras         enable row level security;
alter table public.obra_usuarios enable row level security;

drop policy if exists "obras: leitura"     on public.obras;
drop policy if exists "obras: criar"       on public.obras;
drop policy if exists "obras: atualizar"   on public.obras;
create policy "obras: leitura" on public.obras for select to authenticated
  using (public.pode_ver_obra(id));
create policy "obras: criar" on public.obras for insert to authenticated
  with check (public.eh_admin());
create policy "obras: atualizar" on public.obras for update to authenticated
  using (public.eh_admin() or (public.pode_ver_obra(id) and public.papel_atual() = 'contratante'));

drop policy if exists "vinculos: leitura" on public.obra_usuarios;
drop policy if exists "vinculos: gerir"   on public.obra_usuarios;
create policy "vinculos: leitura" on public.obra_usuarios for select to authenticated
  using (public.eh_admin() or usuario_id = auth.uid());
create policy "vinculos: gerir" on public.obra_usuarios for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- eventos
drop policy if exists "eventos: leitura"    on public.eventos;
drop policy if exists "eventos: atualização" on public.eventos;
drop policy if exists "eventos: criar"      on public.eventos;
create policy "eventos: leitura" on public.eventos for select to authenticated
  using (public.pode_ver_obra(obra_id));
create policy "eventos: criar" on public.eventos for insert to authenticated
  with check (public.eh_admin());
create policy "eventos: atualização" on public.eventos for update to authenticated
  using (public.pode_ver_obra(obra_id))
  with check (
    public.papel_atual() in ('contratante','admin')
    or status in ('pendente','execucao','validacao')
  );

-- tarefas
drop policy if exists "tarefas: leitura" on public.tarefas;
drop policy if exists "tarefas: criar"   on public.tarefas;
drop policy if exists "tarefas: editar"  on public.tarefas;
drop policy if exists "tarefas: excluir" on public.tarefas;
create policy "tarefas: leitura" on public.tarefas for select to authenticated using (public.pode_ver_obra(obra_id));
create policy "tarefas: criar"   on public.tarefas for insert to authenticated with check (criado_por = auth.uid() and public.pode_ver_obra(obra_id));
create policy "tarefas: editar"  on public.tarefas for update to authenticated using (public.pode_ver_obra(obra_id) and (criado_por = auth.uid() or public.papel_atual() in ('contratante','admin')));
create policy "tarefas: excluir" on public.tarefas for delete to authenticated using (public.pode_ver_obra(obra_id) and (criado_por = auth.uid() or public.papel_atual() in ('contratante','admin')));

-- diário (imutável)
drop policy if exists "diario: leitura"   on public.diario;
drop policy if exists "diario: registrar" on public.diario;
create policy "diario: leitura"   on public.diario for select to authenticated using (public.pode_ver_obra(obra_id));
create policy "diario: registrar" on public.diario for insert to authenticated with check (criado_por = auth.uid() and public.pode_ver_obra(obra_id));

-- checklist
drop policy if exists "checklist: leitura" on public.checklist;
drop policy if exists "checklist: validar" on public.checklist;
drop policy if exists "checklist: criar"   on public.checklist;
create policy "checklist: leitura" on public.checklist for select to authenticated using (public.pode_ver_obra(obra_id));
create policy "checklist: criar"   on public.checklist for insert to authenticated with check (public.eh_admin());
create policy "checklist: validar" on public.checklist for update to authenticated
  using (public.pode_ver_obra(obra_id) and public.papel_atual() in ('contratante','admin'));

-- pedidos de materiais
drop policy if exists "pedidos: leitura"    on public.pedidos_materiais;
drop policy if exists "pedidos: criar"      on public.pedidos_materiais;
drop policy if exists "pedidos: atualizar"  on public.pedidos_materiais;
drop policy if exists "pedidos: excluir"    on public.pedidos_materiais;
create policy "pedidos: leitura" on public.pedidos_materiais for select to authenticated using (public.pode_ver_obra(obra_id));
create policy "pedidos: criar"   on public.pedidos_materiais for insert to authenticated with check (criado_por = auth.uid() and public.pode_ver_obra(obra_id));
create policy "pedidos: atualizar" on public.pedidos_materiais for update to authenticated
  using (public.pode_ver_obra(obra_id))
  with check (public.papel_atual() in ('contratante','admin') or status in ('rascunho','enviado'));
create policy "pedidos: excluir" on public.pedidos_materiais for delete to authenticated
  using (public.pode_ver_obra(obra_id) and (public.papel_atual() in ('contratante','admin') or (criado_por = auth.uid() and status in ('rascunho','enviado'))));

-- cotações seguem a obra do pedido
drop policy if exists "cotacoes: leitura" on public.cotacoes;
drop policy if exists "cotacoes: criar"   on public.cotacoes;
drop policy if exists "cotacoes: excluir" on public.cotacoes;
create policy "cotacoes: leitura" on public.cotacoes for select to authenticated
  using (exists (select 1 from public.pedidos_materiais p where p.id = pedido_id and public.pode_ver_obra(p.obra_id)));
create policy "cotacoes: criar" on public.cotacoes for insert to authenticated
  with check (exists (select 1 from public.pedidos_materiais p where p.id = pedido_id and public.pode_ver_obra(p.obra_id)
    and (p.status in ('rascunho','enviado') or public.papel_atual() in ('contratante','admin'))));
create policy "cotacoes: excluir" on public.cotacoes for delete to authenticated
  using (exists (select 1 from public.pedidos_materiais p where p.id = pedido_id and public.pode_ver_obra(p.obra_id)
    and (p.status in ('rascunho','enviado') or public.papel_atual() in ('contratante','admin'))));

-- ---------- 8) DUPLICAÇÃO DE OBRA A PARTIR DE MODELO ----------
create or replace function public.duplicar_obra(
  p_modelo bigint, p_codigo text, p_nome text, p_cliente text, p_contratada text,
  p_local text, p_valor numeric, p_assinatura date, p_entrega date,
  p_copiar_valores boolean default true
) returns bigint
language plpgsql security definer set search_path = public as $$
declare nova_id bigint; fator numeric := 1;
begin
  if not public.eh_admin() then raise exception 'Apenas administradores podem criar obras.'; end if;

  insert into public.obras (codigo, nome, cliente, contratada, local, valor_global,
                            retencao_pct, assinatura, entrega_final, kickoff, mes_atual, meses, criado_por)
  select p_codigo, p_nome, p_cliente, p_contratada, p_local, p_valor,
         m.retencao_pct, p_assinatura, p_entrega,
         case when p_copiar_valores then m.kickoff else 0 end, 1,
         case when p_copiar_valores then m.meses else '[]'::jsonb end, auth.uid()
  from public.obras m where m.id = p_modelo
  returning id into nova_id;

  -- eventos: estrutura sempre; valores conforme a opção escolhida
  insert into public.eventos (obra_id, id, mes, etapa, descricao, criterio, tipo, aprova,
                              valor_bruto, faturamento_direto, status, valor_glosa, docs)
  select nova_id, e.id, e.mes, e.etapa, e.descricao, e.criterio, e.tipo, e.aprova,
         case when p_copiar_valores then e.valor_bruto else 0 end,
         case when p_copiar_valores then e.faturamento_direto else 0 end,
         'pendente', 0, array[false,false,false,false,false,false,false]
  from public.eventos e where e.obra_id = p_modelo;

  -- checklist: itens do modelo, todos em aberto
  insert into public.checklist (obra_id, id, titulo, detalhe, clausula, prazo, responsavel, concluido)
  select nova_id, c.id, c.titulo, c.detalhe, c.clausula, null, c.responsavel, false
  from public.checklist c where c.obra_id = p_modelo;

  -- o criador já fica vinculado
  insert into public.obra_usuarios (obra_id, usuario_id) values (nova_id, auth.uid())
  on conflict do nothing;

  return nova_id;
end $$;

-- ---------- 9) VISÃO CONSOLIDADA DO PORTFÓLIO ----------
create or replace view public.portfolio as
select o.id, o.codigo, o.nome, o.cliente, o.contratada, o.local, o.status,
       o.valor_global, o.retencao_pct, o.entrega_final, o.mes_atual,
       coalesce(m.medido, 0) as medido,
       case when o.valor_global > 0 then coalesce(m.medido,0) / o.valor_global * 100 else 0 end as pct,
       coalesce(v.em_validacao, 0) as em_validacao,
       coalesce(pm.aguardando, 0) as pedidos_aguardando
from public.obras o
left join lateral (
  select sum(e.valor_bruto - coalesce(e.valor_glosa,0)) as medido
  from public.eventos e where e.obra_id = o.id and e.status in ('aprovado','glosado')
) m on true
left join lateral (
  select count(*) as em_validacao from public.eventos e where e.obra_id = o.id and e.status = 'validacao'
) v on true
left join lateral (
  select count(*) as aguardando from public.pedidos_materiais p where p.obra_id = o.id and p.status = 'enviado'
) pm on true;

-- =====================================================================
-- FIM. Após rodar: seus dados atuais viram a Obra #1 e nada se perde.
-- =====================================================================
