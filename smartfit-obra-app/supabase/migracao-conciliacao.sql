-- ============================================================
-- CONCILIAÇÃO BANCÁRIA — importação de extrato (OFX + CSV)
--
-- Importação de arquivo que o usuário baixa do banco — sem conexão
-- automática, sem Open Finance, sem credencial bancária passando pelo
-- sistema. Casamento automático por valor+data (janela configurável na
-- tela), nunca concilia sozinho sem candidato inequívoco. Escopo empresa
-- (o extrato mistura obras), não obra ativa.
--
-- PRÉ-REQUISITO DE SEGURANÇA (seção 1 deste arquivo): lancamentos e
-- recorrentes usam só eh_admin() nas policies de escrita/leitura-admin,
-- sem checar empresa_id — um admin de uma empresa lê e escreve lançamentos
-- de OUTRA empresa hoje. Mesmo bug que a migração multiempresa já
-- corrigiu para tarefas (comentário lá: "as tarefas da empresa estavam
-- invisíveis" — aqui é pior, ficaram visíveis/editáveis entre empresas).
-- Corrigindo antes de acrescentar mais tabelas financeiras no mesmo bolo.
-- caixa_config fica de fora (é tabela de uma linha só, sem empresa_id —
-- corrigir de verdade exige torná-la multi-linha, mudança estrutural
-- maior, fora do escopo desta entrega).
--
-- Idempotente: create table if not exists / drop policy + create policy /
-- create or replace function. Rodar de novo não altera dados.
-- ============================================================

-- ---------- 1) FECHA O VAZAMENTO ENTRE EMPRESAS ----------
drop policy if exists "lanc: leitura" on public.lancamentos;
drop policy if exists "lanc: gerir"   on public.lancamentos;
create policy "lanc: leitura" on public.lancamentos for select to authenticated
  using (
    (public.eh_admin() and public.pode_ver_empresa(empresa_id))
    or (public.papel_atual() = 'contratante' and obra_id is not null and public.pode_ver_obra(obra_id))
  );
create policy "lanc: gerir" on public.lancamentos for all to authenticated
  using (public.eh_admin() and public.pode_ver_empresa(empresa_id))
  with check (public.eh_admin() and public.pode_ver_empresa(empresa_id));

drop policy if exists "recor: leitura" on public.recorrentes;
drop policy if exists "recor: gerir"   on public.recorrentes;
create policy "recor: leitura" on public.recorrentes for select to authenticated
  using (public.eh_admin() and public.pode_ver_empresa(empresa_id));
create policy "recor: gerir" on public.recorrentes for all to authenticated
  using (public.eh_admin() and public.pode_ver_empresa(empresa_id))
  with check (public.eh_admin() and public.pode_ver_empresa(empresa_id));

-- ---------- 2) TABELAS extrato_importado / extrato_linha ----------
create table if not exists public.extrato_importado (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id),
  banco text,
  conta_ident text not null,        -- ex.: "Itaú — cc 12345-6" (texto livre, não valida conta real)
  arquivo_nome text not null,
  formato text not null check (formato in ('ofx','csv')),
  periodo daterange,                -- min/max data das linhas importadas
  importado_por uuid references public.profiles(id),
  importado_em timestamptz not null default now()
);

create table if not exists public.extrato_linha (
  id bigint generated always as identity primary key,
  extrato_id bigint not null references public.extrato_importado(id) on delete cascade,
  empresa_id bigint not null references public.empresas(id),
  conta_ident text not null,        -- copiado do extrato pai pelo trigger abaixo — necessário pro índice de dedup
  fitid text,                       -- id único do OFX, quando existe
  chave_sintetica text not null,    -- data|valor|descrição normalizada — sempre calculada, usada quando não há fitid
  data date not null,
  valor numeric not null check (valor > 0),
  descricao text not null,
  tipo text not null check (tipo in ('debito','credito')),
  status text not null default 'pendente' check (status in ('pendente','conciliado','ignorado')),
  lancamento_id bigint references public.lancamentos(id),
  criado_em timestamptz not null default now()
);

create index if not exists idx_extlinha_extrato on public.extrato_linha(extrato_id);
create index if not exists idx_extlinha_status  on public.extrato_linha(status);

-- Deduplicação: dois índices únicos parciais, não um unique normal.
-- FITID quando existe (duas linhas de bancos diferentes podem ter FITID
-- igual por coincidência — por isso conta_ident entra na chave); chave
-- sintética (data+valor+descrição) quando não há FITID (CSV). Reimportar
-- o mesmo arquivo, ou um período sobreposto, erra no insert em vez de
-- duplicar o caixa.
create unique index if not exists idx_extlinha_fitid_unico
  on public.extrato_linha (empresa_id, conta_ident, fitid)
  where fitid is not null;

create unique index if not exists idx_extlinha_sintetica_unico
  on public.extrato_linha (empresa_id, conta_ident, chave_sintetica)
  where fitid is null;

-- empresa_id de extrato_importado nasce do usuário (tabela raiz, mesmo
-- padrão de obras/colaboradores) — reusa a função geral, ignora o que o
-- cliente mandar.
drop trigger if exists trg_empresa_extrato_importado on public.extrato_importado;
create trigger trg_empresa_extrato_importado before insert on public.extrato_importado
  for each row execute function public.carimba_empresa();

-- extrato_linha herda empresa_id e conta_ident do extrato pai — não confia
-- no que o cliente mandar, sempre busca do pedido.
create or replace function public.carimba_extrato_linha() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select empresa_id, conta_ident into new.empresa_id, new.conta_ident
  from public.extrato_importado where id = new.extrato_id;
  return new;
end $$;

drop trigger if exists trg_extrato_linha_pai on public.extrato_linha;
create trigger trg_extrato_linha_pai before insert on public.extrato_linha
  for each row execute function public.carimba_extrato_linha();

-- ---------- 3) RLS — admin-only, igual "lanc: gerir" ----------
-- Mesma restrição que já existe em lancamentos hoje (só admin escreve) —
-- não estendo pra contratante aqui, isso exigiria mexer numa regra maior
-- do sistema (quem pode escrever lançamento), fora do escopo desta tela.
alter table public.extrato_importado enable row level security;
alter table public.extrato_linha enable row level security;

drop policy if exists "extrato: gestor" on public.extrato_importado;
create policy "extrato: gestor" on public.extrato_importado for all to authenticated
  using (public.eh_admin() and public.pode_ver_empresa(empresa_id))
  with check (public.eh_admin() and public.pode_ver_empresa(empresa_id));

drop policy if exists "extrato_linha: gestor" on public.extrato_linha;
create policy "extrato_linha: gestor" on public.extrato_linha for all to authenticated
  using (public.eh_admin() and public.pode_ver_empresa(empresa_id))
  with check (public.eh_admin() and public.pode_ver_empresa(empresa_id));
