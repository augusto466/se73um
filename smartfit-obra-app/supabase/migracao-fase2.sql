-- =====================================================================
-- MIGRAÇÃO 004 — FASE 2: ROTINAS · MEU DIA · QUALIDADE (FVS) · METAS
-- Execute no Supabase: SQL Editor > New query > cole tudo > Run
-- Seguro com o sistema no ar: só adiciona.
-- =====================================================================

-- ---------- 1) ROTINAS (tarefas que se repetem) ----------
create table if not exists public.rotinas (
  id bigint generated always as identity primary key,
  obra_id bigint references public.obras(id) on delete cascade,  -- null = rotina da empresa
  titulo text not null,
  detalhe text,
  responsavel_id uuid references public.profiles(id),
  frequencia text not null check (frequencia in ('diaria','semanal','quinzenal','mensal','trimestral')),
  dia_semana int check (dia_semana between 0 and 6),   -- semanal/quinzenal (0=dom)
  dia_mes int check (dia_mes between 1 and 28),        -- mensal/trimestral
  prioridade text not null default 'media' check (prioridade in ('alta','media','baixa')),
  ativo boolean not null default true,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);

-- ocorrências geradas a partir das rotinas
create table if not exists public.rotina_ocorrencias (
  id bigint generated always as identity primary key,
  rotina_id bigint not null references public.rotinas(id) on delete cascade,
  obra_id bigint references public.obras(id) on delete cascade,
  vencimento date not null,
  status text not null default 'pendente' check (status in ('pendente','concluida','pulada')),
  concluida_em timestamptz,
  concluida_por uuid references public.profiles(id),
  observacao text,
  unique (rotina_id, vencimento)
);

create index if not exists idx_rot_oc_venc on public.rotina_ocorrencias(vencimento);
create index if not exists idx_rot_oc_st   on public.rotina_ocorrencias(status);

-- ---------- 2) QUALIDADE — FVS (Ficha de Verificação de Serviço) ----------
create table if not exists public.fvs_modelos (
  id bigint generated always as identity primary key,
  disciplina text not null,
  titulo text not null,
  itens jsonb not null default '[]',   -- [{ordem, descricao, norma}]
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.fvs_inspecoes (
  id bigint generated always as identity primary key,
  obra_id bigint not null references public.obras(id) on delete cascade,
  modelo_id bigint references public.fvs_modelos(id),
  evento_id text,                       -- vincula ao evento de medição
  titulo text not null,
  disciplina text,
  local_servico text,                   -- ex.: "Bloco B — eixos 3 a 7"
  respostas jsonb not null default '[]',-- [{descricao, resultado: c|nc|na, observacao}]
  resultado text not null default 'em_andamento'
    check (resultado in ('em_andamento','aprovado','aprovado_ressalvas','reprovado')),
  pendencias text,
  inspecionado_por uuid references public.profiles(id),
  inspecionado_em timestamptz,
  validado_por uuid references public.profiles(id),
  validado_em timestamptz,
  criado_em timestamptz not null default now()
);

create index if not exists idx_fvs_obra on public.fvs_inspecoes(obra_id);

-- ---------- 3) METAS ----------
create table if not exists public.metas (
  id bigint generated always as identity primary key,
  obra_id bigint references public.obras(id) on delete cascade,  -- null = meta da empresa
  titulo text not null,
  descricao text,
  unidade text not null default 'numero' check (unidade in ('numero','percentual','moeda','dias')),
  alvo numeric not null,
  realizado numeric not null default 0,
  direcao text not null default 'maior' check (direcao in ('maior','menor')), -- maior=quanto maior melhor
  periodo_inicio date not null,
  periodo_fim date not null,
  responsavel_id uuid references public.profiles(id),
  fonte text not null default 'manual' check (fonte in ('manual','automatica')),
  chave_automatica text,   -- ex.: 'margem_obra', 'rdos_mes', 'medicoes_aprovadas'
  criado_em timestamptz not null default now()
);

-- ---------- 4) RLS ----------
alter table public.rotinas            enable row level security;
alter table public.rotina_ocorrencias enable row level security;
alter table public.fvs_modelos        enable row level security;
alter table public.fvs_inspecoes      enable row level security;
alter table public.metas              enable row level security;

-- rotinas: vê quem tem acesso à obra (ou rotina da empresa, só admin)
drop policy if exists "rotinas: leitura" on public.rotinas;
drop policy if exists "rotinas: gerir"   on public.rotinas;
create policy "rotinas: leitura" on public.rotinas for select to authenticated
  using (obra_id is null and public.eh_admin() or (obra_id is not null and public.pode_ver_obra(obra_id)));
