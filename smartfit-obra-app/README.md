# Painel de Acompanhamento de Obras — Plataforma Multi-Contrato

Aplicação web completa com **login por usuário**, **banco compartilhado**, **múltiplas obras (centros de custo)**, **permissões por papel + vínculo por obra** e **e-mails automáticos** de avanço.

> **Já está no ar?** Para atualizar da versão de obra única para multi-obra, veja `ATUALIZACAO-MULTIOBRA.md`.

## O que a aplicação faz

| Recurso | Descrição |
|---|---|
| **Meu Dia** | Cockpit: tudo que está atrasado, vence hoje ou espera sua decisão, de todas as obras |
| **Painel Executivo** | Carteira, margem, caixa, desvio orçado × comprado, curva ABC e ranking de fornecedores |
| **Obras / centros de custo** | Cada contrato isolado, com portfólio consolidado e duplicação a partir de modelo |
| **Financeiro** | Contas a pagar/receber automáticas, agenda, fluxo de caixa projetado e DRE por obra |
| **Rotinas** | Tarefas recorrentes com geração automática de ocorrências e medição de aderência |
| **Qualidade (FVS)** | Fichas de verificação por disciplina, com normas técnicas; evidência para medição |
| **Metas** | Indicadores com alvo × realizado, cálculo automático a partir dos dados reais |
| **Projetos (GED)** | Biblioteca por disciplina com controle de revisão: nova revisão obsoleta a anterior |
| **Documentos** | Certidões, apólices e licenças com validade e alerta de vencimento |
| **Anexos** | Arquivos em pedidos, RDOs, FVS e medições
| Login e papéis | Contratante aprova/glosa medições e valida conformidade; Contratada executa e submete; Admin cria acessos |
| Cronograma E01–E25 | Status, dossiê de 7 documentos (Cl. 3.4), critério de aceite, glosa com valor |
| Faturamento | Boletim consolidado: bruto, glosa, retenção 10%, líquido, split 65/35 |
| Diário de Obras | RDOs **imutáveis** (sem edição/exclusão — integridade probatória) |
| Tarefas | Kanban compartilhado com prazos e alerta de atraso |
| **Materiais & Compras** | Contratada registra pedido com itens + cotações (padrão: 3 orçamentos); Contratante compara, aprova a cotação vencedora ou recusa com motivo, e registra a compra efetuada (autorização escrita — Cl. 3.4.2) |
| Validações | Checklist de conformidade contratual com cláusula e prazo |
| Auditoria | Toda transição de medição registra usuário, data e hora |
| **E-mail automático** | ① Medição submetida → notifica a fiscalização · ② Medição aprovada/glosada → notifica todos · ③ Pedido de materiais enviado → notifica a contratante · ④ Pedido aprovado/recusado/comprado → notifica todos · ⑤ **Boletim semanal** (segunda, 9h Brasília) com avanço, desvio, pedidos pendentes e demais pendências |

## Passo a passo de configuração (~30 min)

### 1. Supabase (banco + login) — gratuito
1. Crie uma conta em [supabase.com](https://supabase.com) e um novo projeto (região `sa-east-1` / São Paulo).
2. No menu **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique **Run**. Isso cria as tabelas, as regras de permissão (RLS) e já carrega os 25 eventos, o checklist e os RDOs iniciais.
3. Em **Authentication → Sign In / Up**, **desative** "Allow new users to sign up" (acessos só pelo Admin).
4. Em **Settings → API**, copie: `Project URL`, `anon public key` e `service_role key`.

### 2. Resend (envio de e-mail) — gratuito até 3.000 e-mails/mês
1. Crie conta em [resend.com](https://resend.com) e gere uma **API Key**.
2. **Recomendado:** em *Domains*, verifique seu domínio (ex.: `investmarket.com.br`) para enviar como `obra@seudominio.com.br`. Sem domínio verificado, o Resend só entrega para o seu próprio e-mail (modo teste).

### 3. Deploy na Vercel — gratuito
1. Suba esta pasta para um repositório no GitHub.
2. Em [vercel.com](https://vercel.com) → **Add New → Project** → importe o repositório.
3. Em **Environment Variables**, preencha todas as variáveis do arquivo `.env.example`.
4. Deploy. O cron do boletim semanal (`vercel.json`) é ativado automaticamente.

### 4. Primeiro acesso (Admin)
1. No Supabase, **Authentication → Users → Add user → Create new user**: seu e-mail + senha, marque *Auto Confirm*.
2. Ainda no Supabase, **Table Editor → profiles**: mude o campo `papel` desse usuário para `admin`.
3. Entre no app com esse usuário → aba **Equipe & Acessos** → crie os demais usuários escolhendo o papel. A senha temporária aparece uma única vez na tela para você repassar por canal seguro; o usuário recebe também um e-mail de boas-vindas.

### 5. Testar o boletim semanal manualmente
```bash
curl -H "Authorization: Bearer SEU_CRON_SECRET" https://seu-app.vercel.app/api/cron/digest
```

## Rodar localmente
```bash
cp .env.example .env.local   # preencha as variáveis
npm install
npm run dev                  # http://localhost:3000
```

## Segurança implementada
- **RLS no banco**: mesmo chamando a API diretamente, a Contratada não consegue aprovar medição nem marcar conformidade — a regra vive no Postgres, não só na tela.
- `service_role key` usada apenas em rotas de servidor (nunca chega ao navegador).
- Rota do cron protegida por `CRON_SECRET`.
- RDOs sem UPDATE/DELETE por política de banco.
- Cadastro público desativado; acessos criados apenas pelo Admin.

## Ajustes rápidos
- **Mês atual do cronograma**: constante `mesAtual` em `src/app/(painel)/visao/page.tsx` e `src/app/api/cron/digest/route.ts` (ou evolua para calcular pela data).
- **Horário/frequência do boletim**: `vercel.json` (cron em UTC; `0 12 * * 1` = segunda 9h de Brasília).
- **Textos dos e-mails**: `src/lib/email.ts`.
