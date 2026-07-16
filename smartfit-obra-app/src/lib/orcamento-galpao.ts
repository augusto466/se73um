/**
 * Orçamento de galpão por engenharia — não por índice médio.
 *
 * A diferença para o motor paramétrico: aqui os quantitativos saem de CÁLCULO.
 * A estrutura vem das tabelas do manual Gerdau (peso real dos perfis para o
 * vão, altura e vento informados). O fechamento sai da geometria, com desconto
 * de porta. A fundação sai das reações do pórtico.
 *
 * O preço continua vindo da sua base: SINAPI para o que é público, composições
 * MODO para o que é seu (estrutura metálica, isopainel, montagem).
 */

import { pesoEstrutura, fundacao } from './gerdau';
import { quantitativos, geometria, type Premissas, type ItemQuant } from './galpao';

export type { Premissas };

export type ItemOrcado = ItemQuant & {
  codigo?: string | null;
  base_id?: string | null;
  custo_unitario: number;
  bdi_pct: number;
  custo_total: number;
  preco_total: number;
  origem: 'gerdau' | 'geometria' | 'estimativa';
};

export type OrcamentoGalpao = {
  geometria: ReturnType<typeof geometria>;
  estrutura: any;
  fundacao: ReturnType<typeof fundacao> | null;
  itens: ItemOrcado[];
  etapas: { etapa: string; custo: number; preco: number; pct: number }[];
  custo_total: number;
  preco_total: number;
  bdi_efetivo: number;
  custo_m2: number;
  preco_m2: number;
  avisos: string[];
  sem_preco: string[];
};

/** Casa a descrição do item com uma composição da base, por palavras-chave. */
function acharPreco(
  desc: string,
  comps: { codigo: string; base_id: string; descricao: string; custo_unitario: number; unidade: string | null }[]
) {
  const norm = (s: string) => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  const alvo = norm(desc);
  const palavras = alvo.split(' ').filter(w => w.length > 3);

  let melhor: any = null, melhorScore = 0;
  for (const c of comps) {
    const cd = norm(c.descricao);
    let score = 0;
    for (const w of palavras) if (cd.includes(w)) score += w.length;
    // normaliza pelo tamanho, senão descrição longa sempre ganha
    const s = score / Math.max(alvo.length, 1);
    if (s > melhorScore) { melhorScore = s; melhor = c; }
  }
  return melhorScore > 0.30 ? melhor : null;
}

