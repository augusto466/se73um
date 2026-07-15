-- ============================================================
-- MIGRAÇÃO COMERCIAL — orçamento com custo/BDI separados,
-- base de composições, motor paramétrico e pipeline.
--
-- CORREÇÃO CRÍTICA: hoje `orcamento.valor_orcado` guarda PREÇO (com BDI
-- embutido) e o Cockpit calcula margem = valor_global − valor_orcado.
-- Isso subtrai preço de preço e produz margem falsa (a TK-328 aparece
-- com −2,3% quando a real é ≈ +18%). Aqui o custo passa a ser separado
-- do BDI, e a margem passa a ser calculada contra o CUSTO.
--
-- Rodar no SQL Editor do Supabase ANTES do push.
-- ============================================================

-- ---------- 1) ORÇAMENTO: custo e BDI separados ----------
alter table public.orcamento add column if not exists custo_orcado numeric(14,2);
alter table public.orcamento add column if not exists bdi_pct numeric(6,4) not null default 0.25;

-- o que está lá é preço com BDI de 25% embutido: deriva o custo
update public.orcamento
   set custo_orcado = round(valor_orcado / 1.25, 2)
 where custo_orcado is null;

comment on column public.orcamento.valor_orcado is 'PREÇO orçado (custo + BDI). É o que vai na proposta.';
comment on column public.orcamento.custo_orcado is 'CUSTO orçado, sem BDI. É contra ele que a margem é medida.';

-- ---------- 2) BASES DE PREÇO ----------
create table if not exists public.bases_preco (
  id text primary key,                   -- sinapi_04_2025_go, modo, propria
  nome text not null,
  tipo text not null check (tipo in ('publica','propria')),
  uf text,
  referencia date,                       -- mês da tabela
  desonerada boolean,
  observacao text,
  criado_em timestamptz not null default now()
);

insert into public.bases_preco (id, nome, tipo, uf, referencia, desonerada, observacao) values
  ('modo',    'Base MODO',    'propria', null, null, null, 'Composições próprias: estrutura metálica, isopainel, montagem. É o diferencial da empresa — não existe no SINAPI.'),
  ('propria', 'Própria',      'propria', null, null, null, 'Itens cotados ou estimados caso a caso.'),
  ('sem_base','Sem base',     'propria', null, null, null, 'Verba, estimativa ou item a cotar.')
on conflict (id) do nothing;

-- ---------- 3) COMPOSIÇÕES E INSUMOS ----------
create table if not exists public.composicoes (
  id bigint generated always as identity primary key,
  base_id text not null references public.bases_preco(id),
  codigo text not null,                  -- 10777, 2025-N225, #1.1
  descricao text not null,
  unidade text,
  tipo text not null default 'composicao' check (tipo in ('composicao','insumo')),
  custo_unitario numeric(14,4) not null,
  etapa_padrao text,                     -- em que etapa costuma entrar
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  unique (base_id, codigo)
);
create index if not exists idx_comp_desc on public.composicoes using gin(to_tsvector('portuguese', descricao));
create index if not exists idx_comp_base on public.composicoes(base_id, ativo);

-- ---------- 4) MODELOS PARAMÉTRICOS ----------
-- Um modelo é a "receita" de um tipo de obra: as etapas, os itens e o
-- índice de cada um. O índice diz quanto do item se consome por unidade
-- do driver (m² de projeção, m² de laje, mês de prazo, ou fixo).
create table if not exists public.modelos_orcamento (
  id bigint generated always as identity primary key,
  nome text not null,
  tipo_obra text not null,               -- galpao_metalico, bts_academia, estrutura_avulsa
  descricao text,
  origem_obra_id bigint references public.obras(id),   -- de qual obra os índices vieram
  area_referencia numeric(12,2),
  prazo_referencia numeric(6,2),
  ativo boolean not null default true,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);

create table if not exists public.modelo_itens (
  id bigint generated always as identity primary key,
  modelo_id bigint not null references public.modelos_orcamento(id) on delete cascade,
  ordem int not null default 0,
  etapa text not null,
  subetapa text,
  indice_item text,                      -- 3.2.1
  composicao_id bigint references public.composicoes(id),
  codigo text,
  base_id text references public.bases_preco(id),
  descricao text not null,
  unidade text,
  tipo text not null default 'composicao',
  -- o coração do motor: quanto se consome por unidade do driver
  driver text not null default 'area_proj'
    check (driver in ('area_proj','area_laje','area_fachada','prazo','fixo','manual')),
  indice numeric(14,6) not null default 0,
  custo_unitario numeric(14,4) not null default 0,
  bdi_pct numeric(6,4) not null default 0.25,
  observacao text
);
create index if not exists idx_mitem_modelo on public.modelo_itens(modelo_id, ordem);

-- ---------- 5) PIPELINE COMERCIAL ----------
create table if not exists public.oportunidades (
  id bigint generated always as identity primary key,
  codigo text unique,                    -- OP-2026-001
  titulo text not null,
  cliente text not null,
  contato_nome text,
  contato_email text,
  contato_telefone text,
  origem text not null default 'indicacao' check (origem in ('indicacao','rfp_rede','prospeccao','recorrente','outro')),
  tipo_obra text,
  local text,
  -- funil real: contato → premissas → orçamento → proposta → negociação → assinatura
  estagio text not null default 'contato'
    check (estagio in ('contato','premissas','orcamento','proposta','negociacao','assinada','perdida')),
  valor_estimado numeric(14,2),
  probabilidade int not null default 20 check (probabilidade between 0 and 100),
  data_decisao date,                     -- quando o cliente decide
  prazo_proposta date,                   -- quando a proposta precisa estar entregue
  responsavel_id uuid references public.profiles(id),
  centro_id text references public.centros_custo(id) default 'cc_comercial',
  obra_id bigint references public.obras(id),   -- preenchido quando vira obra
  motivo_perda text,
  observacoes text,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_op_estagio on public.oportunidades(estagio, data_decisao);

-- premissas: o que se sabe da obra antes de orçar. Alimenta o motor.
create table if not exists public.oportunidade_premissas (
  oportunidade_id bigint primary key references public.oportunidades(id) on delete cascade,
  area_projecao numeric(12,2),
  area_laje numeric(12,2),
  area_fachada numeric(12,2),
  pe_direito numeric(6,2),
  prazo_meses numeric(6,2),
  tipo_estrutura text,
  tipo_fechamento text,
  tipo_cobertura text,
  tipo_piso text,
  padrao_acabamento text check (padrao_acabamento in ('simples','medio','alto')),
  terreno_nivelado boolean,
  tem_sondagem boolean,
  distancia_km numeric(8,2),             -- para o custo de transporte
  notas text,
  atualizado_em timestamptz not null default now()
);

-- ---------- 6) PROPOSTAS (versionadas) ----------
create table if not exists public.propostas (
  id bigint generated always as identity primary key,
  oportunidade_id bigint not null references public.oportunidades(id) on delete cascade,
  versao int not null default 1,         -- R00, R01, R02...
  modelo_id bigint references public.modelos_orcamento(id),
  titulo text,
  introducao text,
  custo_total numeric(14,2) not null default 0,
  bdi_medio numeric(6,4),
  preco_total numeric(14,2) not null default 0,
  prazo_meses numeric(6,2),
  validade_dias int not null default 30,
  condicoes_pagamento text,
  status text not null default 'rascunho'
    check (status in ('rascunho','enviada','em_negociacao','aceita','recusada','substituida')),
  enviada_em date,
  o_que_mudou text,                      -- munição de negociação: o diff da versão
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now(),
  unique (oportunidade_id, versao)
);

