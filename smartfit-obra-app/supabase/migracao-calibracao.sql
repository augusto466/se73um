-- ============================================================
-- MIGRAÇÃO CALIBRAÇÃO — o sistema aprende com a obra real.
--
-- O motor nasceu com os índices da Moda Verão. Isso é um ponto de partida,
-- não uma verdade eterna: cada obra executada tem custo real, e é ele que
-- deve corrigir o modelo. Sem isso, um erro de orçamento se repete para
-- sempre — que é exatamente o que aconteceu até aqui.
--
-- Rodar no SQL Editor do Supabase ANTES do push.
-- ============================================================

-- ---------- 1) HISTÓRICO DE CALIBRAÇÃO ----------
-- Toda alteração de índice ou custo fica registrada: de quanto para quanto,
-- com base em qual obra e por quê. Modelo sem rastro é chute com aparência de método.
create table if not exists public.modelo_calibracoes (
  id bigint generated always as identity primary key,
  modelo_id bigint not null references public.modelos_orcamento(id) on delete cascade,
  origem text not null check (origem in ('obra_real','manual','importacao')),
  obra_id bigint references public.obras(id),
  motivo text not null,
  itens_afetados int not null default 0,
  -- [{item_id, campo, de, para}]
  diff jsonb not null default '[]',
  custo_antes numeric(14,2),
  custo_depois numeric(14,2),
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);
create index if not exists idx_calib_modelo on public.modelo_calibracoes(modelo_id, criado_em desc);

-- calibração é registro histórico: não se edita nem se apaga
create or replace function public.calibracao_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'Calibrações são imutáveis — é o histórico de como o modelo aprendeu.';
end $$;

drop trigger if exists trg_calib_upd on public.modelo_calibracoes;
drop trigger if exists trg_calib_del on public.modelo_calibracoes;
create trigger trg_calib_upd before update on public.modelo_calibracoes
  for each row execute function public.calibracao_imutavel();
create trigger trg_calib_del before delete on public.modelo_calibracoes
  for each row execute function public.calibracao_imutavel();

-- rastro no item: de onde veio o número atual
alter table public.modelo_itens add column if not exists calibrado_em timestamptz;
alter table public.modelo_itens add column if not exists calibrado_obra_id bigint references public.obras(id);
alter table public.modelo_itens add column if not exists custo_original numeric(14,4);
alter table public.modelo_itens add column if not exists indice_original numeric(14,6);

-- guarda o valor de nascença antes da primeira calibração
update public.modelo_itens set custo_original = custo_unitario where custo_original is null;
update public.modelo_itens set indice_original = indice where indice_original is null;

-- ---------- 2) IMPORTAÇÃO DE BASE (SINAPI) ----------
create table if not exists public.importacoes_base (
  id bigint generated always as identity primary key,
  base_id text not null references public.bases_preco(id),
  arquivo text,
  linhas_lidas int not null default 0,
  linhas_novas int not null default 0,
  linhas_atualizadas int not null default 0,
  variacao_media_pct numeric(8,2),
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);

-- base de GO nasce pronta para receber a planilha da Caixa
insert into public.bases_preco (id, nome, tipo, uf, referencia, desonerada, observacao) values
  ('sinapi_go', 'SINAPI - GO - Não Desonerado', 'publica', 'GO', null, false,
   'Base de Goiás. Importe a planilha mensal da Caixa em Comercial → Base de preços. As obras são em GO — usar a base de MT distorce o custo.')
on conflict (id) do nothing;

-- ---------- 3) EDIÇÃO DE PROPOSTA ----------
-- o motor propõe; o usuário ajusta. Sem isso a proposta é rígida demais
-- para uma negociação real.
alter table public.proposta_itens add column if not exists quantidade_motor numeric(14,4);
alter table public.proposta_itens add column if not exists custo_motor numeric(14,4);

-- guarda o que o motor gerou, para dar para ver o que foi ajustado à mão
update public.proposta_itens set quantidade_motor = quantidade where quantidade_motor is null;
update public.proposta_itens set custo_motor = custo_unitario where custo_motor is null;

-- ---------- 4) VIEW: o que o real diz sobre o modelo ----------
-- Cruza o índice do modelo com o custo executado das obras. É a base da
-- calibração: mostra onde o modelo está mentindo antes de você orçar de novo.
create or replace view public.modelo_vs_real as
select mi.modelo_id,
       mi.etapa,
       count(*) as itens_modelo,
       sum(mi.custo_unitario * mi.indice) as custo_indice_m2,
       de.obra_id,
       de.custo_orcado,
       de.valor_comprado,
       case when de.custo_orcado > 0 and de.valor_comprado > 0
            then round(de.valor_comprado / de.custo_orcado, 4)
            else null end as fator_real
from public.modelo_itens mi
left join public.desvio_etapa de
  on upper(de.etapa) like '%' || upper(left(mi.etapa, 8)) || '%'
 and de.valor_comprado > 0
group by mi.modelo_id, mi.etapa, de.obra_id, de.custo_orcado, de.valor_comprado;

-- ---------- 5) RLS ----------
alter table public.modelo_calibracoes enable row level security;
alter table public.importacoes_base   enable row level security;

drop policy if exists "calib: gestor" on public.modelo_calibracoes;
create policy "calib: gestor" on public.modelo_calibracoes
  for all to authenticated
  using (public.papel_atual() in ('admin','contratante'))
  with check (public.papel_atual() in ('admin','contratante'));

drop policy if exists "imp: gestor" on public.importacoes_base;
create policy "imp: gestor" on public.importacoes_base
  for all to authenticated
  using (public.papel_atual() in ('admin','contratante'))
  with check (public.papel_atual() in ('admin','contratante'));
