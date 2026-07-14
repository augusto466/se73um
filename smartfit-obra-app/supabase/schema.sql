-- =====================================================================
-- PAINEL DE ACOMPANHAMENTO — CONTRATO TK-328/2026 (BTS SMART FIT)
-- Execute este arquivo inteiro no Supabase: SQL Editor > New query > Run
-- =====================================================================

-- ---------- PERFIS DE USUÁRIO ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  papel text not null default 'contratada' check (papel in ('admin','contratante','contratada')),
  notificar boolean not null default true,
  criado_em timestamptz not null default now()
);

-- cria o perfil automaticamente quando um usuário é criado
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nome, papel)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)),
          coalesce(new.raw_user_meta_data->>'papel', 'contratada'));
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.papel_atual() returns text
language sql stable security definer set search_path = public as
$$ select papel from public.profiles where id = auth.uid() $$;

-- ---------- EVENTOS DE MEDIÇÃO (E01–E25, Anexo III) ----------
create table if not exists public.eventos (
  id text primary key,
  mes int not null,
  etapa text not null,
  descricao text not null,
  criterio text,
  tipo text,
  aprova text,
  valor_bruto numeric not null,
  faturamento_direto numeric not null default 0,
  status text not null default 'pendente'
    check (status in ('pendente','execucao','validacao','aprovado','glosado')),
  valor_glosa numeric not null default 0,
  docs boolean[] not null default array[false,false,false,false,false,false,false],
  atualizado_por uuid references public.profiles(id),
  atualizado_em timestamptz not null default now()
);

-- ---------- TAREFAS (kanban) ----------
create table if not exists public.tarefas (
  id bigint generated always as identity primary key,
  descricao text not null,
  evento_id text references public.eventos(id),
  responsavel text,
  prioridade text not null default 'media' check (prioridade in ('alta','media','baixa')),
  prazo date,
  coluna int not null default 0 check (coluna between 0 and 3),
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);

-- ---------- DIÁRIO DE OBRAS (RDO — imutável) ----------
create table if not exists public.diario (
  id bigint generated always as identity primary key,
  data date not null,
  clima text,
  efetivo int default 0,
  responsavel text,
  atividades text not null,
  ocorrencias text,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);

-- ---------- CHECKLIST DE CONFORMIDADE CONTRATUAL ----------
create table if not exists public.checklist (
  id text primary key,
  titulo text not null,
  detalhe text,
  clausula text,
  prazo date,
  responsavel text,
  concluido boolean not null default false,
  atualizado_por uuid references public.profiles(id),
  atualizado_em timestamptz
);

-- ---------- TRILHA DE AUDITORIA ----------
create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  usuario uuid references public.profiles(id),
  acao text not null,
  entidade text not null,
  entidade_id text,
  detalhe jsonb,
  criado_em timestamptz not null default now()
);

-- =====================================================================
-- RLS — SEGURANÇA POR PAPEL
-- =====================================================================
alter table public.profiles  enable row level security;
alter table public.eventos   enable row level security;
alter table public.tarefas   enable row level security;
alter table public.diario    enable row level security;
alter table public.checklist enable row level security;
alter table public.auditoria enable row level security;

-- perfis: todos autenticados leem (para exibir nomes); cada um edita o próprio
create policy "perfis: leitura" on public.profiles for select to authenticated using (true);
create policy "perfis: editar próprio" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and papel = (select papel from public.profiles p where p.id = auth.uid()));

-- eventos: leitura para todos; contratada só transita entre pendente/execução/validação;
-- contratante/admin pode aprovar, glosar e reabrir
create policy "eventos: leitura" on public.eventos for select to authenticated using (true);
create policy "eventos: atualização" on public.eventos for update to authenticated
  using (true)
  with check (
    public.papel_atual() in ('contratante','admin')
    or status in ('pendente','execucao','validacao')
  );