create policy "rotinas: gerir" on public.rotinas for all to authenticated
  using (public.eh_admin() or (obra_id is not null and public.pode_ver_obra(obra_id) and public.papel_atual() = 'contratante'))
  with check (public.eh_admin() or (obra_id is not null and public.pode_ver_obra(obra_id) and public.papel_atual() = 'contratante'));

drop policy if exists "rot_oc: leitura" on public.rotina_ocorrencias;
drop policy if exists "rot_oc: gerir"   on public.rotina_ocorrencias;
create policy "rot_oc: leitura" on public.rotina_ocorrencias for select to authenticated
  using (obra_id is null and public.eh_admin() or (obra_id is not null and public.pode_ver_obra(obra_id)));
-- qualquer um com acesso pode concluir a ocorrência que é dele
create policy "rot_oc: gerir" on public.rotina_ocorrencias for all to authenticated
  using (obra_id is null and public.eh_admin() or (obra_id is not null and public.pode_ver_obra(obra_id)))
  with check (obra_id is null and public.eh_admin() or (obra_id is not null and public.pode_ver_obra(obra_id)));

-- FVS: modelos são catálogo compartilhado
drop policy if exists "fvs_mod: leitura" on public.fvs_modelos;
drop policy if exists "fvs_mod: gerir"   on public.fvs_modelos;
create policy "fvs_mod: leitura" on public.fvs_modelos for select to authenticated using (true);
create policy "fvs_mod: gerir"   on public.fvs_modelos for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- inspeções: contratada registra; contratante/admin validam
drop policy if exists "fvs: leitura" on public.fvs_inspecoes;
drop policy if exists "fvs: criar"   on public.fvs_inspecoes;
drop policy if exists "fvs: editar"  on public.fvs_inspecoes;
create policy "fvs: leitura" on public.fvs_inspecoes for select to authenticated
  using (public.pode_ver_obra(obra_id));
create policy "fvs: criar" on public.fvs_inspecoes for insert to authenticated
  with check (public.pode_ver_obra(obra_id));
create policy "fvs: editar" on public.fvs_inspecoes for update to authenticated
  using (public.pode_ver_obra(obra_id));

-- metas: admin gere; contratante vê das obras dele
drop policy if exists "metas: leitura" on public.metas;
drop policy if exists "metas: gerir"   on public.metas;
create policy "metas: leitura" on public.metas for select to authenticated
  using (obra_id is null or public.pode_ver_obra(obra_id));
create policy "metas: gerir" on public.metas for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- ---------- 5) GERAR OCORRÊNCIAS DAS ROTINAS ----------
create or replace function public.gerar_ocorrencias(p_dias int default 30)
returns int language plpgsql security definer set search_path = public as $$
declare r record; d date; fim date; n int := 0; venc date;
begin
  fim := current_date + p_dias;
  for r in select * from public.rotinas where ativo loop
    d := current_date;
    while d <= fim loop
      venc := null;
      if r.frequencia = 'diaria' then
        if extract(dow from d) between 1 and 5 then venc := d; end if;   -- dias úteis
      elsif r.frequencia = 'semanal' then
        if extract(dow from d) = coalesce(r.dia_semana, 1) then venc := d; end if;
      elsif r.frequencia = 'quinzenal' then
        if extract(dow from d) = coalesce(r.dia_semana, 1)
           and (floor(extract(epoch from d) / 604800)::int % 2 = 0) then venc := d; end if;
      elsif r.frequencia = 'mensal' then
        if extract(day from d) = coalesce(r.dia_mes, 1) then venc := d; end if;
      elsif r.frequencia = 'trimestral' then
        if extract(day from d) = coalesce(r.dia_mes, 1)
           and extract(month from d)::int % 3 = 1 then venc := d; end if;
      end if;

      if venc is not null and not exists (
        select 1 from public.rotina_ocorrencias o where o.rotina_id = r.id and o.vencimento = venc
      ) then
        insert into public.rotina_ocorrencias (rotina_id, obra_id, vencimento)
        values (r.id, r.obra_id, venc);
        n := n + 1;
      end if;
      d := d + 1;
    end loop;
  end loop;
  return n;
end $$;

