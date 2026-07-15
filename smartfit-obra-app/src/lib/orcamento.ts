/**
 * Motor de orçamento paramétrico.
 *
 * A ideia: um modelo guarda a "receita" de um tipo de obra — as etapas, os itens
 * e o ÍNDICE de cada um (quanto se consome por unidade do driver). Informadas as
 * premissas, o motor multiplica índice × driver e devolve o orçamento inteiro.
 *
 * Isso não substitui o orçamentista: tira você do zero. Você revisa e ajusta,
 * em vez de montar planilha do nada.
 *
 * A cadeia é a do seu XLSX, e ela importa:
 *   Qtde → Custo Unit. → Custo Total → BDI% → Preço Unit. → Preço Total
 * Custo e preço ficam separados o tempo todo. Margem se mede contra CUSTO.
 */

export type Premissas = {
  area_projecao?: number | null;
  area_laje?: number | null;
  area_fachada?: number | null;
  pe_direito?: number | null;
  prazo_meses?: number | null;
  padrao_acabamento?: 'simples' | 'medio' | 'alto' | null;
  distancia_km?: number | null;
};

export type ModeloItem = {
  ordem: number;
  etapa: string;
  subetapa: string | null;
  indice_item: string | null;
  codigo: string | null;
  base_id: string | null;
  descricao: string;
  unidade: string | null;
  tipo: string;
  driver: 'area_proj' | 'area_laje' | 'area_fachada' | 'prazo' | 'fixo' | 'manual';
  indice: number;
  custo_unitario: number;
  bdi_pct: number;
  observacao?: string | null;
};

export type ItemGerado = ModeloItem & {
  quantidade: number;
  custo_total: number;
  preco_unitario: number;
  preco_total: number;
  origem: 'motor';
  alerta?: string;
};

export type Orcamento = {
  itens: ItemGerado[];
  etapas: { etapa: string; custo: number; preco: number; pct: number }[];
  custo_total: number;
  preco_total: number;
  bdi_efetivo: number;
  custo_m2: number | null;
  preco_m2: number | null;
  avisos: string[];
};

/** Multiplicador por padrão de acabamento. Só afeta o que de fato varia com acabamento. */
const FATOR_PADRAO: Record<string, number> = { simples: 0.92, medio: 1.0, alto: 1.18 };
const ETAPAS_SENSIVEIS_PADRAO = ['PINTURA', 'VEDAÇÃO', 'COBERTURA', 'PISOS', 'INSTALAÇÕES'];

/** Resolve a quantidade de um item conforme o driver e as premissas. */
function quantidade(item: ModeloItem, p: Premissas): { qtd: number; alerta?: string } {
  const idx = Number(item.indice) || 0;
  switch (item.driver) {
    case 'area_proj':
      if (!p.area_projecao) return { qtd: 0, alerta: 'sem área de projeção' };
      return { qtd: idx * p.area_projecao };
    case 'area_laje':
      if (!p.area_laje) return { qtd: 0, alerta: 'sem área de laje' };
      return { qtd: idx * p.area_laje };
    case 'area_fachada':
      if (!p.area_fachada) {
        // fallback: estima o perímetro por um quadrado equivalente × pé-direito
        if (p.area_projecao && p.pe_direito) {
          const perimetro = 4 * Math.sqrt(p.area_projecao);
          return { qtd: idx * perimetro * p.pe_direito, alerta: 'fachada estimada pelo perímetro' };
        }
        return { qtd: 0, alerta: 'sem área de fachada' };
      }
      return { qtd: idx * p.area_fachada };
    case 'prazo':
      if (!p.prazo_meses) return { qtd: 0, alerta: 'sem prazo' };
      return { qtd: idx * p.prazo_meses };
    case 'fixo':
      return { qtd: idx };
    default:
      return { qtd: 0, alerta: 'item manual — informe a quantidade' };
  }
}

