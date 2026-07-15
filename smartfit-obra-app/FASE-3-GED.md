# Fase 3 — GED: Projetos com revisão · Documentos · Anexos

## Como publicar
1. **Supabase → SQL Editor → New query** → cole `supabase/migracao-ged.sql` → **Run**
   (cria o bucket de arquivos, as tabelas e o gatilho de revisão)
2. Copie os arquivos → GitHub Desktop → Commit `Fase 3: GED (projetos, documentos e anexos)` → **Push**

## 1. Projetos — nunca mais "executaram pela planta velha"
- Upload por **obra + disciplina + código + revisão** (R00, R01…), com RT e ART/RRT.
- Ao subir uma revisão nova do **mesmo projeto** (mesma disciplina e código), a anterior vira
  **OBSOLETA automaticamente** e sai da lista principal — quem abre vê só a **VIGENTE**.
- Obsoletas ficam arquivadas (marque "mostrar obsoletos") com selo vermelho, para rastreabilidade.
- Agrupado por disciplina, com filtro. Suporta PDF, DWG, imagens (até 50 MB por arquivo).

## 2. Documentos — regularidade sob controle
- Certidões, apólices, ART/RRT, licenças, contratos — com **emissor, número, emissão e validade**.
- Semáforo automático: **VIGENTE / VENCE EM XX DIAS / VENCIDO**.
- Documentos com validade entram no **Meu Dia** 30 dias antes de vencer.
- Alerta vermelho no topo se houver vencido — lembrando que a Cl. 13.3 autoriza a contratante a
  suspender medições e reter pagamentos por documento irregular.
- Já vêm 7 documentos esperados pré-cadastrados (seguro garantia, RC/riscos de engenharia,
  FGTS, CNDT, fiscal, ART estrutural, alvará) — é só anexar o arquivo e informar a validade.

## 3. Anexos integrados ao que já existe
| Onde | Para quê |
|---|---|
| **Pedido de materiais** | PDFs das cotações, pedido de compra, NF |
| **RDO (diário)** | Relatório fotográfico (Cl. 3.4) |
| **FVS (qualidade)** | Fotos, laudos e certificados como evidência |
| **Evento de medição** | Dossiê da medição |

## Segurança
- Contratante e contratada **veem e sobem** arquivos das obras a que têm acesso.
- Exclusão: só admin ou quem enviou.
- Arquivos ficam em bucket **privado** — o acesso é por link temporário (1 h), gerado na hora.
