-- ============================================================
-- MIGRAÇÃO ENVIO — a proposta sai do sistema para o cliente.
--
-- Nada é enviado sozinho: o sistema prepara (PDF, destinatário, corpo) e o
-- usuário lê e clica. E-mail a cliente não tem CTRL+Z.
--
-- Rodar no SQL Editor do Supabase ANTES do push.
-- ============================================================

-- ---------- 1) RASTRO DE ENVIO ----------
create table if not exists public.proposta_envios (
  id bigint generated always as identity primary key,
  proposta_id bigint not null references public.propostas(id) on delete cascade,
  para text not null,
  copia text,
  assunto text not null,
  corpo text not null,
  provedor_id text,                    -- id do Resend, para rastrear
  status text not null default 'enviado' check (status in ('enviado','falhou')),
  erro text,
  enviado_por uuid references public.profiles(id),
  enviado_em timestamptz not null default now()
);
create index if not exists idx_penv on public.proposta_envios(proposta_id, enviado_em desc);

-- envio é registro histórico: não se edita nem se apaga
create or replace function public.envio_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'Registros de envio são imutáveis — é a prova de que a proposta saiu.';
end $$;

drop trigger if exists trg_envio_upd on public.proposta_envios;
drop trigger if exists trg_envio_del on public.proposta_envios;
create trigger trg_envio_upd before update on public.proposta_envios
  for each row execute function public.envio_imutavel();
create trigger trg_envio_del before delete on public.proposta_envios
  for each row execute function public.envio_imutavel();

-- ---------- 2) A PROPOSTA GUARDA AS PREMISSAS QUE A GERARAM ----------
-- Sem isso, abrir uma proposta antiga não permite recalcular nem entender de
-- onde veio o número.
alter table public.propostas add column if not exists premissas jsonb;

-- ---------- 3) RLS ----------
alter table public.proposta_envios enable row level security;

drop policy if exists "penv: gestor" on public.proposta_envios;
create policy "penv: gestor" on public.proposta_envios
  for all to authenticated
  using (public.papel_atual() in ('admin','contratante'))
  with check (public.papel_atual() in ('admin','contratante'));
