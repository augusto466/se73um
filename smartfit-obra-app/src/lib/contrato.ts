export const CONTRATO = {
  codigo: 'TK-328/2026',
  valorGlobal: 4_100_000,
  retencaoPct: 0.10,
  assinatura: '2026-05-27',
  entregaFinal: '2027-05-10',
  kickoff: 28_350,
};

export const MESES = [
  { id: 1,  ref: 'Jun/26', plan: 28350 },
  { id: 2,  ref: 'Jul/26', plan: 28350 },
  { id: 3,  ref: 'Ago/26', plan: 342000 },
  { id: 4,  ref: 'Set/26', plan: 558000 },
  { id: 5,  ref: 'Out/26', plan: 702000 },
  { id: 6,  ref: 'Nov/26', plan: 738000 },
  { id: 7,  ref: 'Dez/26', plan: 576000 },
  { id: 8,  ref: 'Jan/27', plan: 414000 },
  { id: 9,  ref: 'Fev/27', plan: 303300 },
  { id: 10, ref: 'Mar/27', plan: 205000 },
  { id: 13, ref: '+4m RD', plan: 68333.33 },
  { id: 17, ref: '+8m RD', plan: 68333.34 },
  { id: 21, ref: '+12m RD', plan: 68333.33 },
];

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

export const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtPct = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
export const fmtData = (d?: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

export const PEDIDO_STATUS: Record<string, [string, string]> = {
  rascunho: ['RASCUNHO', 'st-pend'],
  enviado:  ['AGUARDANDO APROVAÇÃO', 'st-valid'],
  aprovado: ['APROVADO — COMPRAR', 'st-exec'],
  recusado: ['RECUSADO', 'st-risk'],
  comprado: ['COMPRA EFETUADA', 'st-ok'],
};

export const numeroPedido = (id: number) => 'PM-' + String(id).padStart(3, '0');