-- tarefas: todos leem e criam; edita/exclui o criador ou contratante/admin
create policy "tarefas: leitura" on public.tarefas for select to authenticated using (true);
create policy "tarefas: criar" on public.tarefas for insert to authenticated with check (criado_por = auth.uid());
create policy "tarefas: editar" on public.tarefas for update to authenticated
  using (criado_por = auth.uid() or public.papel_atual() in ('contratante','admin'));
create policy "tarefas: excluir" on public.tarefas for delete to authenticated
  using (criado_por = auth.uid() or public.papel_atual() in ('contratante','admin'));

-- diário: leitura e inserção; SEM update/delete (integridade do RDO)
create policy "diario: leitura" on public.diario for select to authenticated using (true);
create policy "diario: registrar" on public.diario for insert to authenticated with check (criado_por = auth.uid());

-- checklist: leitura para todos; alteração apenas contratante/admin
create policy "checklist: leitura" on public.checklist for select to authenticated using (true);
create policy "checklist: validar" on public.checklist for update to authenticated
  using (public.papel_atual() in ('contratante','admin'));

-- auditoria: inserir e ler
create policy "auditoria: leitura" on public.auditoria for select to authenticated using (true);
create policy "auditoria: inserir" on public.auditoria for insert to authenticated with check (usuario = auth.uid());

