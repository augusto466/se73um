-- ============================================================
-- MIGRAÇÃO WHATSAPP — instância por empresa, via QR.
--
-- ⚠ RISCO DECLARADO: conectar por QR usa biblioteca não-oficial e VIOLA os
-- Termos de Serviço da Meta. O número pode ser banido sem aviso e sem recurso
-- prático. Numa venda para terceiros, o cliente precisa aceitar isso por
-- escrito — por isso o aceite fica registrado, com IP e data.
--
-- ARQUITETURA: o WhatsApp exige processo vivo com sessão persistente. A Vercel
-- é serverless e não serve. O serviço roda separado (Railway) e conversa com o
-- Supabase. Estas tabelas são o contrato entre os dois.
--
-- Rodar no SQL Editor do Supabase ANTES do push.
-- ============================================================

-- ---------- 1) INSTÂNCIA POR EMPRESA ----------
create table if not exists public.wa_instancias (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  nome text not null default 'Principal',
  -- estado da sessão, atualizado pelo serviço
  status text not null default 'desconectado'
    check (status in ('desconectado','aguardando_qr','conectando','conectado','banido','erro')),
  numero text,                          -- o número conectado, quando conecta
  qr_code text,                         -- data URL, válido por ~60s
  qr_expira_em timestamptz,
  ultimo_erro text,
  conectado_em timestamptz,
  visto_em timestamptz,                 -- heartbeat do serviço
  -- ACEITE DE RISCO: sem isso a instância não sobe
  risco_aceito boolean not null default false,
  risco_aceito_em timestamptz,
  risco_aceito_por uuid references public.profiles(id),
  risco_aceito_ip text,
  criado_em timestamptz not null default now(),
  unique (empresa_id, nome)
);
create index if not exists idx_wa_inst_emp on public.wa_instancias(empresa_id);

-- ---------- 2) CONTATOS ----------
-- Liga o número do WhatsApp ao colaborador. Sem isso, mensagem é texto solto.
create table if not exists public.wa_contatos (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  jid text not null,                    -- 5562999999999@s.whatsapp.net
  numero text not null,
  nome_wa text,                         -- como aparece no WhatsApp
  colaborador_id bigint references public.colaboradores(id) on delete set null,
  usuario_id uuid references public.profiles(id) on delete set null,
  eh_grupo boolean not null default false,
  bloqueado boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (empresa_id, jid)
);
create index if not exists idx_wa_cont on public.wa_contatos(empresa_id, jid);

-- ---------- 3) MENSAGENS ----------
create table if not exists public.wa_mensagens (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  instancia_id bigint not null references public.wa_instancias(id) on delete cascade,
  wa_id text,                           -- id da mensagem no WhatsApp
  jid text not null,                    -- conversa
  direcao text not null check (direcao in ('entrada','saida')),
  autor_jid text,                       -- quem mandou (em grupo, o membro)
  autor_nome text,
  tipo text not null default 'texto' check (tipo in ('texto','imagem','audio','documento','video','outro')),
  texto text,
  midia_path text,                      -- no Storage
  -- vínculo: a mensagem virou o quê no sistema
  vinculo_tipo text check (vinculo_tipo in ('tarefa','rotina','evento','pedido','diario','nenhum')),
  vinculo_id text,
  obra_id bigint references public.obras(id) on delete set null,
  -- o advisor leu e propôs algo?
  processada boolean not null default false,
  proposta jsonb,                       -- o que ele sugeriu, aguardando sua confirmação
  enviada_por uuid references public.profiles(id),   -- só para saída
  criado_em timestamptz not null default now(),
  unique (empresa_id, wa_id)
);
create index if not exists idx_wa_msg on public.wa_mensagens(empresa_id, jid, criado_em desc);
create index if not exists idx_wa_msg_proc on public.wa_mensagens(processada, criado_em) where direcao = 'entrada';

-- ---------- 4) FILA DE SAÍDA ----------
-- A Vercel não fala com o WhatsApp direto: enfileira aqui e o serviço envia.
-- Isso também dá rastro do que o sistema mandou em nome de quem.
create table if not exists public.wa_fila (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  instancia_id bigint not null references public.wa_instancias(id) on delete cascade,
  para_jid text not null,
  texto text not null,
  status text not null default 'pendente' check (status in ('pendente','enviado','falhou')),
  tentativas int not null default 0,
  erro text,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
create index if not exists idx_wa_fila on public.wa_fila(status, criado_em) where status = 'pendente';

-- ---------- 5) RLS ----------
alter table public.wa_instancias enable row level security;
alter table public.wa_contatos   enable row level security;
alter table public.wa_mensagens  enable row level security;
alter table public.wa_fila       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['wa_instancias','wa_contatos','wa_mensagens','wa_fila'] loop
    execute format('drop policy if exists "%s: empresa" on public.%I', t, t);
    execute format($p$create policy "%s: empresa" on public.%I for all to authenticated
      using (public.pode_ver_empresa(empresa_id) and public.papel_atual() in ('admin','contratante'))
      with check (public.pode_ver_empresa(empresa_id) and public.papel_atual() in ('admin','contratante'))$p$, t, t);
  end loop;
end $$;

-- o carimbo de empresa vale aqui também
do $$
declare t text;
begin
  foreach t in array array['wa_instancias','wa_contatos','wa_mensagens','wa_fila'] loop
    execute format('drop trigger if exists trg_empresa_%s on public.%I', t, t);
    execute format('create trigger trg_empresa_%s before insert on public.%I
      for each row execute function public.carimba_empresa()', t, t);
  end loop;
end $$;

-- ---------- 6) TRAVA: sem aceite, não conecta ----------
create or replace function public.wa_exige_aceite()
returns trigger language plpgsql as $$
begin
  if new.status in ('aguardando_qr','conectando','conectado') and not new.risco_aceito then
    raise exception 'A instância não pode conectar sem o aceite de risco. Conectar por QR viola os Termos da Meta e o número pode ser banido.';
  end if;
  return new;
end $$;

drop trigger if exists trg_wa_aceite on public.wa_instancias;
create trigger trg_wa_aceite before insert or update on public.wa_instancias
  for each row execute function public.wa_exige_aceite();
