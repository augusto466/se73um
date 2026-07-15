export const LANC_STATUS: Record<string, [string, string]> = {
  previsto:   ['PREVISTO', 'st-pend'],
  confirmado: ['CONFIRMADO', 'st-exec'],
  pago:       ['PAGO', 'st-ok'],
  recebido:   ['RECEBIDO', 'st-ok'],
  cancelado:  ['CANCELADO', 'st-risk'],
};

export const TIPO_LABEL: Record<string, string> = {
  receita: 'Receita',
  custo_direto: 'Custo direto de obra',
  despesa_operacional: 'Despesa operacional',
  despesa_administrativa: 'Despesa administrativa',
  tributo: 'Tributos',
  financeiro: 'Financeiro',
};

export const ORIGEM_LABEL: Record<string, string> = {
  manual: 'manual', pedido: 'pedido de compra', medicao: 'medição', recorrente: 'recorrente',
};

/** Situação do vencimento em relação a hoje. */
export function situacao(l: { vencimento: string; status: string }) {
  if (['pago', 'recebido', 'cancelado'].includes(l.status)) return 'quitado';
  const hoje = new Date().toISOString().slice(0, 10);
  if (l.vencimento < hoje) return 'vencido';
  const em7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  if (l.vencimento <= em7) return 'vence_semana';
  return 'futuro';
}

export const parseNum = (s: string | number) =>
  typeof s === 'number' ? s : Number(String(s).replace(/\./g, '').replace(',', '.')) || 0;

/** Projeção de caixa por semana, a partir do saldo atual. */
export function projetarCaixa(lancs: any[], saldoInicial: number, semanas = 12) {
  const hoje = new Date();
  const inicio = new Date(hoje); inicio.setDate(hoje.getDate() - hoje.getDay()); // domingo
  const buckets: { rotulo: string; ini: string; fim: string; entra: number; sai: number; saldo: number }[] = [];
  let saldo = saldoInicial;

  for (let i = 0; i < semanas; i++) {
    const ini = new Date(inicio); ini.setDate(inicio.getDate() + i * 7);
    const fim = new Date(ini); fim.setDate(ini.getDate() + 6);
    const iniS = ini.toISOString().slice(0, 10);
    const fimS = fim.toISOString().slice(0, 10);
    const doPeriodo = lancs.filter(l => l.status !== 'cancelado' && l.vencimento >= iniS && l.vencimento <= fimS);
    const entra = doPeriodo.filter(l => l.natureza === 'receber').reduce((s, l) => s + Number(l.valor), 0);
    const sai = doPeriodo.filter(l => l.natureza === 'pagar').reduce((s, l) => s + Number(l.valor), 0);
    saldo += entra - sai;
    buckets.push({
      rotulo: `${ini.getDate().toString().padStart(2, '0')}/${(ini.getMonth() + 1).toString().padStart(2, '0')}`,
      ini: iniS, fim: fimS, entra, sai, saldo,
    });
  }
  return buckets;
}
