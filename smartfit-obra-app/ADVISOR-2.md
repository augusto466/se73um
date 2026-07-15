# ADVISOR 2.0 — memória, briefing diário, busca no acervo e ações

## O que mudou

**1. Memória e conversas salvas**
- Toda conversa com o advisor fica salva (botão "histórico" no topo do chat). Retome de onde parou; apague o que não quiser guardar.
- A resposta agora chega em streaming — o texto aparece enquanto é escrito.

**2. Decisões registradas**
- Quando você disser ao advisor que decidiu algo, ele propõe registrar a decisão. Confirmada, ela entra no retrato que ele lê e vira premissa: ele não sugere de novo o que você já decidiu ou descartou.

**3. Briefing diário proativo**
- Todo dia às 6h (Brasília) um cron gera um briefing por usuário: o que mudou desde ontem, o que vence hoje, onde olhar primeiro.
- Cada usuário recebe o briefing recortado pelas obras a que tem acesso; a contratada não vê números financeiros.
- O briefing aparece no topo do **Meu Dia**. Envio por e-mail entra quando o Resend for ativado.

**4. Busca no acervo (GED)**
- No upload de projetos, documentos e anexos, o texto do arquivo (PDF, TXT, CSV) é extraído e indexado para busca full-text em português.
- O advisor ganhou a ferramenta `buscar_acervo`: pergunte "o que o memorial diz sobre o piso industrial" e ele busca nos arquivos antes de responder, citando a fonte.
- Arquivos antigos: em **Documentos**, o admin tem o botão "⟳ Indexar acervo" para processar tudo que já estava no sistema.
- Limitações honestas: PDFs escaneados (sem camada de texto) não são indexados; DOCX/XLSX ainda não têm extração.

**5. Mãos: ações com confirmação**
- O advisor pode propor: criar tarefa, criar rotina, registrar decisão. A proposta aparece como um cartão com "Confirmar / Descartar" — nada executa sem o seu clique.
- A execução usa a SUA sessão: o RLS vale, então ninguém faz pelo advisor o que não poderia fazer pela tela.
- Minutas de comunicação formal (Cl. 17.1) ele escreve direto na resposta, prontas para copiar.

**6. Anexos na conversa**
- Clipe 📎 no chat: anexe PDF, imagem, CSV ou TXT (até 2,5 MB, 3 por mensagem) e o advisor analisa dentro do contexto da operação.

## Novos objetos no banco
`advisor_conversas`, `advisor_mensagens`, `advisor_decisoes`, `advisor_briefings`, `arquivo_textos` + função `buscar_acervo()`. Tudo com RLS: cada usuário só enxerga o que é seu; textos do acervo seguem `pode_ver_obra`.

## Passo a passo do deploy (na ordem)

1. **Supabase → SQL Editor**: rodar `supabase/migracao-advisor.sql` inteiro.
2. **Pasta local**: substituir os arquivos pelo conteúdo deste zip (via `atualizar-painel.ps1`, como sempre).
3. **GitHub Desktop**: Commit → Push (conta `augusto466`). A Vercel republica sozinha (~2 min). O `unpdf` novo instala no build.
4. **Vercel → Settings → Cron Jobs**: conferir que apareceu o cron `/api/cron/briefing` diário (vem do `vercel.json`). O `CRON_SECRET` já existente serve para ele.
5. **No sistema, como admin**: Documentos → "⟳ Indexar acervo" para indexar os arquivos antigos.
6. **Teste**: abrir o Advisor (Ctrl+K) → perguntar algo sobre um documento do acervo → pedir "crie uma tarefa para X" e confirmar o cartão.

O primeiro briefing aparece no Meu Dia na manhã seguinte ao deploy (o primeiro vem sem comparativo; do segundo dia em diante ele compara com o retrato de ontem).

## Custos e limites
- Briefing diário: 1 chamada de API por usuário por dia (Claude Sonnet).
- Plano Hobby da Vercel comporta os 2 crons (digest semanal + briefing diário).
- Requisições do chat com anexo: limite de ~4 MB por mensagem (limite da Vercel) — por isso o teto de 2,5 MB por arquivo.
