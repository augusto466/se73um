# MULTIEMPRESA — o sistema vira SaaS

A Se73um é a **dona** do sistema. Cada cliente é um **tenant** que só enxerga os próprios dados. A Modo Modular é a `empresa_id = 1`.

## Por que a fundação veio antes da tela

Você pediu perfil e branding. Mas construir só isso daria **branding bonito com vazamento de dados**: nenhuma tabela tinha `empresa_id`, e o RLS era só por obra e papel. A Construtora A veria o funil da Construtora B.

Isso não é bug de interface — é o que mata um SaaS no primeiro cliente. Então a coluna e o RLS vieram primeiro.

## Como o isolamento funciona

**Tabelas-raiz** ganharam `empresa_id`: obras, oportunidades, colaboradores, centros de custo, bases de preço, composições, modelos, categorias, metas, tarefas, rotinas, lançamentos, documentos.

**Tabelas-filhas herdam pela FK** — eventos, orçamento, proposta_itens, modelo_itens. Duplicar a coluna criaria risco de divergência (uma proposta apontando para empresa A com itens da B).

**Três funções sustentam tudo:**
```sql
minha_empresa()        -- a empresa do usuário logado
eh_superadmin()        -- Se73um: atravessa o tenant
pode_ver_empresa(id)   -- ou é minha, ou eu sou a Se73um
```

**O banco carimba, o app não escolhe.** Um trigger `before insert` grava `empresa_id` a partir do usuário e **ignora o que vier do cliente**. Confiar no app para mandar o tenant é o mesmo que não ter tenant.

## Um bug que apareceu no caminho

`tarefas.obra_id` aceita nulo (tarefas de RH, Jurídico). Mas a política usava `pode_ver_obra(obra_id)`, que devolve **NULL** quando a obra é nula — e NULL no RLS **nega**. As tarefas da empresa estavam invisíveis.

Corrigido: tarefa com obra segue a regra da obra; tarefa sem obra pertence à empresa. O mesmo valia para rotinas, lançamentos e documentos.

## Perfil da empresa

**Menu → Minha Empresa** (só admin). Razão social, CNPJ, logo (upload), cor da marca, contato, endereço e o remetente de e-mail.

## Os documentos

A proposta sai com **a marca da empresa**: logo no cabeçalho, cor nos detalhes e no total, contato e endereço. O rodapé traz o nome e o CNPJ dela, e abaixo, discreto: **by Se73um Technology**.

Se a empresa não tiver logo, o nome entra no lugar.

## E-mail — cada um do seu domínio

A proposta sai do e-mail **do cliente**, não do nosso. Para isso o domínio precisa ser **verificado no Resend** (SPF + DKIM no DNS).

Sem verificação, o sistema **não deixa enviar** — e é bom que não deixe: mandar e-mail em nome de domínio alheio é o que os provedores classificam como spoofing, e queima a reputação de quem faz. Enquanto não verificar, a saída é baixar o PDF e enviar pelo cliente de e-mail.

O `reply-to` vai para o e-mail de contato da empresa.

## O superadmin

`profiles.superadmin = true` é a Se73um: enxerga todas as empresas. É o único papel que atravessa o tenant.

**Rode isto depois da migração**, com o seu e-mail:
```sql
update public.profiles set superadmin = true
where id = (select id from auth.users where email = 'seu@email.com');
```

Sem superadmin, ninguém administra o SaaS.

## Deploy

1. Supabase → SQL Editor: `supabase/migracao-multiempresa.sql`
2. Rodar o comando do superadmin acima
3. Atualizar, commit, push
4. Menu → Minha Empresa → preencher e subir o logo

## O que falta para vender

- **Cadastro de empresa nova** (hoje só por SQL). Precisa de tela de onboarding.
- **Verificação de domínio pela interface** — hoje é manual no painel do Resend, e o `dominio_verificado` é atualizado na mão.
- **Cobrança.** O campo `plano` existe, mas não há integração com pagamento.
- **Convite de usuário por empresa** — a tela de Equipe & Acessos ainda não filtra por tenant no cadastro.
- **Isolamento do Storage.** Os arquivos vão para o bucket `arquivos` sem prefixo por empresa: o RLS do banco protege os metadados, mas quem tiver a URL do arquivo acessa. Para vender, isso precisa ser resolvido.

Este último é o mais sério. Não é urgente com um tenant só, mas é bloqueante para o segundo.