export function orcarGalpao(
  p: Premissas,
  comps: { codigo: string; base_id: string; descricao: string; custo_unitario: number; unidade: string | null }[],
  opcoes: { bdi_pct?: number; preco_aco_kg?: number; capacidade_estaca_tf?: number } = {}
): OrcamentoGalpao | { erro: string } {
  const bdi = opcoes.bdi_pct ?? 0.25;
  const g = geometria(p);

  // ---------- 1) ESTRUTURA (manual Gerdau) ----------
  const est: any = pesoEstrutura({
    vao: p.vao, altura: p.altura, comprimento: p.comprimento,
    espacamento: p.espacamento, v0: p.v0, inclinacao: p.inclinacao,
  });
  if (est.erro) return { erro: est.erro };

  const avisos: string[] = [...(est.avisos ?? [])];
  const semPreco: string[] = [];
  const itens: ItemOrcado[] = [];

  // O preço do aço montado é composição MODO — não existe no SINAPI.
  const compAco = comps.find(c => c.base_id === 'modo' && /estrutura metalica/i.test(c.descricao));
  const precoAco = opcoes.preco_aco_kg ?? compAco?.custo_unitario ?? 0;
  if (!precoAco) {
    avisos.push('Sem preço do aço montado (composição "Estrutura metálica MODO"). A estrutura saiu sem custo — cadastre a composição em Base de Preços.');
  }

  for (const i of est.itens) {
    const cu = precoAco;
    itens.push({
      etapa: 'ESTRUTURA METÁLICA',
      descricao: `${i.peca} — ${i.perfil}`,
      unidade: 'KG', quantidade: i.qtd, nota: i.nota,
      codigo: compAco?.codigo ?? null, base_id: compAco?.base_id ?? 'modo',
      custo_unitario: cu, bdi_pct: bdi,
      custo_total: Math.round(i.qtd * cu * 100) / 100,
      preco_total: Math.round(i.qtd * cu * (1 + bdi) * 100) / 100,
      origem: 'gerdau',
    });
  }

  // ---------- 2) FUNDAÇÃO (a partir das reações reais) ----------
  const fund = fundacao({
    rv1: est.reacoes.rv1, rh1: est.reacoes.rh1, mx1: est.reacoes.mx1,
    n_porticos: est.n_porticos,
    capacidade_estaca_tf: opcoes.capacidade_estaca_tf,
  });
  avisos.push(fund.alerta);

  const itensFund: ItemQuant[] = [
    { etapa: 'FUNDAÇÃO', descricao: 'Estaca escavada mecanicamente, sem fluido estabilizante, com 60 cm de diâmetro, concreto lançado por bomba lança',
      unidade: 'M', quantidade: fund.metros_estaca,
      nota: `${fund.n_bases} base(s) × ${fund.estacas_por_base} estaca(s) — carga de ${fund.carga_por_base_tf} tf por base` },
    { etapa: 'FUNDAÇÃO', descricao: 'Fabricação, montagem e desmontagem de fôrma para bloco de coroamento, em madeira serrada, e = 25 mm, 4 utilizações',
      unidade: 'M2', quantidade: Math.round(fund.volume_bloco_m3 * 3.5) },
    { etapa: 'FUNDAÇÃO', descricao: 'Concretagem de bloco de coroamento ou viga baldrame, fck 30 MPa, com uso de bomba',
      unidade: 'M3', quantidade: fund.volume_bloco_m3 },
    { etapa: 'FUNDAÇÃO', descricao: 'Armação de bloco utilizando aço ca-50 de 10 mm - montagem',
      unidade: 'KG', quantidade: fund.aco_bloco_kg },
  ];

  // ---------- 3) COMPOSIÇÃO (fechamento, cobertura, piso, portas) ----------
  const { itens: itensGeo, avisos: avisosGeo } = quantitativos(p);
  avisos.push(...avisosGeo);

  // ---------- 4) PREÇO: casa cada item com a base ----------
  for (const i of [...itensFund, ...itensGeo]) {
    const c = acharPreco(i.descricao, comps);
    if (!c) semPreco.push(`${i.etapa}: ${i.descricao.slice(0, 60)}`);
    const cu = c?.custo_unitario ?? 0;
    itens.push({
      ...i,
      codigo: c?.codigo ?? null, base_id: c?.base_id ?? null,
      custo_unitario: cu, bdi_pct: bdi,
      custo_total: Math.round(i.quantidade * cu * 100) / 100,
      preco_total: Math.round(i.quantidade * cu * (1 + bdi) * 100) / 100,
      origem: itensFund.includes(i) ? 'gerdau' : 'geometria',
    });
  }

  // ---------- 5) ADMINISTRAÇÃO E CANTEIRO (escalam com o prazo) ----------
  if (p.prazo_meses) {
    const admin: ItemQuant[] = [
      { etapa: 'ADMINISTRATIVO DE OBRAS', descricao: 'Engenheiro civil de obra junior (horista)', unidade: 'H', quantidade: Math.round(p.prazo_meses * 38.4) },
      { etapa: 'ADMINISTRATIVO DE OBRAS', descricao: 'Encarregado geral de obras (mensalista)', unidade: 'MES', quantidade: p.prazo_meses },
      { etapa: 'ADMINISTRATIVO DE OBRAS', descricao: 'Tecnico em seguranca do trabalho (horista)', unidade: 'H', quantidade: Math.round(p.prazo_meses * 76.8) },
      { etapa: 'SERVIÇOS PRELIMINARES', descricao: 'Locacao de container 2,30 x 6,00 m, alt. 2,50 m, com 1 sanitario, para escritorio, completo', unidade: 'MES', quantidade: p.prazo_meses },
      { etapa: 'SERVIÇOS PRELIMINARES', descricao: 'Locacao de container 2,30 x 6,00 m, alt. 2,50 m, para sanitario, com 4 bacias, 8 chuveiros', unidade: 'MES', quantidade: p.prazo_meses },
      { etapa: 'SERVIÇOS PRELIMINARES', descricao: 'Equipamento de protecao individual EPI e equipamento de protecao coletiva EPC', unidade: 'MES', quantidade: p.prazo_meses },
    ];
    for (const i of admin) {
      const c = acharPreco(i.descricao, comps);
      if (!c) semPreco.push(`${i.etapa}: ${i.descricao.slice(0, 60)}`);
      const cu = c?.custo_unitario ?? 0;
      itens.push({
        ...i, codigo: c?.codigo ?? null, base_id: c?.base_id ?? null,
        custo_unitario: cu, bdi_pct: bdi,
        custo_total: Math.round(i.quantidade * cu * 100) / 100,
        preco_total: Math.round(i.quantidade * cu * (1 + bdi) * 100) / 100,
        origem: 'estimativa',
      });
    }
  } else {
    avisos.push('Prazo não informado: administração de obra e canteiro ficaram fora. Num galpão isso costuma pesar 8 a 12% do custo.');
  }

  // ---------- 6) CONSOLIDAÇÃO ----------
  const custo = itens.reduce((s, i) => s + i.custo_total, 0);
  const preco = itens.reduce((s, i) => s + i.preco_total, 0);

  const mapa = new Map<string, { custo: number; preco: number }>();
  itens.forEach(i => {
    const r = mapa.get(i.etapa) ?? { custo: 0, preco: 0 };
    r.custo += i.custo_total; r.preco += i.preco_total;
    mapa.set(i.etapa, r);
  });
  const etapas = Array.from(mapa.entries())
    .map(([etapa, r]) => ({
      etapa, custo: Math.round(r.custo * 100) / 100, preco: Math.round(r.preco * 100) / 100,
      pct: preco > 0 ? Math.round(r.preco / preco * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.preco - a.preco);

  if (semPreco.length) {
    avisos.push(`${semPreco.length} item(ns) sem preço na base — entraram zerados. Sincronize o SINAPI de GO ou cadastre a composição.`);
  }

  return {
    geometria: g, estrutura: est, fundacao: fund,
    itens, etapas,
    custo_total: Math.round(custo * 100) / 100,
    preco_total: Math.round(preco * 100) / 100,
    bdi_efetivo: custo > 0 ? Math.round((preco / custo - 1) * 10000) / 100 : 0,
    custo_m2: g.areaProjecao > 0 ? Math.round(custo / g.areaProjecao) : 0,
    preco_m2: g.areaProjecao > 0 ? Math.round(preco / g.areaProjecao) : 0,
    avisos, sem_preco: semPreco,
  };
}
