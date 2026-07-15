/**
 * Cliente da API SINAPI (Orçamentador).
 *
 * A Caixa não tem API: publica ZIP com XLSX por estado, todo mês. O
 * Orçamentador reprocessa essas planilhas e expõe via REST. É dependência de
 * terceiro — por isso o importador CSV continua existindo como plano B.
 *
 * Regime: NAO_DESONERADO, o mesmo do orçamento da Moda Verão. Trocar de regime
 * muda o preço de tudo que tem mão de obra — não é detalhe.
 */

const BASE = 'https://orcamentador.com.br/api';

export const REGIME = process.env.SINAPI_REGIME || 'NAO_DESONERADO';
export const UF_PADRAO = process.env.SINAPI_UF || 'GO';

export class SemChave extends Error {
  constructor() { super('ORCAMENTADOR_API_KEY não configurada nas variáveis de ambiente da Vercel.'); }
}

async function chamar(endpoint: string, params: Record<string, any>) {
  const chave = process.env.ORCAMENTADOR_API_KEY;
  if (!chave) throw new SemChave();

  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, String(v)); });

  const r = await fetch(`${BASE}/${endpoint}/?${qs}`, {
    headers: { 'X-API-Key': chave },
    // a tabela muda uma vez por mês: cache de 1h evita queimar cota à toa
    next: { revalidate: 3600 },
  });

  if (r.status === 429) {
    const resta = r.headers.get('X-RateLimit-Remaining');
    throw new Error(`Limite de requisições do Orçamentador atingido${resta ? ` (restam ${resta})` : ''}. Tente daqui a pouco.`);
  }
  if (r.status === 401) throw new Error('A chave do Orçamentador foi recusada. Confira ORCAMENTADOR_API_KEY na Vercel.');
  if (!r.ok) throw new Error(`Orçamentador retornou ${r.status}: ${(await r.text()).slice(0, 160)}`);

  return r.json();
}

/** Preço de uma composição num estado. */
export async function composicao(codigo: string | number, uf = UF_PADRAO, dataRef?: string) {
  const j = await chamar('composicoes', { codigo, estado: uf, regime: REGIME, data_ref: dataRef, page: 1, limit: 1 });
  const d = Array.isArray(j?.dados) ? j.dados[0] : (Array.isArray(j) ? j[0] : j);
  if (!d) return null;
  return {
    codigo: String(d.codigo ?? codigo),
    nome: d.nome ?? d.descricao ?? '',
    unidade: d.unidade ?? null,
    preco: Number(d.preco ?? d.preco_naodesonerado ?? d.preco_desonerado ?? 0),
    data_referencia: d.data_referencia ?? null,
    origem_preco: d.origem_preco ?? 'principal',
  };
}

/** Preço de um insumo num estado. */
export async function insumo(codigo: string | number, uf = UF_PADRAO, dataRef?: string) {
  const j = await chamar('insumos', { codigo, estado: uf, regime: REGIME, data_ref: dataRef, page: 1, limit: 1 });
  const d = Array.isArray(j?.dados) ? j.dados[0] : (Array.isArray(j) ? j[0] : j);
  if (!d) return null;
  return {
    codigo: String(d.codigo ?? codigo),
    nome: d.nome ?? '',
    unidade: d.unidade ?? null,
    preco: Number(d.preco ?? d.preco_naodesonerado ?? d.preco_desonerado ?? 0),
    data_referencia: d.data_referencia ?? null,
    origem_preco: d.origem_preco ?? 'principal',
  };
}

/**
 * Mesmo código em vários estados. É o que responde na hora quanto o custo
 * muda ao trocar a base de MT para GO.
 */
export async function comparar(codigo: string | number, estados: string[], item: 'composicao' | 'insumo' = 'composicao', dataRef?: string) {
  const j = await chamar('comparar', { codigo, estados: estados.join(','), item, data_ref: dataRef });
  return {
    codigo: String(j?.codigo ?? codigo),
    descricao: j?.descricao ?? '',
    data_referencia: j?.data_referencia ?? null,
    precos: (j?.comparacao ?? []).map((c: any) => ({
      estado: String(c.estado ?? '').match(/\(([A-Z]{2})\)/)?.[1] ?? c.estado,
      nome: c.estado,
      preco: Number(REGIME === 'DESONERADO' ? c.preco_desonerado : c.preco_naodesonerado),
    })),
  };
}

/** Histórico de preço — para responder "quanto o aço subiu?". */
export async function historico(codigo: string | number, uf = UF_PADRAO, item: 'composicao' | 'insumo' = 'composicao', periodo = '12m') {
  const j = await chamar('historico', { codigo, estado: uf, item, periodo });
  return {
    codigo: String(j?.codigo ?? codigo),
    nome: j?.nome ?? '',
    serie: (j?.historico ?? []).map((h: any) => ({
      data: h.data,
      preco: Number(REGIME === 'DESONERADO' ? h.preco_desonerado : h.preco_naodesonerado),
    })),
  };
}

/** Abre a composição até o insumo final, ordenada por peso no custo. */
export async function explodir(codigo: string | number, uf = UF_PADRAO) {
  const j = await chamar('composicao_explode', {
    codigo, estado: uf, regime: REGIME.toLowerCase(), sort: 'valor_total', order: 'desc',
  });
  return {
    codigo: String(j?.codigo ?? codigo),
    descricao: j?.descricao ?? '',
    unidade: j?.unidade ?? null,
    valor_total: Number(j?.valor_total ?? 0),
    mao_de_obra: Number(j?.mao_de_obra ?? 0),
    data_referencia: j?.data_referencia ?? null,
    insumos: (j?.insumos ?? []).map((i: any) => ({
      codigo: String(i.codigo), nome: i.nome, unidade: i.unidade, tipo: i.tipo,
      preco_unitario: Number(i.preco_unitario), quantidade: Number(i.quantidade),
      valor_total: Number(i.valor_total),
    })),
  };
}

/** INCC, IPCA e afins — para reajuste contratual. */
export async function indicadores(quais = 'incc,incc_acumulado,ipca,igpm,selic') {
  const j = await chamar('indicadores', { indicadores: quais });
  return j?.data ?? j;
}

/** Qual é a referência SINAPI mais recente disponível. */
export async function ultimaAtualizacao() {
  return chamar('atualizacao', {});
}

/** Consumo da chave — para não estourar a cota sem perceber. */
export async function consumo() {
  return chamar('usage', {});
}

/** Registra o webhook que avisa quando a Caixa publica tabela nova. */
export async function registrarWebhook(callbackUrl: string) {
  return chamar('webhook', { mode: 'register', callback_url: callbackUrl });
}

export async function listarWebhooks() {
  return chamar('webhook', { mode: 'list' });
}
