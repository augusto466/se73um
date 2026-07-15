-- ============================================================
-- CORREÇÃO — nomes dos centros de custo com acento correto.
-- A migração anterior foi gravada com encoding trocado no Windows.
-- Rodar no SQL Editor. Idempotente: pode rodar quantas vezes quiser.
-- ============================================================

update public.centros_custo set nome = 'Operações / Obras',      descricao = 'Execução, engenharia e canteiro. Custo direto das obras.' where id = 'cc_operacoes';
update public.centros_custo set nome = 'Suprimentos',             descricao = 'Compras, cotações e relacionamento com fornecedores.'   where id = 'cc_suprimentos';
update public.centros_custo set nome = 'Qualidade e Segurança',   descricao = 'FVS, conformidade técnica e SST.'                        where id = 'cc_qualidade';
update public.centros_custo set nome = 'Projetos e Engenharia',   descricao = 'Desenvolvimento e compatibilização de projetos.'         where id = 'cc_projetos';
update public.centros_custo set nome = 'Comercial',               descricao = 'Prospecção, propostas e novos contratos.'                where id = 'cc_comercial';
update public.centros_custo set nome = 'Marketing',               descricao = 'Marca, comunicação e presença de mercado.'               where id = 'cc_marketing';
update public.centros_custo set nome = 'Financeiro',              descricao = 'Contas a pagar/receber, caixa e fluxo.'                  where id = 'cc_financeiro';
update public.centros_custo set nome = 'Contábil e Fiscal',       descricao = 'Contabilidade, tributos e obrigações acessórias.'        where id = 'cc_contabil';
update public.centros_custo set nome = 'Jurídico',                descricao = 'Contratos, compliance e contencioso.'                    where id = 'cc_juridico';
update public.centros_custo set nome = 'RH e Pessoas',            descricao = 'Folha, admissões, treinamento e cultura.'                where id = 'cc_rh';
update public.centros_custo set nome = 'Administrativo',          descricao = 'Escritório, utilidades e serviços gerais.'               where id = 'cc_admin';
update public.centros_custo set nome = 'TI e Sistemas',           descricao = 'Infraestrutura, software e a própria plataforma.'        where id = 'cc_ti';
update public.centros_custo set nome = 'Diretoria',               descricao = 'Direção executiva e decisões estratégicas.'              where id = 'cc_diretoria';

select id, nome from public.centros_custo order by ordem;
