/**
 * Composição do galpão — o que envolve a estrutura.
 *
 * A estrutura vem do manual Gerdau (gerdau.ts). Aqui entra o resto: fechamento,
 * cobertura, piso, portas. É geometria pura, e é aqui que os descontos importam:
 * área de porta não leva fechamento, e alvenaria parcial só vai até a altura
 * escolhida — o isopainel completa o que sobra.
 */

export type TipoFechamento =
  | 'alvenaria_total'      // bloco de concreto do piso ao beiral
  | 'alvenaria_parcial'    // bloco até uma altura, isopainel acima
  | 'isopainel'            // isopainel PIR em toda a altura
  | 'tp40';                // telha trapezoidal pintada

export type TipoCobertura = 'tp40_branca' | 'tp40_galvanizada' | 'isotermica_pir';
export type TipoPiso = 'industrial_20' | 'industrial_25' | 'industrial_30' | 'polido' | 'nenhum';

export type Porta = {
  tipo: 'enrolar' | 'seccional' | 'pivotante' | 'social';
  largura: number;
  altura: number;
  quantidade: number;
};

export type Premissas = {
  vao: number;                 // L — largura do galpão
  comprimento: number;         // profundidade
  altura: number;              // H — pé-direito na coluna
  espacamento: number;         // B — entre pórticos
  v0: number;                  // velocidade básica do vento (NBR 6123)
  inclinacao?: number;         // padrão 10% (premissa do manual Gerdau)

  fechamento: TipoFechamento;
  altura_alvenaria?: number;   // só para alvenaria_parcial
  cobertura: TipoCobertura;
  piso: TipoPiso;
  espessura_piso?: number;     // cm
  area_laje?: number;          // mezanino em steel deck

  portas?: Porta[];
  area_terreno?: number;       // para limpeza e movimentação de terra
  prazo_meses?: number;
};

const arred = (v: number, c = 2) => Math.round(v * 10 ** c) / 10 ** c;

/** Geometria do galpão. É daqui que sai todo quantitativo de área. */
export function geometria(p: Premissas) {
  const inc = p.inclinacao ?? 0.10;
  const ang = Math.atan(inc);

  const areaProjecao = p.vao * p.comprimento;
  // a cobertura é inclinada: a área real é maior que a projeção
  const areaCobertura = areaProjecao / Math.cos(ang);
  const alturaCumeeira = p.altura + (p.vao / 2) * inc;

  // fachadas laterais (2 × comprimento × altura) + frontais (2 × vão × altura + os 2 triângulos do oitão)
  const areaLateral = 2 * p.comprimento * p.altura;
  const areaFrontalRet = 2 * p.vao * p.altura;
  const areaOitao = 2 * (p.vao * (alturaCumeeira - p.altura) / 2);
  const areaFachadaBruta = areaLateral + areaFrontalRet + areaOitao;

  const areaPortas = (p.portas ?? []).reduce((s, d) => s + d.largura * d.altura * d.quantidade, 0);
  const areaFachadaLiquida = Math.max(0, areaFachadaBruta - areaPortas);

  const perimetro = 2 * (p.vao + p.comprimento);

  return {
    areaProjecao: arred(areaProjecao),
    areaCobertura: arred(areaCobertura),
    alturaCumeeira: arred(alturaCumeeira),
    areaFachadaBruta: arred(areaFachadaBruta),
    areaPortas: arred(areaPortas),
    areaFachadaLiquida: arred(areaFachadaLiquida),
    perimetro: arred(perimetro),
    areaOitao: arred(areaOitao),
  };
}

export type ItemQuant = {
  etapa: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  nota?: string;
};

/**
 * Quantitativos de fechamento, cobertura, piso e esquadrias.
 * Devolve só a quantidade — o preço vem da base de composições.
 */