create table if not exists public.proposta_itens (
  id bigint generated always as identity primary key,
  proposta_id bigint not null references public.propostas(id) on delete cascade,
  ordem int not null default 0,
  etapa text not null,
  subetapa text,
  indice_item text,
  codigo text,
  base_id text,
  descricao text not null,
  unidade text,
  quantidade numeric(14,4) not null default 0,
  custo_unitario numeric(14,4) not null default 0,
  bdi_pct numeric(6,4) not null default 0.25,
  -- gerados: a cadeia do XLSX (qtd → custo → BDI → preço)
  custo_total numeric(14,2) generated always as (round(quantidade * custo_unitario, 2)) stored,
  preco_unitario numeric(14,4) generated always as (round(custo_unitario * (1 + bdi_pct), 4)) stored,
  preco_total numeric(14,2) generated always as (round(quantidade * custo_unitario * (1 + bdi_pct), 2)) stored,
  origem text not null default 'motor' check (origem in ('motor','manual','ajustado')),
  observacao text
);
create index if not exists idx_pitem_prop on public.proposta_itens(proposta_id, ordem);

-- ---------- 7) VIEWS ----------
-- resumo da proposta por etapa: é o que vai no PDF
create or replace view public.proposta_etapas as
select p.id as proposta_id, i.etapa,
       min(i.ordem) as ordem,
       count(*) as itens,
       sum(i.custo_total) as custo,
       sum(i.preco_total) as preco,
       round(100.0 * sum(i.preco_total) / nullif(sum(sum(i.preco_total)) over (partition by p.id), 0), 1) as pct
from public.propostas p
join public.proposta_itens i on i.proposta_id = p.id
group by p.id, i.etapa
order by ordem;

-- funil: valor ponderado por probabilidade
create or replace view public.funil_comercial as
select o.estagio,
       count(*) as qtd,
       coalesce(sum(o.valor_estimado), 0) as valor,
       coalesce(sum(o.valor_estimado * o.probabilidade / 100.0), 0) as valor_ponderado
from public.oportunidades o
where o.estagio not in ('assinada','perdida')
group by o.estagio;

-- ---------- 8) RLS ----------
alter table public.bases_preco            enable row level security;
alter table public.composicoes            enable row level security;
alter table public.modelos_orcamento      enable row level security;
alter table public.modelo_itens           enable row level security;
alter table public.oportunidades          enable row level security;
alter table public.oportunidade_premissas enable row level security;
alter table public.propostas              enable row level security;
alter table public.proposta_itens         enable row level security;

-- base de preços e modelos: gestor lê e escreve; contratada não vê custo
do $$
declare t text;
begin
  foreach t in array array['bases_preco','composicoes','modelos_orcamento','modelo_itens'] loop
    execute format('drop policy if exists "%s: gestor" on public.%I', t, t);
    execute format($p$create policy "%s: gestor" on public.%I for all to authenticated
      using (public.papel_atual() in ('admin','contratante'))
      with check (public.papel_atual() in ('admin','contratante'))$p$, t, t);
  end loop;
end $$;

-- comercial: só quem gere a empresa
do $$
declare t text;
begin
  foreach t in array array['oportunidades','oportunidade_premissas','propostas','proposta_itens'] loop
    execute format('drop policy if exists "%s: gestor" on public.%I', t, t);
    execute format($p$create policy "%s: gestor" on public.%I for all to authenticated
      using (public.papel_atual() in ('admin','contratante'))
      with check (public.papel_atual() in ('admin','contratante'))$p$, t, t);
  end loop;
end $$;

-- ---------- 9) VIEW desvio_etapa: passa a expor o CUSTO ----------
-- Mesma estrutura da original; só acrescenta custo_orcado/bdi_pct e
-- passa a medir o desvio de compra contra o CUSTO (não contra o preço).
create or replace view public.desvio_etapa as
select o.obra_id,
       o.etapa,
       o.ordem,
       o.valor_orcado,                                   -- PREÇO orçado (com BDI)
       o.custo_orcado,                                   -- CUSTO orçado (sem BDI)
       o.bdi_pct,
       coalesce(ev.contratado, 0) as valor_contratado,
       coalesce(ev.medido, 0)     as valor_medido,
       coalesce(pm.comprado, 0)   as valor_comprado,
       coalesce(pm.comprado, 0) - o.custo_orcado as desvio_compra,
       case when o.custo_orcado > 0
            then (coalesce(pm.comprado,0) - o.custo_orcado) / o.custo_orcado * 100
            else 0 end as desvio_pct
from public.orcamento o
left join lateral (
  select sum(e.valor_bruto) as contratado,
         sum(case when e.status in ('aprovado','glosado')
                  then e.valor_bruto - coalesce(e.valor_glosa,0) else 0 end) as medido
  from public.eventos e where e.obra_id = o.obra_id and e.etapa = o.etapa
) ev on true
left join lateral (
  select sum(c.valor_total) as comprado
  from public.pedidos_materiais p
  join public.cotacoes c on c.id = p.cotacao_vencedora
  join public.eventos e on e.obra_id = p.obra_id and e.id = p.evento_id
  where p.obra_id = o.obra_id and e.etapa = o.etapa and p.status in ('aprovado','comprado')
) pm on true;

-- ---------- 10) VIEW: composição do preço por obra ----------
create or replace view public.composicao_preco as
select ob.id as obra_id, ob.codigo, ob.valor_global,
       sum(o.custo_orcado) as custo_total,
       sum(o.valor_orcado) as preco_orcado,
       sum(o.valor_orcado) - sum(o.custo_orcado) as bdi_valor,
       case when sum(o.custo_orcado) > 0
            then round(100.0 * (sum(o.valor_orcado) / sum(o.custo_orcado) - 1), 2)
            else null end as bdi_efetivo_pct,
       ob.valor_global - sum(o.custo_orcado) as margem_bruta,
       case when ob.valor_global > 0
            then round(100.0 * (ob.valor_global - sum(o.custo_orcado)) / ob.valor_global, 2)
            else null end as margem_pct