-- =====================================================================
-- SEED — EVENTOS DO ANEXO III
-- =====================================================================
insert into public.eventos (id, mes, etapa, descricao, criterio, tipo, aprova, valor_bruto, faturamento_direto, status) values
('E01',1,'Projetos Executivos','Kickoff, compatibilização inicial e cronograma macro','Cronograma preliminar e matriz de responsabilidades aprovados','Entrega técnica','Contratante / Fiscalização',15750,0,'aprovado'),
('E02',1,'Projetos Executivos','Desenvolvimento inicial dos projetos executivos','Projetos em revisão inicial protocolados e compatibilização inicial entregue','Entrega técnica','Contratante / Fiscalização',15750,0,'aprovado'),
('E03',2,'Projetos Executivos','Planejamento executivo final e equalização técnica','Planejamento executivo final aprovado','Entrega técnica','Contratante / Fiscalização',15750,0,'validacao'),
('E04',2,'Projetos Executivos','Liberação técnica para produção e mobilização','Desenhos liberados para produção/mobilização','Entrega técnica','Contratante / Fiscalização',15750,0,'execucao'),
('E05',3,'Administração / Mobilização','Mobilização do canteiro e administração inicial','Canteiro funcional implantado','Evento físico','Fiscalização',120000,0,'pendente'),
('E06',3,'Serviços Preliminares','Serviços preliminares e instalações temporárias','Serviços preliminares executados conforme escopo','Evento físico/documental','Fiscalização',82000,30000,'pendente'),
('E07',3,'Movimentação de Terra','Terraplenagem e regularização inicial (50% do volume)','Terraplenagem executada conforme frente liberada','Percentual físico','Fiscalização',110000,50000,'pendente'),
('E08',3,'Fundação e Arrimo','Fundação inicial — estacas, blocos, armaduras, concretagens','Fundação inicial executada e registrada','Percentual físico','Fiscalização',68000,0,'pendente'),
('E07b',4,'Movimentação de Terra','Conclusão da terraplenagem e regularização (50% restante)','Volume real executado validado por topografia','Percentual físico','Fiscalização',110000,50000,'pendente'),
('E09',4,'Fundação e Arrimo','Conclusão das fundações, baldrames e arrimos','Fundações, baldrames e arrimos liberados para montagem','Percentual físico','Fiscalização',150000,50000,'pendente'),
('E10',4,'Estrutura Metálica','Compra estratégica de aço e insumos metálicos','Compra/reserva de aço comprovada documentalmente','Fornecimento direto','Contratante / Suprimentos',175000,175000,'pendente'),
('E11',4,'Estrutura Metálica','Fabricação industrial da estrutura metálica — fase 01','Fabricação fase 01 comprovada por relatório fabril','Fabricação','Fiscalização / Qualidade',185000,145000,'pendente'),
('E12',5,'Estrutura Metálica','Fabricação industrial da estrutura metálica — fase 02','Fabricação fase 02 comprovada por relatório fabril','Fabricação','Fiscalização / Qualidade',230000,200000,'pendente'),
('E13',5,'Estrutura Metálica','Montagem metálica principal — içamento e travamentos','Montagem principal com avanço físico validado','Percentual físico','Fiscalização',210000,100000,'pendente'),
('E14',5,'Cobertura','Fornecimento e início da cobertura metálica','Materiais entregues e início de instalação comprovado','Fornecimento + execução','Fiscalização',190000,185000,'pendente'),
('E15',5,'Instalações Gerais','Instalações elétricas e SPDA — fase 01 (225 kVA trifásico)','Infraestrutura elétrica/SPDA fase 01 executada','Percentual físico','Fiscalização',150000,130000,'pendente'),
('E16',6,'Steel Deck','Fornecimento e execução de steel deck','Steel deck executado conforme avanço físico','Fornecimento + execução','Fiscalização',285000,245000,'pendente'),
('E17',6,'Vedação Externa','Fornecimento e montagem de vedação externa (Isopainel PIR)','Vedação executada conforme área medida','Fornecimento + execução','Fiscalização',255000,220000,'pendente'),
('E18',6,'Instalações Gerais','Instalações hidrossanitárias, drenagem e incêndio','Instalações executadas por percentual validado','Percentual físico','Fiscalização',185000,130000,'pendente'),
('E19',6,'Estrutura / Transporte','Logística, transporte e conclusão de montagem','Logística e conclusão comprovadas por romaneio e fotos','Evento físico/documental','Fiscalização',95000,35000,'pendente'),
('E20',7,'Piso Industrial','Execução de piso industrial armado (fck 20 MPa)','Piso executado conforme área liberada','Percentual físico','Fiscalização',260000,180000,'pendente'),
('E21',7,'Pintura','Pintura industrial e demarcações','Pintura executada conforme área medida','Percentual físico','Fiscalização',205000,150000,'pendente'),
('E22',7,'Instalações / Acabamentos','Instalações finais e arremates executivos','Instalações finais conforme check-list','Percentual físico','Fiscalização',175000,70000,'pendente'),
('E23',8,'Acabamentos / Testes','Finalizações executivas e testes operacionais','Testes operacionais e finalizações validados','Evento físico','Fiscalização / Contratante',215000,160000,'pendente'),
('E24',8,'Pré-entrega','Pré-entrega e fechamento de pendências','Pré-entrega e fechamento de pendências validados','Evento físico','Contratante / Fiscalização',245000,180000,'pendente'),
('E25',9,'Entrega Final','Entrega técnica, as built, limpeza final e desmobilização','Termo de entrega técnica emitido','Entrega final','Contratante',337000,187000,'pendente')
on conflict (id) do nothing;

-- documentos dos eventos já medidos/em análise (seed)
update public.eventos set docs = array[true,true,true,true,false,true,true] where id in ('E01','E02');
update public.eventos set docs = array[true,true,true,false,false,true,false] where id = 'E03';