-- ---------- 6) MODELOS DE FVS (catálogo inicial) ----------
insert into public.fvs_modelos (disciplina, titulo, itens) values
('Fundação', 'FVS — Estacas e blocos de coroamento',
 '[{"ordem":1,"descricao":"Locação conferida conforme projeto (eixos e cotas)","norma":"NBR 6122"},
   {"ordem":2,"descricao":"Diâmetro e profundidade das estacas conforme projeto","norma":"NBR 6122"},
   {"ordem":3,"descricao":"Armadura: bitola, quantidade e cobrimento conferidos","norma":"NBR 6118"},
   {"ordem":4,"descricao":"Concreto: fck, slump e moldagem de corpos de prova","norma":"NBR 12655"},
   {"ordem":5,"descricao":"Limpeza do fundo da cava antes da concretagem","norma":"—"},
   {"ordem":6,"descricao":"Registro fotográfico e diário de concretagem preenchidos","norma":"Cl. 3.4"}]'::jsonb),
('Estrutura Metálica', 'FVS — Montagem de estrutura metálica',
 '[{"ordem":1,"descricao":"Chumbadores: locação, nivelamento e torque","norma":"NBR 8800"},
   {"ordem":2,"descricao":"Prumo e alinhamento dos pilares conferidos","norma":"NBR 8800"},
   {"ordem":3,"descricao":"Soldas: inspeção visual, sem porosidade ou mordedura","norma":"AWS D1.1"},
   {"ordem":4,"descricao":"Parafusos: aperto e travamento conforme especificação","norma":"NBR 8800"},
   {"ordem":5,"descricao":"Pintura/proteção anticorrosiva íntegra após montagem","norma":"—"},
   {"ordem":6,"descricao":"Certificados dos materiais arquivados","norma":"Cl. 3.4"}]'::jsonb),
('Cobertura e Vedação', 'FVS — Cobertura e fechamento',
 '[{"ordem":1,"descricao":"Telhas: fixação, sobreposição e caimento conforme projeto","norma":"NBR 6120"},
   {"ordem":2,"descricao":"Estanqueidade: sem infiltração em teste de mangueira","norma":"Contrato Principal"},
   {"ordem":3,"descricao":"Calhas, rufos e condutores instalados e testados","norma":"NBR 10844"},
   {"ordem":4,"descricao":"Isopainéis: alinhamento, juntas e acabamento","norma":"—"},
   {"ordem":5,"descricao":"Vedação de shafts e passagens concluída","norma":"—"}]'::jsonb),
('Instalações Elétricas', 'FVS — Instalações elétricas e SPDA',
 '[{"ordem":1,"descricao":"Eletrodutos e caixas conforme projeto, sem obstrução","norma":"NBR 5410"},
   {"ordem":2,"descricao":"Cabos: bitola, identificação e continuidade testadas","norma":"NBR 5410"},
   {"ordem":3,"descricao":"Quadros: identificação de circuitos e aperto de conexões","norma":"NBR 5410"},
   {"ordem":4,"descricao":"Aterramento: medição de resistência dentro do limite","norma":"NBR 5419"},
   {"ordem":5,"descricao":"SPDA: captação, descidas e teste de impedância","norma":"NBR 5419"},
   {"ordem":6,"descricao":"ART emitida e protocolos na concessionária","norma":"Cl. 2.3"}]'::jsonb),
('Instalações Hidráulicas', 'FVS — Hidrossanitário e incêndio',
 '[{"ordem":1,"descricao":"Tubulações: diâmetro, caimento e suportes conforme projeto","norma":"NBR 5626"},
   {"ordem":2,"descricao":"Teste de estanqueidade sob pressão realizado e aprovado","norma":"NBR 5626"},
   {"ordem":3,"descricao":"Esgoto: pontos de interligação e ventilação executados","norma":"NBR 8160"},
   {"ordem":4,"descricao":"Combate a incêndio: hidrantes, sprinklers e reservatório","norma":"NBR 13714"},
   {"ordem":5,"descricao":"Reserva de água conforme especificação do Contrato Principal","norma":"Contrato"}]'::jsonb),
('Piso Industrial', 'FVS — Piso industrial de concreto',
 '[{"ordem":1,"descricao":"Base compactada e nivelada, com lastro conferido","norma":"—"},
   {"ordem":2,"descricao":"Armadura/tela posicionada com espaçadores","norma":"NBR 6118"},
   {"ordem":3,"descricao":"Concreto: fck e slump conferidos; corpos de prova moldados","norma":"NBR 12655"},
   {"ordem":4,"descricao":"Nivelamento e planicidade dentro da tolerância","norma":"—"},
   {"ordem":5,"descricao":"Juntas serradas no prazo e seladas","norma":"—"},
   {"ordem":6,"descricao":"Cura executada conforme procedimento","norma":"NBR 14931"}]'::jsonb)
on conflict do nothing;

