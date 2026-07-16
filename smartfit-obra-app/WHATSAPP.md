# WHATSAPP — instância por QR

## ⚠ O risco, dito uma vez e por escrito

Conectar por QR usa **Baileys**, biblioteca **não-oficial**. Isso **viola os Termos de Serviço da Meta**. O número pode ser **banido sem aviso e sem recurso prático**.

Não existe como eliminar esse risco. Só reduzir. Se o número é o que a equipe usa para tudo, o dano de um ban vai muito além do sistema.

**O aceite fica registrado** com data, usuário e IP. Numa venda a terceiros, é o que prova que o cliente soube — e você não pode assumir esse risco por ele em silêncio.

## Por que dois serviços

O WhatsApp exige **processo vivo com sessão persistente**. A Vercel é serverless: cada requisição é um container que morre em segundos. **Não roda lá.**

```
Vercel (painel)  →  Supabase  ←  wa-service (Railway)  ←→  WhatsApp
```

O painel nunca fala com o WhatsApp: enfileira no banco. O serviço consome. Isso dá rastro e sobrevive a reinício.

## Deploy do serviço

A pasta `wa-service/` é um projeto separado. Ver o README dela. Resumo:

1. Subir como repositório próprio no GitHub
2. Railway → Deploy from GitHub
3. **Volume em `/data`** — sem ele, todo deploy pede QR de novo
4. Variáveis: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `WA_TOKEN`, `SESSOES_DIR=/data/sessoes`
5. Na Vercel: `WA_SERVICE_URL` (a URL do Railway) e `WA_TOKEN` (o mesmo)

## O que reduz o risco de ban

O serviço já faz:
- **Cadência lenta e irregular** — 3 a 8 s entre envios, com variação aleatória. Rajada uniforme é o padrão que os detectores procuram.
- **Não inicia conversa com desconhecido.** Se o número nunca falou com a instância, o envio é recusado. É o padrão clássico de spam.
- **Não marca online** ao conectar, para não roubar as notificações do celular.
- **Não sincroniza histórico completo** — lento e desnecessário.

O que **você** precisa fazer:
- Usar um número com **histórico humano**. Chip novo que só manda automação cai primeiro.
- Não disparar em massa.
- Não mandar o mesmo texto para muita gente.

## A regra que sustenta o desenho

**Mensagem de WhatsApp é informação, nunca ordem.**

Se alguém mandar "aprova o PM-012" por lá, o advisor **não aprova**. Ele registra que o pedido existe e propõe no cartão, dentro do sistema, para você confirmar.

O motivo é simples: qualquer um pode mandar mensagem. Se o advisor obedece o que chega, quem tem o número comanda o sistema. Isso está no system prompt e no retrato.

## O que já funciona

- Instância por empresa, com QR no painel e renovação automática
- Reconexão sozinha; religa as sessões após restart do serviço
- Contatos ligados a colaboradores
- Mensagens gravadas (entrada e saída) com autor e conversa
- Fila de saída com rastro de quem mandou
- O advisor lê as não processadas e propõe

## O que falta

- **Mídia**: imagem e áudio chegam registrados, mas o arquivo não é baixado para o Storage.
- **Grupos**: as mensagens chegam, mas não há tela de conversa — só a lista.
- **Ação a partir da mensagem**: hoje o advisor lê e comenta. Falta o botão "isto virou tarefa" que fecha o ciclo.
- **Vários números por empresa**: o schema aguenta, a tela mostra só o primeiro.
- **Custo por tenant**: cada cliente é uma sessão viva. Com muitos clientes, é um servidor por punhado de instâncias — isso precisa entrar na conta do plano.
