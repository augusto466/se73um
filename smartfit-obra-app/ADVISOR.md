# Advisor — o segundo cérebro

## O que é
Um conselheiro que **lê os seus dados antes de responder**. Não é um chat genérico: a cada pergunta,
o sistema monta um retrato atualizado da operação (carteira, medições, compras, orçado × comprado,
caixa, documentos, qualidade, rotinas, metas e os últimos RDOs) e entrega isso ao modelo junto com a pergunta.

Por isso ele responde com número real, não com conselho de manual.

## Como ativar (2 minutos)
1. Acesse **console.anthropic.com** → crie a conta (se não tiver) → **API Keys** → **Create Key** → copie.
2. Vercel → seu projeto → **Settings → Environment Variables** → adicione:
   - Nome: `ANTHROPIC_API_KEY`
   - Valor: a chave `sk-ant-...`
3. **Deployments** → ⋯ do último → **Redeploy**.

Sem a chave, o advisor abre e avisa que precisa ser configurado — nada quebra.

## Custo
Cobrança por uso, sem mensalidade. Cada pergunta consome o retrato (~2–5 mil tokens) + a resposta.
Na prática, uso diário de um CEO fica em poucos dólares por mês. Acompanhe em console.anthropic.com → Usage.

## Como usar
- Botão **Advisor** no canto inferior direito, ou **Ctrl + K** de qualquer tela.
- Perguntas que ele responde bem:
  - "Onde estou perdendo dinheiro agora?"
  - "O que eu deveria decidir hoje, na ordem?"
  - "Tem algo que eu não estou vendo?"
  - "Meu caixa aguenta os próximos 3 meses?"
  - "Vale aprovar a cotação mais barata do PM-001?"
  - "O que me expõe contratualmente hoje?"

## Segurança
- **Respeita o papel**: quem é `contratada` não recebe dados financeiros no retrato — margem e caixa
  não vazam para o outro lado da mesa.
- **Respeita o vínculo**: só entram no retrato as obras às quais o usuário tem acesso.
- A chave da API fica no servidor (variável de ambiente), nunca no navegador.

## O que ele NÃO faz
- Não inventa número: se não há base, ele diz que não há.
- Não altera dados — só lê e aconselha. Executar continua sendo decisão sua.