-- ---------- 7) ROTINAS INICIAIS SUGERIDAS (Obra #1) ----------
do $$
declare v_obra bigint;
begin
  select id into v_obra from public.obras where codigo = 'TK-328/2026';
  if v_obra is not null and not exists (select 1 from public.rotinas) then
    insert into public.rotinas (obra_id, titulo, detalhe, frequencia, dia_semana, dia_mes, prioridade) values
    (v_obra, 'Registrar RDO do dia', 'Atividades, efetivo, clima e ocorrências (Cl. 4.3.1)', 'diaria', null, null, 'alta'),
    (v_obra, 'Relatório fotográfico semanal', 'Evidência para medição (Cl. 3.4)', 'semanal', 5, null, 'media'),
    (v_obra, 'Reunião de acompanhamento de obra', 'Avanço, riscos e travas com o preposto', 'semanal', 1, null, 'alta'),
    (null,   'Conciliação bancária e baixa de lançamentos', 'Agenda de pagamentos e recebimentos da semana', 'semanal', 1, null, 'alta'),
    (v_obra, 'Fechamento de medição do mês', 'Boletim, NF e documentos (Cl. 3.4)', 'mensal', null, 25, 'alta'),
    (null,   'Conferir certidões e regularidade (FGTS, INSS, fiscal)', 'Documentação exigida pela Cl. 13.2', 'mensal', null, 5, 'media'),
    (null,   'Revisar fluxo de caixa das próximas 12 semanas', 'Antecipar furos de caixa', 'semanal', 1, null, 'alta');
  end if;
end $$;

-- ---------- 8) METAS INICIAIS ----------
do $$
declare v_obra bigint;
begin
  select id into v_obra from public.obras where codigo = 'TK-328/2026';
  if not exists (select 1 from public.metas) then
    insert into public.metas (obra_id, titulo, descricao, unidade, alvo, direcao, periodo_inicio, periodo_fim, fonte, chave_automatica) values
    (v_obra, 'Avanço físico-financeiro da obra', 'Percentual medido sobre o valor global', 'percentual', 100, 'maior', current_date, '2027-05-10', 'automatica', 'avanco_obra'),
    (v_obra, 'RDOs registrados no mês', 'Diário de obras em dia (Cl. 4.3.1)', 'numero', 20, 'maior', date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 'automatica', 'rdos_mes'),
    (null,   'Margem bruta da carteira', 'Receita medida menos custo apropriado', 'percentual', 15, 'maior', date_trunc('year', current_date)::date, (date_trunc('year', current_date) + interval '1 year - 1 day')::date, 'automatica', 'margem_carteira'),
    (null,   'Rotinas concluídas no prazo', 'Aderência à disciplina operacional', 'percentual', 90, 'maior', date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 'automatica', 'rotinas_prazo');
  end if;
end $$;

-- ---------- 9) VIEW: MEU DIA ----------
create or replace view public.meu_dia as
-- tarefas do kanban
select 'tarefa' as tipo, t.id::text as id, t.obra_id, t.descricao as titulo,
       t.prazo as vencimento, t.prioridade,
       case when t.coluna = 2 then 'em validação' else 'em execução' end as situacao,
       t.responsavel as responsavel_txt, null::uuid as responsavel_id
from public.tarefas t where t.coluna < 3
union all
-- ocorrências de rotina pendentes
select 'rotina', o.id::text, o.obra_id, r.titulo, o.vencimento, r.prioridade,
       'rotina ' || r.frequencia, null, r.responsavel_id
from public.rotina_ocorrencias o
join public.rotinas r on r.id = o.rotina_id
where o.status = 'pendente'
union all
-- medições aguardando validação
select 'medicao', e.obra_id::text || ':' || e.id, e.obra_id,
       'Validar medição ' || e.id || ' — ' || e.etapa, current_date, 'alta',
       'aguardando fiscalização', null
from public.eventos e where e.status = 'validacao'
union all
-- pedidos aguardando aprovação
select 'pedido', p.id::text, p.obra_id,
       'Aprovar pedido PM-' || lpad(p.id::text, 3, '0') || ' — ' || p.titulo,
       coalesce(p.necessidade, current_date), 'alta', 'aguardando aprovação', null
from public.pedidos_materiais p where p.status = 'enviado'
union all
-- financeiro vencendo
select 'financeiro', l.id::text, l.obra_id,
       (case when l.natureza = 'pagar' then 'Pagar: ' else 'Receber: ' end) || l.descricao,
       l.vencimento, case when l.vencimento < current_date then 'alta' else 'media' end,
       l.natureza, null
from public.lancamentos l
where l.status in ('previsto','confirmado') and l.vencimento <= current_date + 7;
