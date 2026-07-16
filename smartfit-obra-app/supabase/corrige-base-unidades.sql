-- ============================================================
-- CORREÇÃO DA BASE — descrições e unidades erradas.
--
-- Dois problemas vindos da importação do XLSX da Moda Verão:
--   1) o código 10777 tem descrição de SANITÁRIO mas foi rotulado "Escritório"
--   2) a base de GO usa "mês" minúsculo, a de MT usa "MES" — o casamento por
--      unidade precisa de padrão
-- ============================================================

-- ---------- 1) padroniza a unidade ----------
update public.composicoes set unidade = upper(trim(unidade)) where unidade is not null;
update public.composicoes set unidade = 'MES' where upper(trim(unidade)) in ('MÊS', 'MES', 'MESES');
update public.composicoes set unidade = 'M2'  where unidade in ('M²', 'M2 ');
update public.composicoes set unidade = 'M3'  where unidade in ('M³');
update public.composicoes set unidade = 'H'   where unidade in ('HORA', 'HR');
update public.composicoes set unidade = 'UN'  where unidade in ('UND', 'UNID');

-- ---------- 2) corrige a descrição do 10777 ----------
-- Ele é o container SANITÁRIO. O sufixo "- Escritório" veio errado do XLSX e
-- fazia o matcher casar o container de escritório com a composição do sanitário.
update public.composicoes
   set descricao = 'Locacao de container 2,30 x 4,30 m, alt. 2,50 m, para sanitario, com 3 bacias, 4 chuveiros, 1 lavatorio e 1 mictorio (nao inclui mobilizacao/desmobilizacao)'
 where codigo = '10777' and descricao ilike '%Escritório%';

-- ---------- 3) confere ----------
select base_id, codigo, left(descricao, 70) as descricao, unidade, custo_unitario
from public.composicoes
where descricao ilike '%seguranca%' or descricao ilike '%segurança%' or descricao ilike '%container%'
order by base_id, codigo;
