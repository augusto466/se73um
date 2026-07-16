/**
 * Fundação profunda — método Décourt-Quaresma, NBR 6122:2019.
 *
 * POR QUE ESTE MÉTODO: é o mais usado no Brasil para estaca a partir de SPT,
 * e é semiempírico — nasceu de prova de carga, não de teoria pura. Para
 * orçamento, é o que dá número defensável com o dado que existe (a sondagem).
 *
 * O LIMITE QUE NÃO SE CONTORNA: a capacidade da estaca sai do N-SPT. Sem
 * sondagem não há cálculo — há estimativa. O sistema faz as duas coisas, mas
 * NUNCA finge que uma é a outra: quando o solo é presumido, ele grita.
 *
 * NBR 6122 item 6.2.1.2: para método semiempírico sem prova de carga, o
 * coeficiente de segurança global é 2,0.
 */

export type TipoSolo = 'argila' | 'silte_argiloso' | 'silte_arenoso' | 'areia';

export type Camada = {
  /** profundidade final da camada, em metros a partir do nível do terreno */
  ate: number;
  /** N-SPT médio da camada */
  nspt: number;
  solo: TipoSolo;
};

export type TipoEstaca = 'escavada' | 'helice_continua' | 'raiz' | 'pre_moldada';

/**
 * Coeficiente K (kPa) — relaciona N-SPT com a resistência de ponta.
 * Tabela de Décourt-Quaresma.
 */
const K_PONTA: Record<TipoSolo, number> = {
  argila: 120,
  silte_argiloso: 200,   // solo residual argiloso
  silte_arenoso: 250,    // solo residual arenoso
  areia: 400,
};

/**
 * Coeficientes α e β (Décourt, 1996) — corrigem o método por tipo de estaca.
 * A estaca escavada mobiliza menos ponta que a cravada: por isso α = 0,3 em
 * argila. Ignorar isso é o erro clássico de quem aplica a fórmula crua.
 */
const ALFA: Record<TipoEstaca, Record<TipoSolo, number>> = {
  escavada:        { argila: 0.30, silte_argiloso: 0.30, silte_arenoso: 0.30, areia: 0.30 },
  helice_continua: { argila: 0.30, silte_argiloso: 0.30, silte_arenoso: 0.30, areia: 0.30 },
  raiz:            { argila: 0.85, silte_argiloso: 0.60, silte_arenoso: 0.60, areia: 0.50 },
  pre_moldada:     { argila: 1.00, silte_argiloso: 1.00, silte_arenoso: 1.00, areia: 1.00 },
};
const BETA: Record<TipoEstaca, Record<TipoSolo, number>> = {
  escavada:        { argila: 0.80, silte_argiloso: 0.65, silte_arenoso: 0.65, areia: 0.50 },
  helice_continua: { argila: 1.00, silte_argiloso: 1.00, silte_arenoso: 1.00, areia: 1.00 },
  raiz:            { argila: 1.50, silte_argiloso: 1.50, silte_arenoso: 1.50, areia: 1.50 },
  pre_moldada:     { argila: 1.00, silte_argiloso: 1.00, silte_arenoso: 1.00, areia: 1.00 },
};

/**
 * Perfis típicos de Goiânia. NÃO SÃO SONDAGEM.
 *
 * Goiânia assenta sobre solo residual de micaxisto/gnaisse, com camada
 * superficial de argila porosa colapsível — que é justamente o problema:
 * ela colapsa quando molha. Por isso o perfil típico despreza os primeiros
 * metros e busca o impenetrável.
 *
 * Use isto para ORÇAR, nunca para EXECUTAR.
 */
