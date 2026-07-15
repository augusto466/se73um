/** Utilitários e rótulos. Os dados de cada contrato vivem na tabela `obras`. */

export const DOCS_PADRAO = [
  'Nota fiscal', 'Boletim de medição', 'Relatório fotográfico',
  'Regularidade trabalhista/FGTS', 'Quitação de fornecedores críticos',
  'ART/RRT aplicável', 'Certidões de regularidade',
];

export const STATUS_LABEL: Record<string, [string, string]> = {
  pendente:  ['PENDENTE', 'st-pend'],
  execucao:  ['EM EXECUÇÃO', 'st-exec'],
  validacao: ['EM VALIDAÇÃO', 'st-valid'],
  aprovado:  ['APROVADO', 'st-ok'],
  glosado:   ['COM GLOSA', 'st-risk'],
};

export const PEDIDO_STATUS: Record<string, [string, string]> = {
  rascunho: ['RASCUNHO', 'st-pend'],
  enviado:  ['AGUARDANDO APROVAÇÃO', 'st-valid'],
  aprovado: ['APROVADO — COMPRAR', 'st-exec'],
  recusado: ['RECUSADO', 'st-risk'],
  comprado: ['COMPRA EFETUADA', 'st-ok'],
};

export const OBRA_STATUS: Record<string, [string, string]> = {
  ativa:     ['ATIVA', 'st-exec'],
  concluida: ['CONCLUÍDA', 'st-ok'],
  suspensa:  ['SUSPENSA', 'st-valid'],
  arquivada: ['ARQUIVADA', 'st-pend'],
};

export const numeroPedido = (id: number) => 'PM-' + String(id).padStart(3, '0');

export const fmtBRL = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtPct = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
export const fmtData = (d?: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
export const diasAte = (d?: string | null) =>
  d ? Math.ceil((new Date(d + 'T12:00:00').getTime() - Date.now()) / 86400000) : 0;