from public.obras ob
join public.orcamento o on o.obra_id = ob.id
group by ob.id, ob.codigo, ob.valor_global;

-- ---------- 11) VIEW painel_ceo: o campo "custo_orcado" era PREÇO ----------
-- Ela somava valor_orcado (com BDI) e rotulava como custo_orcado. É essa view
-- que alimenta o Cockpit e o retrato do advisor — o erro se propagava para tudo.
-- Estrutura idêntica à original; muda só a origem do custo e acrescenta o preço.
create or replace view public.painel_ceo as
select o.id as obra_id, o.codigo, o.nome, o.cliente, o.status,
       o.valor_global, o.entrega_final, o.mes_atual, o.meses,
       coalesce(m.medido, 0) as medido,
       case when o.valor_global > 0 then coalesce(m.medido,0) / o.valor_global * 100 else 0 end as avanco_pct,
       coalesce(orc.custo, 0) as custo_orcado,           -- agora é CUSTO de verdade (sem BDI)
       coalesce(orc.preco, 0) as preco_orcado,           -- o que foi para a proposta
       coalesce(cmp.comprado, 0) as custo_comprado,
       coalesce(fin.a_receber, 0) as a_receber,
       coalesce(fin.a_pagar, 0) as a_pagar,
       coalesce(m.medido,0) - coalesce(cmp.comprado,0) as margem_atual,
       coalesce(v.em_validacao, 0) as em_validacao,
       coalesce(pd.aguardando, 0) as pedidos_aguardando,
       coalesce(dc.docs_vencidos, 0) as docs_vencidos,
       coalesce(q.nc_abertas, 0) as fvs_reprovadas
from public.obras o
left join lateral (
  select sum(e.valor_bruto - coalesce(e.valor_glosa,0)) as medido
  from public.eventos e where e.obra_id = o.id and e.status in ('aprovado','glosado')
) m on true
left join lateral (
  select sum(custo_orcado) as custo, sum(valor_orcado) as preco
  from public.orcamento where obra_id = o.id
) orc on true
left join lateral (
  select sum(c.valor_total) as comprado
  from public.pedidos_materiais p join public.cotacoes c on c.id = p.cotacao_vencedora
  where p.obra_id = o.id and p.status in ('aprovado','comprado')
) cmp on true
left join lateral (
  select sum(case when natureza='receber' then valor else 0 end) as a_receber,
         sum(case when natureza='pagar' then valor else 0 end) as a_pagar
  from public.lancamentos where obra_id = o.id and status in ('previsto','confirmado')
) fin on true
left join lateral (
  select count(*) as em_validacao from public.eventos where obra_id = o.id and status = 'validacao'
) v on true
left join lateral (
  select count(*) as aguardando from public.pedidos_materiais where obra_id = o.id and status = 'enviado'
) pd on true
left join lateral (
  select count(*) as docs_vencidos from public.documentos
  where (obra_id = o.id or obra_id is null) and validade is not null and validade < current_date
) dc on true
left join lateral (
  select count(*) as nc_abertas from public.fvs_inspecoes
  where obra_id = o.id and resultado in ('reprovado','aprovado_ressalvas')
) q on true;
-- ---------- 12) SEED: base SINAPI e composições da Moda Verão ----------
insert into public.bases_preco (id, nome, tipo, uf, referencia, desonerada, observacao) values
  ('sinapi_04_2025_mt', 'SINAPI 04/2025 - MT - Não Desonerado', 'publica', 'MT', '2025-04-01', false,
   'Base do orçamento Moda Verão. ATENÇÃO: é MT. Para obras em GO, importar a tabela de GO.')
on conflict (id) do nothing;

