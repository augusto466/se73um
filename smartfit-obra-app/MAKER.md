# MAKER — o advisor constrói, você confirma

## O que mudou

O advisor deixou de só aconselhar. Agora ele monta o trabalho dentro da plataforma: cria tarefas com responsável, prazo e centro de custo; cadastra pessoas; aprova pedidos de compra. Sempre com a sua sessão (o RLS vale) e sempre com a sua confirmação.

## Centro de custo — dimensão da EMPRESA

Não é dimensão de obra. As três perguntas ficam separadas:
- `categoria_id` → que tipo de gasto é (material, folha, seguro)
- `obra_id` → de qual obra (null = overhead da empresa)
- `centro_id` → **de qual área da empresa**

13 centros nascem prontos: Operações, Suprimentos, Qualidade e Segurança, Projetos, Comercial, Marketing, Financeiro, Contábil, Jurídico, RH, Administrativo, TI, Diretoria. Aplicados em tarefas, pedidos, rotinas e lançamentos. A view `custo_por_centro` separa overhead de custo alocado em obra — é o que permite medir margem real por obra e enxergar o peso de cada área.

## Colaboradores — pessoas sem login

Quem executa trabalho não precisa de acesso ao sistema. Menu Operação → **Equipe de Campo**. Nome, função, vínculo (próprio/terceirizado/fornecedor/autônomo), centro de custo, contato. O advisor resolve "Cleiton" para o cadastro sozinho; se houver dois, ele pergunta.

Isso é diferente de **Equipe & Acessos**, que continua sendo quem tem login.

## O que o advisor faz agora

| Ferramenta | Confirmação |
|---|---|
| `buscar_pessoa` | roda direto (só lê) |
| `buscar_acervo` | roda direto (só lê) |
| `simular_replanejamento` | roda direto (não grava) |
| `criar_tarefa` | cartão |
| `criar_rotina` | cartão |
| `cadastrar_colaborador` | cartão |
| `registrar_decisao` | cartão |
| `aplicar_replanejamento` | cartão |
| `aprovar_pedido` | **cartão com o pedido inteiro à vista** |

**Decomposição:** "pedir ao Cleiton para mobilizar a máquina, nivelar o terreno e aplicar brita" não vira uma tarefa genérica — vira a sequência, com responsável, prazo e centro de custo, para você confirmar uma a uma.

## Aprovação de pedido — por que o cartão é detalhado

Aprovar pedido gasta dinheiro: dispara contas a pagar, entra no orçado × comprado, vira margem. Por isso "aprova o PM-012" não aprova cego. O cartão mostra: título, evento vinculado, todas as cotações (fornecedor, valor, prazo, condição), qual está escolhida e o impacto no orçado da etapa. Você confirma vendo.

Travas: só pedido em "aguardando aprovação"; só com cotação vencedora já definida (senão ele pergunta qual você escolhe, não escolhe por você).

## O que o advisor NÃO faz

- **Aprovar medição.** Cl. 3.4.1 (aprovar não é aceitação definitiva) e Cl. 3.4.6 (7 dias úteis de análise) tornam isso um ato técnico com consequência contratual. Numa disputa, "a IA aprovou" não é defesa. Continua na tela, com os documentos à vista.
- **Enviar e-mail ou comunicação a terceiro.** Ele redige, você envia.
- **Alterar o baseline do cronograma.** O banco rejeita.

## Rastro

Tudo que o advisor executa fica marcado com `via_agente = true` em tarefas, rotinas, lançamentos e auditoria. Numa auditoria, dá para separar o que foi feito na tela do que veio por comando de chat.

## Deploy

1. Supabase → SQL Editor: rodar `supabase/migracao-maker.sql`
2. Atualizar a pasta local, commit e push
3. Cadastrar as pessoas em Operação → Equipe de Campo
4. Testar: "peça ao Cleiton para nivelar o terreno da fábrica até sexta"

## Limites conhecidos

- Centro de custo entra nos lançamentos, mas o **rateio automático de overhead** entre obras ainda não existe — hoje é dimensão de classificação, não de rateio.
- O advisor ainda não **edita** tarefa existente nem move de coluna; só cria.
- Não há pedido de orçamento a fornecedor (envio externo é fronteira deliberada).
