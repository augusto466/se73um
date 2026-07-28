-- ============================================================
-- MIGRAÇÃO FUNÇÃO — dimensão de foco do usuário na Sidebar.
--
-- 'papel' continua sendo o filtro de permissão (o que o usuário PODE ver).
-- 'funcao' é só qual desses itens permitidos fica em foco por padrão
-- (campo | escritorio | gestao) — o resto vai para "Mais" na Sidebar.
-- funcao nula é tratada como 'gestao' no código.
--
-- Rodar no SQL Editor do Supabase ANTES do push.
-- ============================================================

alter table public.profiles add column if not exists funcao text check (funcao in ('campo','escritorio','gestao'));

update public.profiles set funcao = 'gestao' where papel in ('admin','contratante') and funcao is null;
update public.profiles set funcao = 'campo' where papel = 'contratada' and funcao is null;