insert into public.composicoes (base_id, codigo, descricao, unidade, tipo, custo_unitario, etapa_padrao) values
  ('sem_base', '#1.1', 'Projetos Complementares, topografia e sondagem  - M²', null, 'composicao', 12000, 'PROJETOS'),
  ('sinapi_04_2025_mt', '10777', 'Locacao de container 2,30 x 4,30 m, alt. 2,50 m, para sanitario, com 3 bacias, 4 chuveiros, 1 lavatorio e 1 mictorio (nao inclui mobilizacao/desmobilizacao) - Escritório', 'MES', 'insumo', 962.26, 'SERVIÇOS PRELIMINARES'),
  ('sinapi_04_2025_mt', '10776', 'Locacao de container 2,30 x 6,00 m, alt. 2,50 m, para escritorio, sem divisorias internas e sem sanitario (nao inclui mobilizacao/desmobilizacao)', 'MES', 'insumo', 662.1, 'SERVIÇOS PRELIMINARES'),
  ('propria', '2025-N225', 'Mobilização e desmobilização', 'UN', 'insumo', 4500, 'SERVIÇOS PRELIMINARES'),
  ('propria', '2025-N224', 'Aluguel de equipamentos, EPI/ EPC', 'MES', 'insumo', 250, 'SERVIÇOS PRELIMINARES'),
  ('propria', '2025-N223', 'Locação de equipamentos/ Ferramentas/ Caçamba de entulho.', 'MES', 'insumo', 1200, 'SERVIÇOS PRELIMINARES'),
  ('propria', '2025-N222', 'Aluguel de tenda para uso em canteiro.', 'MES', 'insumo', 1200, 'SERVIÇOS PRELIMINARES'),
  ('propria', '2025-N219', 'Material de limpeza', 'MES', 'insumo', 80, 'SERVIÇOS PRELIMINARES'),
  ('sinapi_04_2025_mt', '4813', 'Placa de obra (para construcao civil) em chapa galvanizada *n. 22*, adesivada, de *2,4 x 1,2* m (sem postes para fixacao)', 'M2', 'insumo', 400, 'SERVIÇOS PRELIMINARES'),
  ('sinapi_04_2025_mt', '99059', 'Locação convencional de obra, utilizando gabarito de tábuas corridas pontaletadas a cada 2,00m -  2 utilizações. af_03/2024', 'M', 'composicao', 60.96, 'SERVIÇOS PRELIMINARES'),
  ('modo', '215', 'Transporte de entulho em caçamba estacionaria, incluso a carga manual. - Para entulho gerado em obra considera um volume de ate 7% da área construída. Usando 5%', 'M3', 'composicao', 97.9568000166, 'SERVIÇOS PRELIMINARES'),
  ('modo', '323', 'Limpeza mecanizada de camada vegetal, vegetação e pequenas árvores (diâmetro de tronco menor que 0,20 m), com trator de esteiras.', 'M2', 'composicao', 8.0307600016, 'SERVIÇOS PRELIMINARES'),
  ('modo', '504', 'Aluguel/ estadia, alimentação e outras dispesas.', 'MES', 'composicao', 29142.34, 'SERVIÇOS PRELIMINARES'),
  ('sinapi_04_2025_mt', '100897', 'Estaca escavada mecanicamente, sem fluido estabilizante, com 40cm de diâmetro, concreto lançado por caminhão betoneira (exclusive mobilização e desmobilização). af_01/2020', 'M', 'composicao', 149.65, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '95577', 'Montagem de armadura de estacas, diâmetro = 10,0 mm. af_09/2021_ps', 'KG', 'composicao', 11.19, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '95584', 'Montagem de armadura transversal de estacas de seção circular, diâmetro = 6,30 mm. af_09/2021_ps', 'KG', 'composicao', 14.36, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '96523', 'Escavação manual para bloco de coroamento ou sapata (incluindo escavação para colocação de fôrmas). af_01/2024', 'M3', 'composicao', 91.67, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '1527', 'Concreto usinado bombeavel, classe de resistencia c25, brita 0 e 1, slump = 100 +/- 20 mm, com bombeamento (disponibilizacao de bomba), sem o lancamento (nbr 8953)', 'M3', 'insumo', 767.46, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '103673', 'Lançamento com uso de bomba, adensamento e acabamento de concreto em estruturas. af_02/2022', 'M3', 'composicao', 40.39, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '96540', 'Fabricação, montagem e desmontagem de fôrma para bloco de coroamento, em chapa de madeira compensada resinada, e=17 mm, 4 utilizações. af_01/2024', 'M2', 'composicao', 137.99, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '93382', 'Reaterro manual de valas, com compactador de solos de percussão. af_08/2023', 'M3', 'composicao', 24.57, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '96545', 'Armação de bloco utilizando aço ca-50 de 8 mm - montagem. af_01/2024', 'KG', 'composicao', 16.38, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '96546', 'Armação de bloco utilizando aço ca-50 de 10 mm - montagem. af_01/2024', 'KG', 'composicao', 14.38, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '96544', 'Armação de bloco utilizando aço ca-50 de 6,3 mm - montagem. af_01/2024', 'KG', 'composicao', 18.06, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '96616', 'Lastro de concreto magro, aplicado em blocos de coroamento ou sapatas. af_01/2024', 'M3', 'composicao', 903.28, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '92265', 'Fabricação de fôrma para vigas, em chapa de madeira compensada resinada, e = 17 mm. af_09/2020', 'M2', 'composicao', 141.21, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '96527', 'Escavação manual para viga baldrame ou sapata corrida (incluindo escavação para colocação de fôrmas). af_01/2024', 'M3', 'composicao', 100.91, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '38408', 'Concreto usinado bombeavel, classe de resistencia c25, com brita 0 e 1, slump = 190 +/- 20 mm, exclui servico de bombeamento (nbr 8953)', 'M3', 'insumo', 814.33, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '92915', 'Armação de estruturas diversas de concreto armado, exceto vigas, pilares, lajes e fundações, utilizando aço ca-60 de 5,0 mm - montagem. af_06/2022', 'KG', 'composicao', 16.92, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '104918', 'Armação de sapata isolada, viga baldrame e sapata corrida utilizando aço ca-50 de 8 mm - montagem. af_01/2024', 'KG', 'composicao', 14.7, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '104919', 'Armação de sapata isolada, viga baldrame e sapata corrida utilizando aço ca-50 de 10 mm - montagem. af_01/2024', 'KG', 'composicao', 13.15, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '104920', 'Armação de bloco, sapata isolada, viga baldrame e sapata corrida utilizando aço ca-50 de 12,5 mm - montagem. af_01/2024', 'KG', 'composicao', 11.15, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '104921', 'Armação de bloco, sapata isolada, viga baldrame e sapata corrida utilizando aço ca-50 de 16 mm - montagem. af_01/2024', 'KG', 'composicao', 10.55, 'FUNDAÇÃO'),
  ('sinapi_04_2025_mt', '98557', 'Impermeabilização de superfície com emulsão asfáltica, 2 demãos. af_09/2023', 'M2', 'composicao', 39.07, 'IMPERMEABILIZAÇÃO'),
  ('sem_base', '#8.3', 'INSTALACOES HIDROSSANITARIAS | AGUA FRIA, ESGOTO, PLUVIAL E DRENAGEM | - M²', null, 'composicao', 47, 'INSTALAÇÕES (PODE TER MODIFICAÇÕES DE VALOR)'),
  ('sem_base', 'D3C45E', 'Material e mão de obra', null, 'composicao', 303000, 'INSTALAÇÕES (PODE TER MODIFICAÇÕES DE VALOR)'),
  ('sinapi_04_2025_mt', '97086', 'Fabricação, montagem e desmontagem de forma para radier, piso de concreto ou laje sobre solo, em madeira serrada, 4 utilizações. af_09/2021', 'M2', 'composicao', 122.06, 'PISOS'),
  ('sinapi_04_2025_mt', '43124', 'Chapa em aco galvanizado para steel deck, com nervuras trapezoidais, largura util de 915 mm e espessura de 0,95 mm', 'M2', 'insumo', 130.52, 'PISOS'),
  ('sinapi_04_2025_mt', '91594', 'Armação do sistema de paredes de concreto, executada em paredes de edificações unifamiliares ou multifamiliares, tela q-92. af_12/2024_ps', 'KG', 'composicao', 13.24, 'PISOS'),
  ('sinapi_04_2025_mt', '10997', 'Eletrodo revestido aws - e7018, diametro igual a 4,00 mm', 'KG', 'insumo', 37.9, 'PISOS'),
  ('sem_base', 'EB8609', 'Pino Stud Welding 3/4" | X5.3/8" (19X135MM) - un', null, 'composicao', 14.94, 'PISOS'),
  ('sinapi_04_2025_mt', '94993', 'Execução de passeio (calçada) ou piso de concreto com concreto moldado in loco, usinado, acabamento convencional, espessura 6 cm, armado. af_08/2022 - Piso sarrafeado interno', 'M2', 'composicao', 98.03, 'PISOS'),
  ('sinapi_04_2025_mt', '101960', 'Laje pré-moldada unidirecional, biapoiada, enchimento em eps, vigota protendida, altura total da laje (enchimento+capa) = (12+4). af_11/2020', 'M2', 'composicao', 92.86, 'PISOS'),
  ('sinapi_04_2025_mt', '91598', 'Armação do sistema de paredes de concreto, executada como armadura positiva de lajes, tela q-113. af_12/2024', 'KG', 'composicao', 12.76, 'PISOS'),
  ('sinapi_04_2025_mt', '105539', 'Concretagem de edificações (paredes e lajes) feitas com sistema de fôrmas manuseáveis, com concreto usinado autoadensável reforçado com fibras de polipropileno, fck 25 mpa - lançamento e acabamento. af_09/2024', 'M3', 'composicao', 904.98, 'PISOS'),
  ('sem_base', '#14.3', 'PARAFUSOS, PORCAS E ARRUELAS - UN', null, 'composicao', 2, 'ESTRUTURA METÁLICA'),
  ('sem_base', '#14.4', 'chumbador 5/8', null, 'composicao', 43.97, 'ESTRUTURA METÁLICA'),
  ('modo', '263', 'Estrutura metalica "MODO"', 'KG', 'composicao', 17.2336026529, 'ESTRUTURA METÁLICA'),
  ('sinapi_04_2025_mt', '99855', 'Corrimão simples, diâmetro externo = 1 1/2", em aço galvanizado. af_04/2019_ps', 'M', 'composicao', 104.92, 'ESTRUTURA METÁLICA'),
  ('sinapi_04_2025_mt', '99837', 'Guarda-corpo de aço galvanizado de 1,10m, montantes tubulares de 1.1/4" espaçados de 1,20m, travessa superior de 1.1/2", gradil formado por tubos horizontais de 1" e verticais de 3/4", fixado com chumbador mecânico. af_04/2019_ps', 'M', 'composicao', 581.12, 'ESTRUTURA METÁLICA'),
  ('modo', '765', 'Painel isofachada de 70 mm, pré-pintado branco ou cinza padrão RAL 9003', 'M2', 'composicao', 361.309, 'VEDAÇÃO EXTERNA'),
  ('modo', '218', 'Fechamento com telha trapezoidal TP-40, montagem incluso pintura.', 'M2', 'composicao', 84.2674, 'VEDAÇÃO EXTERNA'),
  ('modo', '216', 'Telhamento - telha metálica isotelha e = 30 mm, com até 2 águas, incluso içamento.', 'M2', 'composicao', 129.93802, 'COBERTURA'),
  ('modo', '217', 'Instalação de cumeeira metálica trapezoidal diversa. Incluso material e instalação. - Cumeeira com 0,98 cm', 'UN', 'composicao', 88.16578, 'COBERTURA'),
  ('modo', '252', 'Rufo externo/interno de chapa de aço galvanizado, corte de 80 cm incluso içamento.', 'M', 'composicao', 119.1931701122, 'COBERTURA'),
  ('sinapi_04_2025_mt', '94229', 'Calha em chapa de aço galvanizado número 24, desenvolvimento de 100 cm, incluso transporte vertical. af_07/2019 - Kit Calha + suporte + fixadores e PU', 'M', 'composicao', 184.95, 'COBERTURA'),
  ('sinapi_04_2025_mt', '522', 'Pintura com tinta alquídica de acabamento (esmalte sintético), pulverizada sobre superfícies metálicas, executado em obra (02 demãos). Ref.: SINAPI - Metalica', 'M2', 'composicao', 22.5098745669, 'PINTURA ESTRUTURA METÁLICA'),
  ('sem_base', '#18.1', 'Limpeza final de obra - M²', null, 'composicao', 4.5, 'SERVIÇOS DIVERSOS'),
  ('propria', '2609', 'Custo transporte por carga - Transporte dos materiais, estrutura metálica e demais materiais a serem transportados para o canteiro de obras', 'UN', 'insumo', 10000, 'TRANSPORTE'),
  ('sinapi_04_2025_mt', '2706', 'Engenheiro civil de obra junior (horista)', 'HOURLY', 'insumo', 121.15, 'ADMINISTRATIVO DE OBRAS'),
  ('sinapi_04_2025_mt', '93572', 'Encarregado geral de obras com encargos complementares', 'MES', 'composicao', 5280.32, 'ADMINISTRATIVO DE OBRAS'),
  ('sinapi_04_2025_mt', '100321', 'Técnico em segurança do trabalho com encargos complementares', 'MES', 'composicao', 5261.02, 'ADMINISTRATIVO DE OBRAS')