export function quantitativos(p: Premissas): { itens: ItemQuant[]; avisos: string[] } {
  const g = geometria(p);
  const itens: ItemQuant[] = [];
  const avisos: string[] = [];

  // ---------- FECHAMENTO ----------
  // O desconto de porta é o ponto: quem esquece isso orça parede onde tem portão.
  if (p.fechamento === 'alvenaria_total') {
    itens.push({
      etapa: 'VEDAÇÃO EXTERNA',
      descricao: 'Alvenaria de blocos de concreto estrutural 14x19x39 cm, fbk 14 MPa',
      unidade: 'M2', quantidade: arred(g.areaFachadaLiquida),
      nota: `${g.areaFachadaBruta} m² de fachada − ${g.areaPortas} m² de portas`,
    });
    itens.push({
      etapa: 'VEDAÇÃO EXTERNA',
      descricao: 'Cinta com bloco canaleta, espessura 15 cm',
      unidade: 'M', quantidade: arred(g.perimetro * 2),
      nota: 'cinta de respaldo e intermediária',
    });

  } else if (p.fechamento === 'alvenaria_parcial') {
    const hAlv = p.altura_alvenaria ?? 3;
    if (hAlv >= p.altura) avisos.push(`A altura da alvenaria (${hAlv} m) é maior ou igual ao pé-direito (${p.altura} m) — use "alvenaria total".`);

    // proporção: a alvenaria pega a faixa de baixo; o isopainel, o resto (inclusive os oitões)
    const fracAlv = Math.min(1, hAlv / p.altura);
    const alvBruta = (2 * p.comprimento * hAlv) + (2 * p.vao * hAlv);
    // as portas ficam na faixa baixa: descontam da alvenaria
    const alvLiquida = Math.max(0, alvBruta - g.areaPortas);
    const painel = g.areaFachadaBruta - alvBruta;

    itens.push({
      etapa: 'VEDAÇÃO EXTERNA',
      descricao: `Alvenaria de blocos de concreto estrutural 14x19x39 cm, fbk 14 MPa — até ${hAlv} m`,
      unidade: 'M2', quantidade: arred(alvLiquida),
      nota: `${arred(alvBruta)} m² até ${hAlv} m − ${g.areaPortas} m² de portas`,
    });
    itens.push({
      etapa: 'VEDAÇÃO EXTERNA',
      descricao: 'Cinta com bloco canaleta, espessura 15 cm',
      unidade: 'M', quantidade: arred(g.perimetro * (hAlv >= 3 ? 2 : 1)),
    });
    itens.push({
      etapa: 'VEDAÇÃO EXTERNA',
      descricao: 'Isopainel PIR AP 50 mm microf/liso RAL 9003',
      unidade: 'M2', quantidade: arred(painel),
      nota: `de ${hAlv} m ao beiral, mais os oitões (${g.areaOitao} m²)`,
    });
    void fracAlv;

  } else if (p.fechamento === 'isopainel') {
    itens.push({
      etapa: 'VEDAÇÃO EXTERNA',
      descricao: 'Isopainel PIR AP 50 mm microf/liso RAL 9003',
      unidade: 'M2', quantidade: arred(g.areaFachadaLiquida),
      nota: `${g.areaFachadaBruta} m² − ${g.areaPortas} m² de portas`,
    });

  } else if (p.fechamento === 'tp40') {
    itens.push({
      etapa: 'VEDAÇÃO EXTERNA',
      descricao: 'Fechamento com telha trapezoidal TP-40, montagem inclusa, com pintura',
      unidade: 'M2', quantidade: arred(g.areaFachadaLiquida),
      nota: `${g.areaFachadaBruta} m² − ${g.areaPortas} m² de portas`,
    });
  }

  // ---------- COBERTURA ----------
  const COB: Record<TipoCobertura, string> = {
    tp40_branca: 'Telhamento com telha trapezoidal TP-40 branca, incluso içamento',
    tp40_galvanizada: 'Telhamento com telha trapezoidal TP-40 galvanizada, incluso içamento',
    isotermica_pir: 'Telhamento com telha metálica isotérmica PIR e = 30 mm, com até 2 águas, incluso içamento',
  };
  itens.push({
    etapa: 'COBERTURA', descricao: COB[p.cobertura],
    unidade: 'M2', quantidade: g.areaCobertura,
    nota: `projeção ${g.areaProjecao} m² ÷ cos(${((p.inclinacao ?? 0.1) * 100).toFixed(0)}%) — a telha é inclinada`,
  });
  itens.push({
    etapa: 'COBERTURA', descricao: 'Cumeeira metálica, incluso material e instalação',
    unidade: 'M', quantidade: arred(p.comprimento),
  });
  itens.push({
    etapa: 'COBERTURA', descricao: 'Rufo externo/interno de chapa de aço galvanizado, corte 80 cm',
    unidade: 'M', quantidade: arred(2 * p.vao + 2 * p.comprimento * 0.3),
  });
  itens.push({
    etapa: 'COBERTURA', descricao: 'Calha em chapa de aço galvanizado nº 24, desenvolvimento 100 cm',
    unidade: 'M', quantidade: arred(2 * p.comprimento),
    nota: 'uma calha por água, ao longo dos beirais',
  });

  // ---------- PISO ----------
  if (p.piso !== 'nenhum') {
    const esp = p.espessura_piso ?? 14;
    const FCK: Record<string, string> = {
      industrial_20: 'fck = 20 MPa', industrial_25: 'fck = 25 MPa',
      industrial_30: 'fck = 30 MPa', polido: 'fck = 30 MPa, acabamento polido',
    };
    itens.push({
      etapa: 'PISO', descricao: `Execução de piso industrial de concreto armado, ${FCK[p.piso]}, espessura de ${esp} cm`,
      unidade: 'M2', quantidade: g.areaProjecao,
    });
  }

  // ---------- LAJE / MEZANINO ----------
  if (p.area_laje && p.area_laje > 0) {
    itens.push({
      etapa: 'PISO TERREO - STEEL DECK', descricao: 'Chapa em aço galvanizado para steel deck, nervuras trapezoidais, largura útil 915 mm, e = 0,80 mm',
      unidade: 'M2', quantidade: arred(p.area_laje * 0.96),
    });
    itens.push({
      etapa: 'PISO TERREO - STEEL DECK', descricao: 'Concreto usinado bombeável C30, com bombeamento',
      unidade: 'M3', quantidade: arred(p.area_laje * 0.108),
      nota: 'espessura média de 10,8 cm sobre o deck',
    });
    itens.push({
      etapa: 'PISO TERREO - STEEL DECK', descricao: 'Armação para execução de laje, com uso de tela q-92',
      unidade: 'KG', quantidade: arred(p.area_laje * 1.42),
    });
    itens.push({
      etapa: 'PISO TERREO - STEEL DECK', descricao: 'Pino Stud Welding 3/4" x 5.3/8" (19x110 mm)',
      unidade: 'UN', quantidade: Math.round(p.area_laje * 2.89),
    });
  }

  // ---------- ESQUADRIAS ----------
  for (const d of p.portas ?? []) {
    const NOME: Record<string, string> = {
      enrolar: 'Porta de enrolar em aço galvanizado, com guias e fechadura',
      seccional: 'Porta seccional em aço, com sistema de elevação',
      pivotante: 'Porta pivotante em chapa de aço',
      social: 'Porta social em chapa de aço, com batente e ferragens',
    };
    itens.push({
      etapa: 'ESQUADRIAS',
      descricao: `${NOME[d.tipo]} — ${d.largura} × ${d.altura} m`,
      unidade: 'M2', quantidade: arred(d.largura * d.altura * d.quantidade),
      nota: `${d.quantidade} unidade(s) de ${arred(d.largura * d.altura)} m²`,
    });
  }

  // ---------- PINTURA DA ESTRUTURA ----------
  // A área a pintar é a superfície dos perfis, não a do galpão. O manual dá
  // "u" (área superficial por metro linear) na tabela de perfis; como
  // aproximação usa-se ~4,5 m² por m² de projeção para pórtico de alma cheia.
  itens.push({
    etapa: 'PINTURA',
    descricao: 'Pintura com tinta alquídica de acabamento (esmalte sintético acetinado) pulverizada sobre superfícies metálicas, 2 demãos',
    unidade: 'M2', quantidade: arred(g.areaProjecao * 3.08),
    nota: 'área superficial dos perfis ≈ 3,08 m² por m² de projeção (aferido na Moda Verão)',
  });

  // ---------- MOVIMENTAÇÃO DE TERRA E PRELIMINARES ----------
  const areaTerreno = p.area_terreno ?? arred(g.areaProjecao * 1.3);
  itens.push({
    etapa: 'SERVIÇOS PRELIMINARES',
    descricao: 'Limpeza mecanizada de camada vegetal, vegetação e pequenas árvores, com trator de esteiras',
    unidade: 'M2', quantidade: areaTerreno,
    nota: p.area_terreno ? 'área do terreno informada' : 'terreno estimado em 1,3 × a projeção — informe a área real',
  });
  itens.push({
    etapa: 'SERVIÇOS PRELIMINARES',
    descricao: 'Locação convencional de obra, com gabarito de tábuas corridas pontaletadas a cada 2 m',
    unidade: 'M', quantidade: arred(g.perimetro * 1.15),
  });

  if (!p.area_terreno) avisos.push('Área do terreno não informada: limpeza e terraplenagem foram estimadas. É um item que engana — confira.');
  if (!p.portas?.length) avisos.push('Nenhuma porta informada: o fechamento foi orçado sem desconto de vãos.');

  return { itens, avisos };
}