/** Gera o orçamento a partir do modelo e das premissas. */
export function gerar(itens: ModeloItem[], p: Premissas): Orcamento {
  const avisos: string[] = [];
  const fator = FATOR_PADRAO[p.padrao_acabamento ?? 'medio'] ?? 1;

  const gerados: ItemGerado[] = itens.map(it => {
    const { qtd, alerta } = quantidade(it, p);
    // o padrão de acabamento só mexe no que realmente varia com ele
    const sensivel = ETAPAS_SENSIVEIS_PADRAO.some(e => (it.etapa ?? '').toUpperCase().includes(e));
    const cu = Number(it.custo_unitario) * (sensivel ? fator : 1);
    const bdi = Number(it.bdi_pct) || 0;
    const q = Math.round(qtd * 10000) / 10000;
    return {
      ...it,
      quantidade: q,
      custo_unitario: Math.round(cu * 10000) / 10000,
      custo_total: Math.round(q * cu * 100) / 100,
      preco_unitario: Math.round(cu * (1 + bdi) * 10000) / 10000,
      preco_total: Math.round(q * cu * (1 + bdi) * 100) / 100,
      origem: 'motor' as const,
      alerta,
    };
  });

  const semQtd = gerados.filter(i => !i.quantidade);
  if (semQtd.length) {
    avisos.push(`${semQtd.length} item(ns) ficaram sem quantidade — falta premissa ou são de preenchimento manual. Revise antes de enviar.`);
  }

  const custo_total = gerados.reduce((s, i) => s + i.custo_total, 0);
  const preco_total = gerados.reduce((s, i) => s + i.preco_total, 0);

  // consolidação por etapa (é o que vai no resumo da proposta)
  const mapa = new Map<string, { custo: number; preco: number; ordem: number }>();
  gerados.forEach(i => {
    const r = mapa.get(i.etapa) ?? { custo: 0, preco: 0, ordem: i.ordem };
    r.custo += i.custo_total; r.preco += i.preco_total;
    mapa.set(i.etapa, r);
  });
  const etapas = Array.from(mapa.entries())
    .sort((a, b) => a[1].ordem - b[1].ordem)
    .map(([etapa, r]) => ({
      etapa, custo: Math.round(r.custo * 100) / 100, preco: Math.round(r.preco * 100) / 100,
      pct: preco_total > 0 ? Math.round(r.preco / preco_total * 1000) / 10 : 0,
    }));

  if (p.padrao_acabamento && p.padrao_acabamento !== 'medio') {
    avisos.push(`Padrão "${p.padrao_acabamento}": itens de acabamento ajustados em ${((fator - 1) * 100).toFixed(0)}%.`);
  }

  return {
    itens: gerados, etapas,
    custo_total: Math.round(custo_total * 100) / 100,
    preco_total: Math.round(preco_total * 100) / 100,
    bdi_efetivo: custo_total > 0 ? Math.round((preco_total / custo_total - 1) * 10000) / 100 : 0,
    custo_m2: p.area_projecao ? Math.round(custo_total / p.area_projecao) : null,
    preco_m2: p.area_projecao ? Math.round(preco_total / p.area_projecao) : null,
    avisos,
  };
}

/**
 * Extrai índices de uma obra real para virar (ou calibrar) um modelo.
 * É assim que o sistema aprende: cada obra entregue melhora a próxima proposta.
 */
export function derivarIndices(
  itens: { etapa: string; descricao: string; unidade: string | null; quantidade: number; custo_unitario: number; driver?: string }[],
  ref: { area_projecao: number; area_laje?: number; prazo_meses?: number }
) {
  return itens.map(i => {
    const dr = i.driver ?? 'area_proj';
    let base = ref.area_projecao;
    if (dr === 'area_laje') base = ref.area_laje ?? ref.area_projecao;
    else if (dr === 'prazo') base = ref.prazo_meses ?? 1;
    else if (dr === 'fixo') base = 1;
    return { ...i, driver: dr, indice: base > 0 ? Math.round((i.quantidade / base) * 1e6) / 1e6 : 0 };
  });
}

/** Compara o orçamento novo com o custo real de obras entregues — o antídoto contra repetir erro. */
export function compararComReal(
  gerado: Orcamento,
  real: { etapa: string; custo_orcado: number; valor_comprado: number }[]
) {
  const alertas: { etapa: string; orcado: number; realizado: number; desvio_pct: number; nota: string }[] = [];
  for (const e of gerado.etapas) {
    const r = real.find(x => x.etapa.toUpperCase().includes(e.etapa.toUpperCase().slice(0, 8)));
    if (!r || !r.valor_comprado || !r.custo_orcado) continue;
    const fatorReal = r.valor_comprado / r.custo_orcado;
    if (fatorReal > 1.05) {
      alertas.push({
        etapa: e.etapa, orcado: e.custo, realizado: e.custo * fatorReal,
        desvio_pct: Math.round((fatorReal - 1) * 1000) / 10,
        nota: `Em obra anterior, esta etapa custou ${Math.round((fatorReal - 1) * 100)}% acima do orçado. Considere revisar.`,
      });
    }
  }
  return alertas;
}