export const PERFIS_TIPICOS: Record<string, { nome: string; camadas: Camada[]; nota: string }> = {
  goiania_residual: {
    nome: 'Goiânia — argila porosa sobre solo residual (típico)',
    camadas: [
      { ate: 4, nspt: 4, solo: 'argila' },
      { ate: 8, nspt: 9, solo: 'silte_argiloso' },
      { ate: 12, nspt: 18, solo: 'silte_arenoso' },
      { ate: 20, nspt: 32, solo: 'silte_arenoso' },
    ],
    nota: 'Argila porosa colapsível nos primeiros metros — não confie nela. O impenetrável costuma vir entre 10 e 15 m.',
  },
  goiania_raso: {
    nome: 'Goiânia — impenetrável raso',
    camadas: [
      { ate: 3, nspt: 6, solo: 'argila' },
      { ate: 6, nspt: 15, solo: 'silte_argiloso' },
      { ate: 12, nspt: 35, solo: 'silte_arenoso' },
    ],
    nota: 'Cenário otimista: rocha alterada perto da superfície. Se acertar, a fundação sai barata — mas não conte com isso sem sondar.',
  },
  goiania_profundo: {
    nome: 'Goiânia — argila espessa, impenetrável profundo',
    camadas: [
      { ate: 6, nspt: 3, solo: 'argila' },
      { ate: 12, nspt: 7, solo: 'argila' },
      { ate: 18, nspt: 14, solo: 'silte_argiloso' },
      { ate: 25, nspt: 28, solo: 'silte_arenoso' },
    ],
    nota: 'Cenário pessimista: estaca longa, fundação cara. É o que mais estoura orçamento.',
  },
};

const areaPonta = (diam_cm: number) => Math.PI * (diam_cm / 100) ** 2 / 4;
const perimetro = (diam_cm: number) => Math.PI * (diam_cm / 100);

/** N-SPT na cota da ponta. */
function nspt_na_cota(camadas: Camada[], cota: number): Camada | null {
  return camadas.find(c => cota <= c.ate) ?? camadas[camadas.length - 1] ?? null;
}

/**
 * Capacidade de carga por Décourt-Quaresma.
 *
 *   R_ponta  = α · K · N_ponta · A_ponta
 *   R_fuste  = β · 10 · (N_fuste/3 + 1) · U · L
 *   R_adm    = (R_ponta + R_fuste) / 2      ← NBR 6122, FS global = 2,0
 *
 * O N do fuste é limitado a 15 (Décourt) — acima disso o atrito não cresce
 * proporcionalmente. Quem esquece esse limite superestima a estaca.
 */
export function capacidadeEstaca(p: {
  camadas: Camada[];
  diametro_cm: number;
  profundidade_m: number;
  tipo: TipoEstaca;
}) {
  const { camadas, diametro_cm: D, profundidade_m: L, tipo } = p;
  if (!camadas.length) return { erro: 'Sem perfil de solo.' };

  const cPonta = nspt_na_cota(camadas, L);
  if (!cPonta) return { erro: 'Profundidade fora do perfil informado.' };

  // ---- ponta
  const nPonta = Math.min(cPonta.nspt, 50);      // acima de 50 é impenetrável: não extrapola
  const K = K_PONTA[cPonta.solo];
  const alfa = ALFA[tipo][cPonta.solo];
  const Rp = alfa * K * nPonta * areaPonta(D);   // kN

  // ---- fuste: integra camada a camada até a cota da ponta
  const U = perimetro(D);
  let Rl = 0;
  const detalheFuste: any[] = [];
  let z0 = 0;
  for (const c of camadas) {
    const z1 = Math.min(c.ate, L);
    if (z1 <= z0) continue;
    const trecho = z1 - z0;
    const nFuste = Math.min(Math.max(c.nspt, 3), 15);   // Décourt: 3 ≤ N ≤ 15
    const beta = BETA[tipo][c.solo];
    const rl = beta * 10 * (nFuste / 3 + 1);            // kPa
    const parcela = rl * U * trecho;                    // kN
    Rl += parcela;
    detalheFuste.push({
      de: z0, ate: z1, nspt: c.nspt, n_usado: nFuste, solo: c.solo,
      rl_kpa: Math.round(rl * 10) / 10, parcela_kn: Math.round(parcela),
    });
    z0 = z1;
    if (z0 >= L) break;
  }

  const Rult = Rp + Rl;
  const Radm = Rult / 2;                                 // NBR 6122: FS = 2,0

  return {
    ok: true,
    ponta: {
      nspt: cPonta.nspt, n_usado: nPonta, solo: cPonta.solo,
      K, alfa, area_m2: Math.round(areaPonta(D) * 1000) / 1000,
      R_kn: Math.round(Rp),
    },
    fuste: { detalhe: detalheFuste, R_kn: Math.round(Rl), perimetro_m: Math.round(U * 100) / 100 },
    R_ultima_kn: Math.round(Rult),
    R_admissivel_kn: Math.round(Radm),
    R_admissivel_tf: Math.round(Radm / 9.81 * 10) / 10,
    fs: 2.0,
    metodo: 'Décourt-Quaresma (1978/1996) · NBR 6122:2019 · FS global 2,0 (semiempírico sem prova de carga)',
  };
}

