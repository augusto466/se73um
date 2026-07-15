'use client';
import { usePathname } from 'next/navigation';
import { fmtData, diasAte } from '@/lib/contrato';

const TITULOS: Record<string, [string, string]> = {
  '/meu-dia':     ['Meu Dia', 'O que precisa de você hoje'],
  '/painel-ceo':  ['Painel Executivo', 'Carteira, margem e sinais de desvio'],
  '/obras':       ['Obras', 'Portfólio de contratos'],
  '/visao':       ['Visão da Obra', 'Avanço físico-financeiro'],
  '/cronograma':  ['Cronograma & Medições', 'Eventos, critérios de aceite e validação'],
  '/medicoes':    ['Faturamento', 'Boletim consolidado de medições'],
  '/financeiro':  ['Financeiro', 'Contas, agenda, fluxo de caixa e DRE'],
  '/materiais':   ['Materiais & Compras', 'Pedidos, cotações e autorização de compra'],
  '/diario':      ['Diário de Obras', 'Registros diários (RDO)'],
  '/qualidade':   ['Qualidade', 'Fichas de verificação de serviço'],
  '/tarefas':     ['Tarefas', 'Quadro da equipe'],
  '/rotinas':     ['Rotinas', 'O que se repete, com dono e prazo'],
  '/projetos':    ['Projetos', 'Biblioteca com controle de revisão'],
  '/documentos':  ['Documentos', 'Regularidade e validades'],
  '/metas':       ['Metas', 'Alvo × realizado'],
  '/equipe':      ['Equipe & Acessos', 'Usuários, papéis e vínculo por obra'],
};

export default function Topbar({ obra }: { obra: any }) {
  const path = usePathname();
  const chave = Object.keys(TITULOS).find(k => path.startsWith(k)) ?? '/meu-dia';
  const [titulo, sub] = TITULOS[chave];
  const dias = obra?.entrega_final ? diasAte(obra.entrega_final) : null;

  return (
    <header className="topbar">
      <div style={{ paddingLeft: 0 }}>
        <h1>{titulo}</h1>
        <div className="sub">{sub}</div>
      </div>
      {obra && (
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>{obra.codigo}</div>
            <div className="hint">{obra.nome}</div>
          </div>
          {dias !== null && (
            <div style={{ textAlign: 'right', borderLeft: '1px solid var(--line)', paddingLeft: 18 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: dias < 60 ? 'var(--brand)' : 'var(--ink)' }}>
                {dias} dias
              </div>
              <div className="hint">entrega {fmtData(obra.entrega_final)}</div>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