on conflict (base_id, codigo) do update set custo_unitario = excluded.custo_unitario, atualizado_em = now();
-- modelo paramétrico derivado da obra real Moda Verão
insert into public.modelos_orcamento (nome, tipo_obra, descricao, area_referencia, prazo_referencia) values
  ('Galpão metálico — padrão MODO', 'galpao_metalico',
   'Índices extraídos da obra Moda Verão: 1.111,11 m² de projeção + 858,38 m² de laje, prazo 5 meses. Custo de referência: R$ 2.406/m² de projeção.',
   1111.11, 5.0)
on conflict do nothing;

insert into public.modelo_itens (modelo_id, ordem, etapa, subetapa, indice_item, codigo, base_id, descricao, unidade, tipo, driver, indice, custo_unitario, bdi_pct)
select m.id, v.* from public.modelos_orcamento m,
(values
  (0, 'PROJETOS', null, '1.1', '#1.1', 'sem_base', 'Projetos Complementares, topografia e sondagem  - M²', null, 'composicao', 'fixo', 1.0, 12000, 0.25),
  (10, 'SERVIÇOS PRELIMINARES', 'DIVERSO', '2.1.1', '10777', 'sinapi_04_2025_mt', 'Locacao de container 2,30 x 4,30 m, alt. 2,50 m, para sanitario, com 3 bacias, 4 chuveiros, 1 lavatorio e 1 mictorio (nao inclui mobilizacao/desmobilizacao) - Escritório', 'MES', 'insumo', 'prazo', 1.0, 962.26, 0.22),
  (20, 'SERVIÇOS PRELIMINARES', 'DIVERSO', '2.1.2', '10776', 'sinapi_04_2025_mt', 'Locacao de container 2,30 x 6,00 m, alt. 2,50 m, para escritorio, sem divisorias internas e sem sanitario (nao inclui mobilizacao/desmobilizacao)', 'MES', 'insumo', 'prazo', 1.0, 662.1, 0.22),
  (30, 'SERVIÇOS PRELIMINARES', 'DIVERSO', '2.1.3', '2025-N225', 'propria', 'Mobilização e desmobilização', 'UN', 'insumo', 'fixo', 2.0, 4500, 0.22),
  (40, 'SERVIÇOS PRELIMINARES', 'DIVERSO', '2.1.4', '2025-N224', 'propria', 'Aluguel de equipamentos, EPI/ EPC', 'MES', 'insumo', 'prazo', 1.0, 250, 0.22),
  (50, 'SERVIÇOS PRELIMINARES', 'DIVERSO', '2.1.5', '2025-N223', 'propria', 'Locação de equipamentos/ Ferramentas/ Caçamba de entulho.', 'MES', 'insumo', 'prazo', 1.0, 1200, 0.22),
  (60, 'SERVIÇOS PRELIMINARES', 'DIVERSO', '2.1.6', '2025-N222', 'propria', 'Aluguel de tenda para uso em canteiro.', 'MES', 'insumo', 'prazo', 1.0, 1200, 0.185),
  (70, 'SERVIÇOS PRELIMINARES', 'DIVERSO', '2.1.8', '2025-N219', 'propria', 'Material de limpeza', 'MES', 'insumo', 'prazo', 1.0, 80, 0.185),
  (80, 'SERVIÇOS PRELIMINARES', 'DIVERSO', '2.1.9', '4813', 'sinapi_04_2025_mt', 'Placa de obra (para construcao civil) em chapa galvanizada *n. 22*, adesivada, de *2,4 x 1,2* m (sem postes para fixacao)', 'M2', 'insumo', 'area_proj', 0.002592, 400, 0.165),
  (90, 'SERVIÇOS PRELIMINARES', 'DIVERSO', '2.1.10', '99059', 'sinapi_04_2025_mt', 'Locação convencional de obra, utilizando gabarito de tábuas corridas pontaletadas a cada 2,00m -  2 utilizações. af_03/2024', 'M', 'composicao', 'area_proj', 0.129622, 60.96, 0.22),
  (100, 'SERVIÇOS PRELIMINARES', 'DIVERSO', '2.1.11', '215', 'modo', 'Transporte de entulho em caçamba estacionaria, incluso a carga manual. - Para entulho gerado em obra considera um volume de ate 7% da área construída. Usando 5%', 'M3', 'composicao', 'area_proj', 0.056162, 97.9568000166, 0.22),
  (110, 'SERVIÇOS PRELIMINARES', 'DIVERSO', '2.1.12', '323', 'modo', 'Limpeza mecanizada de camada vegetal, vegetação e pequenas árvores (diâmetro de tronco menor que 0,20 m), com trator de esteiras.', 'M2', 'composicao', 'area_proj', 0.802315, 8.0307600016, 0.22),
  (120, 'SERVIÇOS PRELIMINARES', 'DIVERSO', '2.1.13', '504', 'modo', 'Aluguel/ estadia, alimentação e outras dispesas.', 'MES', 'composicao', 'prazo', 1.0, 29142.34, 0.15),
  (130, 'FUNDAÇÃO', 'ESTACAS', '3.2.1', '100897', 'sinapi_04_2025_mt', 'Estaca escavada mecanicamente, sem fluido estabilizante, com 40cm de diâmetro, concreto lançado por caminhão betoneira (exclusive mobilização e desmobilização). af_01/2020', 'M', 'composicao', 'area_proj', 0.1872, 149.65, 0.25),
  (140, 'FUNDAÇÃO', 'ESTACAS', '3.2.4', '95577', 'sinapi_04_2025_mt', 'Montagem de armadura de estacas, diâmetro = 10,0 mm. af_09/2021_ps', 'KG', 'composicao', 'area_proj', 0.666541, 11.19, 0.25),
  (150, 'FUNDAÇÃO', 'ESTACAS', '3.2.5', '95584', 'sinapi_04_2025_mt', 'Montagem de armadura transversal de estacas de seção circular, diâmetro = 6,30 mm. af_09/2021_ps', 'KG', 'composicao', 'area_proj', 0.38772, 14.36, 0.25),
  (160, 'FUNDAÇÃO', 'BLOCOS', '3.3.1', '96523', 'sinapi_04_2025_mt', 'Escavação manual para bloco de coroamento ou sapata (incluindo escavação para colocação de fôrmas). af_01/2024', 'M3', 'composicao', 'area_proj', 0.010919, 91.67, 0.25),
  (170, 'FUNDAÇÃO', 'BLOCOS', '3.3.2', '1527', 'sinapi_04_2025_mt', 'Concreto usinado bombeavel, classe de resistencia c25, brita 0 e 1, slump = 100 +/- 20 mm, com bombeamento (disponibilizacao de bomba), sem o lancamento (nbr 8953)', 'M3', 'insumo', 'area_proj', 0.009372, 767.46, 0.25),
  (180, 'FUNDAÇÃO', 'BLOCOS', '3.3.3', '103673', 'sinapi_04_2025_mt', 'Lançamento com uso de bomba, adensamento e acabamento de concreto em estruturas. af_02/2022', 'M3', 'composicao', 'area_proj', 0.009369, 40.39, 0.25),
  (190, 'FUNDAÇÃO', 'BLOCOS', '3.3.4', '96540', 'sinapi_04_2025_mt', 'Fabricação, montagem e desmontagem de fôrma para bloco de coroamento, em chapa de madeira compensada resinada, e=17 mm, 4 utilizações. af_01/2024', 'M2', 'composicao', 'area_proj', 0.065988, 137.99, 0.25),
  (200, 'FUNDAÇÃO', 'BLOCOS', '3.3.5', '93382', 'sinapi_04_2025_mt', 'Reaterro manual de valas, com compactador de solos de percussão. af_08/2023', 'M3', 'composicao', 'area_proj', 0.00162, 24.57, 0.25),
  (210, 'FUNDAÇÃO', 'BLOCOS', '3.3.6', '96545', 'sinapi_04_2025_mt', 'Armação de bloco utilizando aço ca-50 de 8 mm - montagem. af_01/2024', 'KG', 'composicao', 'area_proj', 0.05553, 16.38, 0.25),
  (220, 'FUNDAÇÃO', 'BLOCOS', '3.3.7', '96546', 'sinapi_04_2025_mt', 'Armação de bloco utilizando aço ca-50 de 10 mm - montagem. af_01/2024', 'KG', 'composicao', 'area_proj', 0.02358, 14.38, 0.25),
  (230, 'FUNDAÇÃO', 'BLOCOS', '3.3.8', '96544', 'sinapi_04_2025_mt', 'Armação de bloco utilizando aço ca-50 de 6,3 mm - montagem. af_01/2024', 'KG', 'composicao', 'area_proj', 0.12294, 18.06, 0.25),
  (240, 'FUNDAÇÃO', 'BLOCOS', '3.3.11', '96616', 'sinapi_04_2025_mt', 'Lastro de concreto magro, aplicado em blocos de coroamento ou sapatas. af_01/2024', 'M3', 'composicao', 'area_proj', 0.000505, 903.28, 0.25),
  (250, 'FUNDAÇÃO', 'VIGAS', '3.4.1', '92265', 'sinapi_04_2025_mt', 'Fabricação de fôrma para vigas, em chapa de madeira compensada resinada, e = 17 mm. af_09/2020', 'M2', 'composicao', 'area_proj', 0.145368, 141.21, 0.25),
  (260, 'FUNDAÇÃO', 'VIGAS', '3.4.2', '96527', 'sinapi_04_2025_mt', 'Escavação manual para viga baldrame ou sapata corrida (incluindo escavação para colocação de fôrmas). af_01/2024', 'M3', 'composicao', 'area_proj', 0.010008, 100.91, 0.25),
  (270, 'FUNDAÇÃO', 'VIGAS', '3.4.3', '38408', 'sinapi_04_2025_mt', 'Concreto usinado bombeavel, classe de resistencia c25, com brita 0 e 1, slump = 190 +/- 20 mm, exclui servico de bombeamento (nbr 8953)', 'M3', 'insumo', 'area_proj', 0.008703, 814.33, 0.25),
  (280, 'FUNDAÇÃO', 'VIGAS', '3.4.4', '103673', 'sinapi_04_2025_mt', 'Lançamento com uso de bomba, adensamento e acabamento de concreto em estruturas. af_02/2022', 'M3', 'composicao', 'area_proj', 0.008703, 40.39, 0.25),
  (290, 'FUNDAÇÃO', 'VIGAS', '3.4.5', '92915', 'sinapi_04_2025_mt', 'Armação de estruturas diversas de concreto armado, exceto vigas, pilares, lajes e fundações, utilizando aço ca-60 de 5,0 mm - montagem. af_06/2022', 'KG', 'composicao', 'area_proj', 0.16992, 16.92, 0.25),
  (300, 'FUNDAÇÃO', 'VIGAS', '3.4.6', '104918', 'sinapi_04_2025_mt', 'Armação de sapata isolada, viga baldrame e sapata corrida utilizando aço ca-50 de 8 mm - montagem. af_01/2024', 'KG', 'composicao', 'area_proj', 0.2574, 14.7, 0.25),
  (310, 'FUNDAÇÃO', 'VIGAS', '3.4.7', '104919', 'sinapi_04_2025_mt', 'Armação de sapata isolada, viga baldrame e sapata corrida utilizando aço ca-50 de 10 mm - montagem. af_01/2024', 'KG', 'composicao', 'area_proj', 0.09783, 13.15, 0.25),
  (320, 'FUNDAÇÃO', 'VIGAS', '3.4.8', '104920', 'sinapi_04_2025_mt', 'Armação de bloco, sapata isolada, viga baldrame e sapata corrida utilizando aço ca-50 de 12,5 mm - montagem. af_01/2024', 'KG', 'composicao', 'area_proj', 0.11187, 11.15, 0.25),
  (330, 'FUNDAÇÃO', 'VIGAS', '3.4.9', '104921', 'sinapi_04_2025_mt', 'Armação de bloco, sapata isolada, viga baldrame e sapata corrida utilizando aço ca-50 de 16 mm - montagem. af_01/2024', 'KG', 'composicao', 'area_proj', 0.07056, 10.55, 0.25),
  (340, 'FUNDAÇÃO', 'VIGAS', '3.4.10', '93382', 'sinapi_04_2025_mt', 'Reaterro manual de valas, com compactador de solos de percussão. af_08/2023', 'M3', 'composicao', 'area_proj', 0.001503, 24.57, 0.25),
  (350, 'IMPERMEABILIZAÇÃO', null, '4.1', '98557', 'sinapi_04_2025_mt', 'Impermeabilização de superfície com emulsão asfáltica, 2 demãos. af_09/2023', 'M2', 'composicao', 'area_proj', 0.077933, 39.07, 0.25),
  (360, 'INSTALAÇÕES (PODE TER MODIFICAÇÕES DE VALOR)', 'INSTALAÇÃO HIDRO.', '5.2.2.1', '#8.3', 'sem_base', 'INSTALACOES HIDROSSANITARIAS | AGUA FRIA, ESGOTO, PLUVIAL E DRENAGEM | - M²', null, 'composicao', 'area_proj', 0.802315, 47, 0.25),
  (370, 'INSTALAÇÕES (PODE TER MODIFICAÇÕES DE VALOR)', 'SISTEMA BASICO ESTIMADO DE AR-CONDICINADO (Infraestrutura - Sem Equipamento)', '5.5.1', 'D3C45E', 'sem_base', 'Material e mão de obra', null, 'composicao', 'fixo', 1.0, 303000, 0.25),
  (380, 'PISOS', 'PISO - STEEL DECK', '6.2.1', '1527', 'sinapi_04_2025_mt', 'Concreto usinado bombeavel, classe de resistencia c25, brita 0 e 1, slump = 100 +/- 20 mm, com bombeamento (disponibilizacao de bomba), sem o lancamento (nbr 8953) - Concreto polido', 'M3', 'insumo', 'area_proj', 0.053527, 767.46, 0.25),
  (390, 'PISOS', 'PISO - STEEL DECK', '6.2.2', '1527', 'sinapi_04_2025_mt', 'Concreto usinado bombeavel, classe de resistencia c25, brita 0 e 1, slump = 100 +/- 20 mm, com bombeamento (disponibilizacao de bomba), sem o lancamento (nbr 8953) - Sarrafeado', 'M3', 'insumo', 'area_proj', 0.057147, 767.46, 0.25),
  (400, 'PISOS', 'PISO - STEEL DECK', '6.2.3', '103673', 'sinapi_04_2025_mt', 'Lançamento com uso de bomba, adensamento e acabamento de concreto em estruturas. af_02/2022', 'M3', 'composicao', 'area_proj', 0.110655, 40.39, 0.25),
  (410, 'PISOS', 'PISO - STEEL DECK', '6.2.4', '97086', 'sinapi_04_2025_mt', 'Fabricação, montagem e desmontagem de forma para radier, piso de concreto ou laje sobre solo, em madeira serrada, 4 utilizações. af_09/2021', 'M2', 'composicao', 'area_proj', 0.059281, 122.06, 0.25),
  (420, 'PISOS', 'PISO - STEEL DECK', '6.2.5', '43124', 'sinapi_04_2025_mt', 'Chapa em aco galvanizado para steel deck, com nervuras trapezoidais, largura util de 915 mm e espessura de 0,95 mm', 'M2', 'insumo', 'area_proj', 1.109004, 130.52, 0.25),
  (430, 'PISOS', 'PISO - STEEL DECK', '6.2.6', '91594', 'sinapi_04_2025_mt', 'Armação do sistema de paredes de concreto, executada em paredes de edificações unifamiliares ou multifamiliares, tela q-92. af_12/2024_ps', 'KG', 'composicao', 'area_proj', 1.712687, 13.24, 0.25),
  (440, 'PISOS', 'PISO - STEEL DECK', '6.2.7', '10997', 'sinapi_04_2025_mt', 'Eletrodo revestido aws - e7018, diametro igual a 4,00 mm', 'KG', 'insumo', 'area_proj', 0.0252, 37.9, 0.25),
  (450, 'PISOS', 'PISO - STEEL DECK', '6.2.8', 'EB8609', 'sem_base', 'Pino Stud Welding 3/4" | X5.3/8" (19X135MM) - un', null, 'composicao', 'area_proj', 1.935002, 14.94, 0.25),
  (460, 'PISOS', 'PISO TERREO', '6.4.1', '94993', 'sinapi_04_2025_mt', 'Execução de passeio (calçada) ou piso de concreto com concreto moldado in loco, usinado, acabamento convencional, espessura 6 cm, armado. af_08/2022 - Piso sarrafeado interno', 'M2', 'composicao', 'area_laje', 1.0, 98.03, 0.25),
  (470, 'PISOS', 'PISO TERREO', '6.4.2', '94993', 'sinapi_04_2025_mt', 'Execução de passeio (calçada) ou piso de concreto com concreto moldado in loco, usinado, acabamento convencional, espessura 6 cm, armado. af_08/2022 - Piso sarrafeado calçada', 'M2', 'composicao', 'area_proj', 0.191412, 98.03, 0.25),
  (480, 'PISOS', 'LAJE RAMPA', '6.5.1', '101960', 'sinapi_04_2025_mt', 'Laje pré-moldada unidirecional, biapoiada, enchimento em eps, vigota protendida, altura total da laje (enchimento+capa) = (12+4). af_11/2020', 'M2', 'composicao', 'area_proj', 0.023634, 92.86, 0.25),
  (490, 'PISOS', 'LAJE RAMPA', '6.5.2', '91598', 'sinapi_04_2025_mt', 'Armação do sistema de paredes de concreto, executada como armadura positiva de lajes, tela q-113. af_12/2024', 'KG', 'composicao', 'area_proj', 0.048922, 12.76, 0.25),
  (500, 'PISOS', 'LAJE RAMPA', '6.5.3', '105539', 'sinapi_04_2025_mt', 'Concretagem de edificações (paredes e lajes) feitas com sistema de fôrmas manuseáveis, com concreto usinado autoadensável reforçado com fibras de polipropileno, fck 25 mpa - lançamento e acabamento. af_09/2024', 'M3', 'composicao', 'area_proj', 0.002836, 904.98, 0.25),
  (510, 'ESTRUTURA METÁLICA', null, '7.1', '#14.3', 'sem_base', 'PARAFUSOS, PORCAS E ARRUELAS - UN', null, 'composicao', 'area_proj', 5.038385, 2, 0.25),
  (520, 'ESTRUTURA METÁLICA', null, '7.2', '#14.4', 'sem_base', 'chumbador 5/8', null, 'composicao', 'area_proj', 0.1296, 43.97, 0.25),
  (530, 'ESTRUTURA METÁLICA', null, '7.3', '263', 'modo', 'Estrutura metalica "MODO"', 'KG', 'composicao', 'area_proj', 49.22906, 17.2336026529, 0.25),
  (540, 'ESTRUTURA METÁLICA', null, '7.4', '99855', 'sinapi_04_2025_mt', 'Corrimão simples, diâmetro externo = 1 1/2", em aço galvanizado. af_04/2019_ps', 'M', 'composicao', 'area_proj', 0.044982, 104.92, 0.25),
  (550, 'ESTRUTURA METÁLICA', null, '7.5', '99837', 'sinapi_04_2025_mt', 'Guarda-corpo de aço galvanizado de 1,10m, montantes tubulares de 1.1/4" espaçados de 1,20m, travessa superior de 1.1/2", gradil formado por tubos horizontais de 1" e verticais de 3/4", fixado com chumbador mecânico. af_04/2019_ps', 'M', 'composicao', 'area_proj', 0.056172, 581.12, 0.25),
  (560, 'VEDAÇÃO EXTERNA', null, '8.1', '765', 'modo', 'Painel isofachada de 70 mm, pré-pintado branco ou cinza padrão RAL 9003', 'M2', 'composicao', 'area_proj', 0.351983, 361.309, 0.25),
  (570, 'VEDAÇÃO EXTERNA', null, '8.2', '218', 'modo', 'Fechamento com telha trapezoidal TP-40, montagem incluso pintura.', 'M2', 'composicao', 'area_proj', 0.149292, 84.2674, 0.25),
  (580, 'COBERTURA', null, '9.1', '216', 'modo', 'Telhamento - telha metálica isotelha e = 30 mm, com até 2 águas, incluso içamento.', 'M2', 'composicao', 'area_proj', 1.000002, 129.93802, 0.25),
  (590, 'COBERTURA', null, '9.2', '217', 'modo', 'Instalação de cumeeira metálica trapezoidal diversa. Incluso material e instalação. - Cumeeira com 0,98 cm', 'UN', 'composicao', 'area_proj', 0.0594, 88.16578, 0.25),
  (600, 'COBERTURA', null, '9.3', '252', 'modo', 'Rufo externo/interno de chapa de aço galvanizado, corte de 80 cm incluso içamento.', 'M', 'composicao', 'area_proj', 0.168444, 119.1931701122, 0.25),
  (610, 'COBERTURA', null, '9.4', '94229', 'sinapi_04_2025_mt', 'Calha em chapa de aço galvanizado número 24, desenvolvimento de 100 cm, incluso transporte vertical. af_07/2019 - Kit Calha + suporte + fixadores e PU', 'M', 'composicao', 'area_proj', 0.110861, 184.95, 0.25),
  (620, 'PINTURA ESTRUTURA METÁLICA', null, '10.1', '522', 'sinapi_04_2025_mt', 'Pintura com tinta alquídica de acabamento (esmalte sintético), pulverizada sobre superfícies metálicas, executado em obra (02 demãos). Ref.: SINAPI - Metalica', 'M2', 'composicao', 'area_proj', 2.43029, 22.5098745669, 0.25),
  (630, 'SERVIÇOS DIVERSOS', null, '11.1', '#18.1', 'sem_base', 'Limpeza final de obra - M²', null, 'composicao', 'area_laje', 1.000175, 4.5, 0.25),
  (640, 'TRANSPORTE', null, '12.1', '2609', 'propria', 'Custo transporte por carga - Transporte dos materiais, estrutura metálica e demais materiais a serem transportados para o canteiro de obras', 'UN', 'insumo', 'area_proj', 0.0045, 10000, 0.25),
  (650, 'ADMINISTRATIVO DE OBRAS', null, '13.1', '2706', 'sinapi_04_2025_mt', 'Engenheiro civil de obra junior (horista)', 'HOURLY', 'insumo', 'prazo', 72.0, 121.15, 0.25),
  (660, 'ADMINISTRATIVO DE OBRAS', null, '13.2', '93572', 'sinapi_04_2025_mt', 'Encarregado geral de obras com encargos complementares', 'MES', 'composicao', 'prazo', 1.0, 5280.32, 0.25),
  (670, 'ADMINISTRATIVO DE OBRAS', null, '13.3', '100321', 'sinapi_04_2025_mt', 'Técnico em segurança do trabalho com encargos complementares', 'MES', 'composicao', 'prazo', 1.0, 5261.02, 0.25)
) as v(ordem, etapa, subetapa, indice_item, codigo, base_id, descricao, unidade, tipo, driver, indice, custo_unitario, bdi_pct)
where m.tipo_obra = 'galpao_metalico' and not exists (select 1 from public.modelo_itens where modelo_id = m.id);