-- =====================================================================
-- SEED — CHECKLIST CONTRATUAL
-- =====================================================================
insert into public.checklist (id, titulo, detalhe, clausula, prazo, responsavel, concluido) values
('c1','Pagamento da etapa de kick-off (R$ 28.350) em 3 dias úteis da assinatura','Realizado em 29/05/2026 — condição para início tempestivo','Cl. 3.1.1','2026-06-01','Contratante',true),
('c2','Seguro garantia de 10% do valor global (seguradora SUSEP)','Apólice cobrindo inadimplemento, vícios, obrigações trabalhistas e custos de substituição','Cl. 13.1.1','2026-06-06','Contratada',true),
('c3','Seguro de responsabilidade civil e riscos de engenharia','Vigência durante toda a execução contratual','Cl. 13.1','2026-08-03','Contratada',false),
('c4','Cronograma físico-financeiro detalhado com marcos críticos','Aprovado e integrado como Anexo III','Cl. 4.3','2026-06-05','Contratada',true),
('c5','Indicação de preposto com poderes de decisão','Acompanhamento integral e participação em reuniões','Cl. 5.2','2026-06-10','Contratada',true),
('c6','Documentação prévia ao início dos serviços','Atos constitutivos, CNPJ, certidões, FGTS, ART/RRT, ASO, fichas de EPI','Cl. 13.2','2026-08-03','Contratada',false),
('c7','Sistema formal de acompanhamento da obra','Cronograma executivo, plano de suprimentos, relatório fotográfico, histograma','Cl. 4.3.1','2026-08-03','Contratada',false),
('c8','Protocolos junto a concessionárias e órgãos (energia, água, gás, AVCB)','Protocolo tempestivo é condição de excludente por atraso de terceiros','Cl. 2.3.1','2026-09-30','Contratada',false),
('c9','Autorização prévia e escrita para qualquer subcontratação','Subcontratação sem autorização é hipótese de rescisão','Cl. 12.1 / 9.1.i',null,'Ambas',false),
('c10','Comunicações formais por escrito com comprovação de envio','Silêncio não é aprovação tácita','Cl. 17.1 / 17.2',null,'Ambas',true),
('c11','Autorização prévia para faturamento direto de terceiros','NF de fornecedores só com autorização expressa e escrita','Cl. 3.4.2',null,'Contratante',true),
('c12','Confidencialidade — sem divulgação de imagens/portfólio','Inclui dados da Smart Fit e do empreendimento','Cl. 14.1 / 14.2',null,'Contratada',true)
on conflict (id) do nothing;

-- =====================================================================
-- SEED — DIÁRIO (RDOs iniciais)
-- =====================================================================
insert into public.diario (data, clima, efetivo, responsavel, atividades, ocorrencias) values
('2026-07-08','Bom / Bom',4,'Coordenação de projetos','Entrega do planejamento executivo final (E03) para validação. Emissão de ART do projeto estrutural. Levantamento topográfico complementar concluído sem divergências.','Sem ocorrências.'),
('2026-07-11','Bom / Bom',6,'Eng. residente — Modo Modular','Reunião de compatibilização elétrica × estrutura metálica (interferência P3–P5 resolvida). Cotação de aço com 3 fornecedores. Fôrmas de fundação em revisão B.','Concessionária informou 45 dias para análise do projeto de entrada — protocolar até 15/08 (Cl. 2.3.1).');

-- =====================================================================
-- MÓDULO: PEDIDOS DE MATERIAIS E COTAÇÕES (Cl. 3.4.2 — autorização
-- prévia e escrita da CONTRATANTE para faturamento direto)
-- =====================================================================
create table if not exists public.pedidos_materiais (
  id bigint generated always as identity primary key,
  evento_id text references public.eventos(id),
  titulo text not null,
  justificativa text,
  necessidade date,                -- data-limite de necessidade em obra
  itens jsonb not null default '[]',  -- [{descricao, unidade, qtd}]
  status text not null default 'enviado'
    check (status in ('rascunho','enviado','aprovado','recusado','comprado')),
  cotacao_vencedora bigint,
  motivo_decisao text,
  compra_info jsonb,               -- {pedido_compra, nf, data, observacao}
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now(),
  decidido_por uuid references public.profiles(id),
  decidido_em timestamptz
);

