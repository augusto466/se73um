-- ============================================================
-- MIGRAÇÃO MEU DIA — prazo real da medição + segurança da view.
--
-- Duas correções na view public.meu_dia (a última versão vigente é a de
-- migracao-ged.sql):
--
-- 1) A branch de medição gravava vencimento = current_date FIXO. Por isso
--    uma medição parada há semanas em validação nunca era reconhecida como
--    vencida — sempre caía no bucket "hoje". Agora o vencimento é o prazo
--    real da Cl. 3.4.6 (7 dias corridos como proxy de "7 dias úteis" — a
--    mesma aproximação que src/lib/bi.ts já usa no Cockpit).
--
-- 2) security_invoker = true. Sem isso, como a view é criada pela role
--    postgres (BYPASSRLS) no SQL Editor, ela roda com o privilégio do dono
--    e pode ignorar a RLS das tabelas de baixo (pode_ver_obra() em tarefas,
--    pedidos_materiais, eventos — migracao-multiobra.sql). Isso é uma
--    correção de segurança, não só deste bloco — ligar é a direção certa.
--    SE algo sumir do Meu Dia de um usuário depois desta migração, NÃO
--    desligue security_invoker de volta — é sinal de que a RLS de baixo
--    está incompleta. Suspeito nº 1: pode_ver_obra(obra_id) nega acesso
--    quando obra_id é null (rotina/lançamento "da empresa"), porque
--    `obra_id = null` nunca é verdadeiro em SQL — corrija a policy para
--    tratar null explicitamente, não a view.
--
-- Rodar no SQL Editor do Supabase. Depois de rodar, testar logado como um
-- usuário 'contratada' vinculado a uma única obra e conferir que o Meu Dia
-- dele mostra o que deveria (nem mais, nem menos).
-- ============================================================

create or replace view public.meu_dia
with (security_invoker = true) as
select 'tarefa' as tipo, t.id::text as id, t.obra_id, t.descricao as titulo,
       t.prazo as vencimento, t.prioridade,
       case when t.coluna = 2 then 'em validação' else 'em execução' end as situacao,
       t.responsavel as responsavel_txt, null::uuid as responsavel_id,
       null::numeric as valor
from public.tarefas t where t.coluna < 3
union all
select 'rotina', o.id::text, o.obra_id, r.titulo, o.vencimento, r.prioridade,
       'rotina ' || r.frequencia, null::text, r.responsavel_id,
       null::numeric
from public.rotina_ocorrencias o
join public.rotinas r on r.id = o.rotina_id
where o.status = 'pendente'
union all
-- LIMITAÇÃO CONHECIDA: atualizado_em é tocado por QUALQUER edição do
-- evento, não só a entrada em 'validacao' — editar o evento por outro
-- motivo enquanto está em validação "rejuvenesce" este prazo. Correção de
-- verdade: uma coluna entrou_validacao_em gravada por trigger só na
-- transição de status (fica para depois, fora deste bloco).
select 'medicao', e.obra_id::text || ':' || e.id, e.obra_id,
       'Validar medição ' || e.id || ' — ' || e.etapa,
       (e.atualizado_em::date + 7) as vencimento,
       case when current_date > (e.atualizado_em::date + 7) then 'alta' else 'media' end as prioridade,
       case when current_date > (e.atualizado_em::date + 7)
            then 'prazo de análise da Cl. 3.4.6 excedido'
            else 'aguardando fiscalização · dentro do prazo de análise (Cl. 3.4.6)'
       end as situacao,
       null::text, null::uuid,
       e.valor_bruto * 0.9
from public.eventos e where e.status = 'validacao'
union all
select 'pedido', p.id::text, p.obra_id,
       'Aprovar pedido PM-' || lpad(p.id::text, 3, '0') || ' — ' || p.titulo,
       coalesce(p.necessidade, current_date), 'alta', 'aguardando aprovação', null::text, null::uuid,
       null::numeric
from public.pedidos_materiais p where p.status = 'enviado'
union all
select 'financeiro', l.id::text, l.obra_id,
       (case when l.natureza = 'pagar' then 'Pagar: ' else 'Receber: ' end) || l.descricao,
       l.vencimento, case when l.vencimento < current_date then 'alta' else 'media' end,
       l.natureza, null::text, null::uuid,
       l.valor
from public.lancamentos l
where l.status in ('previsto','confirmado') and l.vencimento <= current_date + 7
union all
-- documentos vencendo em 30 dias (Cl. 13.3: doc vencido autoriza reter medição)
select 'documento', d.id::text, d.obra_id,
       'Renovar: ' || d.titulo || coalesce(' (' || d.emissor || ')', ''),
       d.validade, case when d.validade < current_date + 7 then 'alta' else 'media' end,
       'documento ' || d.tipo, null::text, null::uuid,
       null::numeric
from public.documentos d
where d.validade is not null and d.validade <= current_date + 30;
