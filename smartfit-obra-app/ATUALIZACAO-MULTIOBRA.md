# Atualização — Plataforma Multi-Obra (centros de custo)

## O que mudou

| Recurso | Descrição |
|---|---|
| **Obras = centros de custo** | Cada contrato tem seus próprios dados (código, cliente, valor global, retenção, prazos, cronograma) e seus próprios eventos, medições, pedidos, RDOs e tarefas |
| **Portfólio (aba Obras)** | Card por obra com valor, medido, % de avanço e pendências; botão "Abrir painel desta obra". KPIs consolidados da carteira no topo |
| **Seletor de obra** | No cabeçalho, troca a obra ativa a qualquer momento (ou "ver todas as obras") |
| **Duplicar modelo** | Admin cria nova obra a partir de uma existente, escolhendo **copiar valores** dos eventos ou **iniciar zerados**. Copia a estrutura dos 25 eventos e o checklist (em aberto); diário/tarefas/pedidos nascem vazios |
| **Papel global + vínculo por obra** | Papel (contratante/contratada/admin) é global. O **vínculo** define quais obras cada um vê. Admin vê todas. Cliente A nunca enxerga a obra do cliente B |
| **Campo empresa** | No cadastro do usuário, já preparado para múltiplas contratadas |
| **E-mails por obra** | Notificações e boletim semanal vão só aos vinculados àquela obra (+ admins), com o código da obra no assunto. O cron envia **um boletim por obra ativa** |

## Como publicar (3 passos)

### 1. Banco — rodar a migração
Supabase → **SQL Editor → New query** → cole todo o `supabase/migracao-multiobra.sql` → **Run**.

É seguro rodar com o sistema no ar: **nada se perde**. Os dados atuais (25 eventos, RDOs, PM-001, checklist) passam a pertencer à **Obra #1 — TK-328/2026**, e todos os usuários existentes são vinculados a ela automaticamente.

✅ Conferir: Table Editor → deve existir a tabela `obras` com 1 linha, e `obra_usuarios` com seus usuários.

### 2. Código — substituir e publicar
1. Extraia o zip novo por cima da pasta do projeto (substituindo os arquivos).
2. GitHub Desktop → os arquivos alterados aparecem em *Changes* → Summary: `Plataforma multi-obra` → **Commit to main** → **Push origin**.
3. A Vercel republica sozinha em ~2 min.

### 3. Testar
1. Entre no painel → você cai no **Portfólio** com o card da obra TK-328.
2. "Abrir painel desta obra" → tudo como antes, agora no escopo dela.
3. Aba **Obras** → **+ Criar obra / duplicar modelo** → escolha o modelo TK-328, marque "Iniciar zerados", informe código/nome/cliente/valor → Criar.
4. Aba **Equipe & Acessos** → marque quais obras cada usuário acessa.

## Notas
- O **mês atual** do cronograma agora é um campo da obra (`mes_atual`), editável direto no Table Editor do Supabase.
- O cronograma mensal de cada obra fica no campo `meses` (JSON). Ao duplicar sem copiar valores, ele nasce vazio — preencha conforme a proposta daquela obra.
- A view `portfolio` consolida os números de todas as obras (usada na tela de Obras).