create table if not exists public.cotacoes (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references public.pedidos_materiais(id) on delete cascade,
  fornecedor text not null,
  cnpj text,
  valor_total numeric not null,
  prazo_entrega text,
  condicoes_pagamento text,
  frete text,
  observacoes text,
  criado_em timestamptz not null default now()
);

alter table public.pedidos_materiais enable row level security;
alter table public.cotacoes enable row level security;

-- pedidos: todos leem; qualquer autenticado cria; contratada só altera
-- enquanto o pedido está em rascunho/enviado; contratante/admin decide
create policy "pedidos: leitura" on public.pedidos_materiais for select to authenticated using (true);
create policy "pedidos: criar" on public.pedidos_materiais for insert to authenticated
  with check (criado_por = auth.uid());
create policy "pedidos: atualizar" on public.pedidos_materiais for update to authenticated
  using (true)
  with check (
    public.papel_atual() in ('contratante','admin')
    or status in ('rascunho','enviado')
  );
create policy "pedidos: excluir" on public.pedidos_materiais for delete to authenticated
  using (
    public.papel_atual() in ('contratante','admin')
    or (criado_por = auth.uid() and status in ('rascunho','enviado'))
  );

-- cotações: leitura para todos; edição enquanto o pedido não foi decidido
create policy "cotacoes: leitura" on public.cotacoes for select to authenticated using (true);
create policy "cotacoes: criar" on public.cotacoes for insert to authenticated
  with check (exists (
    select 1 from public.pedidos_materiais p
    where p.id = pedido_id
      and (p.status in ('rascunho','enviado') or public.papel_atual() in ('contratante','admin'))
  ));
create policy "cotacoes: excluir" on public.cotacoes for delete to authenticated
  using (exists (
    select 1 from public.pedidos_materiais p
    where p.id = pedido_id
      and (p.status in ('rascunho','enviado') or public.papel_atual() in ('contratante','admin'))
  ));

-- ---------- SEED: exemplo de pedido com 3 cotações (aço — evento E10) ----------
do $$
declare pid bigint;
begin
  if not exists (select 1 from public.pedidos_materiais) then
    insert into public.pedidos_materiais (evento_id, titulo, justificativa, necessidade, itens, status)
    values ('E10', 'Aço estrutural — perfis, chapas e chumbadores (lote 01)',
      'Compra estratégica prevista no evento E10 (fornecimento direto). Reserva antecipada garante o início da fabricação (E11) no Mês 04 e protege o prazo da montagem principal.',
      '2026-08-28',
      '[{"descricao":"Perfil W estrutural ASTM A572 Gr.50 (diversos)","unidade":"kg","qtd":48500},
        {"descricao":"Chapa em aço galvanizado p/ steel deck 0,80 mm","unidade":"m2","qtd":823},
        {"descricao":"Chumbador mecânico 3/4\"","unidade":"un","qtd":276},
        {"descricao":"Eletrodo revestido AWS E7018 Ø4,00 mm","unidade":"kg","qtd":1655}]'::jsonb,
      'enviado')
    returning id into pid;

    insert into public.cotacoes (pedido_id, fornecedor, cnpj, valor_total, prazo_entrega, condicoes_pagamento, frete, observacoes) values
    (pid, 'Aços Goiás Distribuidora LTDA', '12.345.678/0001-90', 168400.00, '20 dias corridos', '28 dias após NF', 'CIF (incluso)', 'Material certificado com laudo de usina.'),
    (pid, 'MetalCenter Comércio de Aços', '23.456.789/0001-01', 175000.00, '12 dias corridos', '30/60 dias', 'CIF (incluso)', 'Menor prazo de entrega; estoque local.'),
    (pid, 'Siderúrgica Planalto S.A.',    '34.567.890/0001-12', 161900.00, '35 dias corridos', 'à vista (5% desc. já aplicado)', 'FOB (frete por conta do comprador ~R$ 6.500)', 'Menor preço, porém prazo compromete início da fabricação.');
  end if;
end $$;