/**
 * Dimensiona a fundação do galpão a partir das reações do pórtico.
 *
 * A combinação é a da NBR 6122 para estado limite de serviço: permanente +
 * sobrecarga, e a envoltória com vento. O vento é o que manda numa base de
 * galpão: o momento de engaste gera tração numa estaca e compressão na outra.
 * Estaca tracionada é o que arranca fundação de galpão em vendaval.
 */
export function dimensionarFundacao(p: {
  /** reações por base, do manual Gerdau, em kN e kN·m */
  rv1: number; rv2: number; rh1: number; rh2: number; mx1: number; mx2: number;
  n_bases: number;
  camadas: Camada[];
  diametro_cm?: number;
  tipo_estaca?: TipoEstaca;
  /** distância entre eixos das estacas no bloco */
  espacamento_estacas_m?: number;
  solo_sondado: boolean;
  perfil_nome?: string;
}) {
  const D = p.diametro_cm ?? 40;
  const tipo = p.tipo_estaca ?? 'helice_continua';
  const e = p.espacamento_estacas_m ?? Math.max(2.5 * D / 100, 1.2);

  // ---- combinações (kN)
  // 1) permanente + sobrecarga: compressão pura
  const N1 = p.rv1;
  const M1 = p.mx1;
  // 2) permanente + vento: o vento alivia o vertical e amplia o momento
  const N2 = p.rv1 + p.rv2;          // rv2 vem negativo (sucção)
  const M2 = p.mx1 + p.mx2;

  // bloco de 2 estacas: o momento vira binário
  const par = (N: number, M: number) => ({
    compressao: N / 2 + M / e,
    tracao: N / 2 - M / e,
  });
  const c1 = par(N1, M1);
  const c2 = par(N2, M2);

  const compressaoMax = Math.max(c1.compressao, c2.compressao);
  const tracaoMax = Math.min(c1.tracao, c2.tracao);   // negativo = tração

  // ---- capacidade: busca a profundidade mínima que atende COMPRESSÃO E TRAÇÃO
  //
  // Em base engastada de pórtico, a TRAÇÃO costuma mandar: o momento de vento
  // é grande e o peso próprio é pequeno, então a estaca de barlavento é
  // arrancada. Dimensionar só pela compressão é o erro que arranca fundação
  // de galpão em vendaval.
  //
  // Na tração só o fuste resiste (a ponta não trabalha), e a NBR 6122 é mais
  // dura: FS = 2,0 sobre o atrito lateral, descontando o peso próprio da estaca.
  const profs = [6, 8, 10, 12, 14, 16, 18, 20, 24];
  let escolhida: any = null;
  let condicionante = 'compressão';
  for (const L of profs) {
    const cap: any = capacidadeEstaca({ camadas: p.camadas, diametro_cm: D, profundidade_m: L, tipo });
    if (cap.erro) continue;
    const pesoProprio = areaPonta(D) * L * 25;          // kN, concreto a 25 kN/m³
    const capTracao = (cap.fuste.R_kn + pesoProprio) / 2;
    const okComp = cap.R_admissivel_kn >= compressaoMax;
    const okTrac = tracaoMax >= 0 || capTracao >= Math.abs(tracaoMax);
    if (okComp && okTrac) {
      escolhida = { profundidade: L, ...cap, cap_tracao_kn: Math.round(capTracao), peso_proprio_kn: Math.round(pesoProprio) };
      // quem exigiu mais profundidade?
      const soComp = profs.find(x => {
        const c: any = capacidadeEstaca({ camadas: p.camadas, diametro_cm: D, profundidade_m: x, tipo });
        return !c.erro && c.R_admissivel_kn >= compressaoMax;
      });
      if (tracaoMax < 0 && soComp && soComp < L) condicionante = 'tração (vento)';
      break;
    }
  }

  const alertas: string[] = [];
  if (!escolhida) {
    const ultima: any = capacidadeEstaca({ camadas: p.camadas, diametro_cm: D, profundidade_m: 24, tipo });
    const pp = areaPonta(D) * 24 * 25;
    alertas.push(`Uma estaca Ø${D} cm não atende nem a 24 m — precisa de ${Math.round(compressaoMax)} kN de compressão e ${Math.round(Math.abs(tracaoMax))} kN de tração. Aumente o diâmetro, aumente o espaçamento do bloco (reduz o binário) ou use mais estacas.`);
    escolhida = { profundidade: 24, ...ultima, cap_tracao_kn: Math.round(((ultima.fuste?.R_kn ?? 0) + pp) / 2), peso_proprio_kn: Math.round(pp) };
  }

  const estacasPorBase = 2;   // bloco de 2 é o padrão para base engastada de pórtico
  const metrosEstaca = p.n_bases * estacasPorBase * escolhida.profundidade;

  // bloco de coroamento
  const volBloco = p.n_bases * (e + 0.6) * 0.9 * 0.8;
  const acoBloco = volBloco * 90;

  if (tracaoMax < 0) {
    alertas.push(`TRAÇÃO de ${Math.round(Math.abs(tracaoMax))} kN numa das estacas (o momento de vento no engaste vira binário no bloco). Consequências que mudam o preço: armadura ao longo de TODO o comprimento, não só no topo; e o comprimento pode ser ditado pela tração, não pela compressão. Numa base de pórtico isso é regra, não exceção.`);
  }
  if (condicionante === 'tração (vento)') {
    alertas.push('O comprimento da estaca foi ditado pela TRAÇÃO, não pela compressão. Se alguém dimensionar só pela carga vertical, vai errar para menos.');
  }
  if (!p.solo_sondado) {
    alertas.push(`SOLO PRESUMIDO — o perfil "${p.perfil_nome ?? 'típico'}" é uma referência regional, não a sua obra. O cálculo está correto; o dado de entrada é chute. Numa proposta, isto é risco: exija a sondagem antes de fechar preço, ou deixe a fundação como preço a confirmar.`);
  }

  return {
    combinacoes: {
      permanente: { N: Math.round(N1), M: Math.round(M1), compressao: Math.round(c1.compressao), tracao: Math.round(c1.tracao) },
      vento: { N: Math.round(N2), M: Math.round(M2), compressao: Math.round(c2.compressao), tracao: Math.round(c2.tracao) },
    },
    compressao_max_kn: Math.round(compressaoMax),
    compressao_max_tf: Math.round(compressaoMax / 9.81 * 10) / 10,
    tracao_max_kn: Math.round(tracaoMax),
    estaca: {
      tipo, diametro_cm: D, profundidade_m: escolhida.profundidade,
      R_admissivel_kn: escolhida.R_admissivel_kn,
      R_admissivel_tf: escolhida.R_admissivel_tf,
      cap_tracao_kn: escolhida.cap_tracao_kn,
      ponta: escolhida.ponta, fuste: escolhida.fuste,
      metodo: escolhida.metodo,
    },
    condicionante,
    n_bases: p.n_bases,
    estacas_por_base: estacasPorBase,
    espacamento_estacas_m: Math.round(e * 100) / 100,
    metros_estaca: Math.round(metrosEstaca),
    volume_bloco_m3: Math.round(volBloco * 10) / 10,
    aco_bloco_kg: Math.round(acoBloco),
    solo_sondado: p.solo_sondado,
    alertas,
  };
}
