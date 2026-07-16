/**
 * Pré-dimensionamento estrutural — Manual Gerdau "Galpões em Pórticos com
 * Perfis Estruturais Laminados", 7ª edição (2018).
 *
 * As 144 combinações (3 alturas × 8 vãos × 6 estágios) foram extraídas das
 * tabelas do capítulo 6.4 e validadas contra o exemplo resolvido do próprio
 * manual (pág. 53): H=9, L=30, Q6 → viga W410x46,1, coluna W410x67,0,
 * Rv1=58 kN, Rh1=35 kN, Mx1=124 kN·m. Bate exato.
 *
 * O QUE ISTO É: pré-dimensionamento. O manual é explícito: "É fundamental a
 * avaliação de um profissional habilitado quando da elaboração do projeto
 * executivo." Serve para orçar, não para construir.
 *
 * PREMISSAS DO MANUAL (se a obra fugir disto, o número não vale):
 * - Pórtico de alma cheia, engastado na base, aço ASTM A572 Grau 50
 * - Inclinação de cobertura 10%
 * - Sem ponte rolante
 * - Sobrecarga 0,25 kN/m² · terreno categoria III classe B · S1=S3=1
 * - Deslocamentos: vertical L/250, horizontal H/300
 */

export type Estagio = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5' | 'Q6';

export type LinhaGerdau = {
  h: number; L: number; q: Estagio;
  viga: string; coluna: string;
  /** [permanente+sobrecarga, vento] em kN */
  rv: [number, number];
  rh: [number, number];
  /** momento fletor na base, kN·m */
  mx: [number, number];
};

/** Tabelas 6.4 do manual, na íntegra. */
export const TABELA: LinhaGerdau[] = [
  { h: 6, L: 15, q: 'Q1', viga: 'W360x32.9', coluna: 'W360x44.6', rv: [57, -49], rh: [23, 75], mx: [53, 164] },
  { h: 6, L: 15, q: 'Q2', viga: 'W310x28.3', coluna: 'W360x44.6', rv: [57, -30], rh: [24, 58], mx: [56, 128] },
  { h: 6, L: 15, q: 'Q3', viga: 'W250x25.3', coluna: 'W360x44.6', rv: [56, -16], rh: [26, 43], mx: [61, 98] },
  { h: 6, L: 15, q: 'Q4', viga: 'W200x26.6', coluna: 'W250x38.5', rv: [56, -4], rh: [25, 28], mx: [57, 62] },
  { h: 6, L: 15, q: 'Q5', viga: 'W250x22.3', coluna: 'W250x32.7', rv: [41, -4], rh: [17, 21], mx: [39, 46] },
  { h: 6, L: 15, q: 'Q6', viga: 'W250x17.9', coluna: 'W200x26.6', rv: [26, -3], rh: [11, 15], mx: [24, 30] },
  { h: 6, L: 20, q: 'Q1', viga: 'W410x38.8', coluna: 'W410x60.0', rv: [75, -63], rh: [45, 99], mx: [109, 219] },
  { h: 6, L: 20, q: 'Q2', viga: 'W410x38.8', coluna: 'W410x53.0', rv: [74, -41], rh: [44, 73], mx: [105, 161] },
  { h: 6, L: 20, q: 'Q3', viga: 'W410x38.8', coluna: 'W410x53.0', rv: [74, -22], rh: [44, 51], mx: [105, 113] },
  { h: 6, L: 20, q: 'Q4', viga: 'W360x32.9', coluna: 'W360x51.0', rv: [71, -7], rh: [42, 34], mx: [103, 73] },
  { h: 6, L: 20, q: 'Q5', viga: 'W250x32.7', coluna: 'W360x44.6', rv: [54, -5], rh: [35, 26], mx: [88, 57] },
  { h: 6, L: 20, q: 'Q6', viga: 'W250x22.3', coluna: 'W250x32.7', rv: [34, -5], rh: [21, 18], mx: [52, 39] },
  { h: 6, L: 25, q: 'Q1', viga: 'W410x53.0', coluna: 'W530x72.0', rv: [94, -77], rh: [78, 132], mx: [195, 301] },
  { h: 6, L: 25, q: 'Q2', viga: 'W410x46.1', coluna: 'W530x66.0', rv: [91, -51], rh: [77, 98], mx: [193, 223] },
  { h: 6, L: 25, q: 'Q3', viga: 'W410x38.8', coluna: 'W410x67.0', rv: [90, -28], rh: [74, 68], mx: [186, 152] },
  { h: 6, L: 25, q: 'Q4', viga: 'W360x39.0', coluna: 'W410x60.0', rv: [89, -7], rh: [76, 42], mx: [195, 92] },
  { h: 6, L: 25, q: 'Q5', viga: 'W360x39.0', coluna: 'W410x53.0', rv: [66, -7], rh: [54, 31], mx: [139, 68] },
  { h: 6, L: 25, q: 'Q6', viga: 'W360x32.9', coluna: 'W410x53.0', rv: [43, -5], rh: [37, 22], mx: [94, 98] },
  { h: 6, L: 30, q: 'Q1', viga: 'W530x66.0', coluna: 'W610x101.0', rv: [116, -88], rh: [107, 156], mx: [256, 342] },
  { h: 6, L: 30, q: 'Q2', viga: 'W460x60.0', coluna: 'W530x82.0', rv: [111, -60], rh: [113, 117], mx: [303, 276] },
  { h: 6, L: 30, q: 'Q3', viga: 'W460x52.0', coluna: 'W530x82.0', rv: [109, -34], rh: [113, 81], mx: [309, 187] },
  { h: 6, L: 30, q: 'Q4', viga: 'W410x53.0', coluna: 'W530x82.0', rv: [110, -12], rh: [116, 57], mx: [316, 142] },
  { h: 6, L: 30, q: 'Q5', viga: 'W410x38.8', coluna: 'W460x60.0', rv: [77, -15], rh: [81, 46], mx: [216, 115] },
  { h: 6, L: 30, q: 'Q6', viga: 'W360x32.9', coluna: 'W410x53.0', rv: [50, -11], rh: [54, 33], mx: [148, 83] },
  { h: 6, L: 35, q: 'Q1', viga: 'W530x72.0', coluna: 'W610x101.0', rv: [138, -101], rh: [164, 198], mx: [435, 461] },
  { h: 6, L: 35, q: 'Q2', viga: 'W530x66.0', coluna: 'W530x92.0', rv: [132, -68], rh: [157, 140], mx: [411, 320] },
  { h: 6, L: 35, q: 'Q3', viga: 'W530x66.0', coluna: 'W530x101.0', rv: [133, -37], rh: [158, 101], mx: [423, 225] },
  { h: 6, L: 35, q: 'Q4', viga: 'W530x66.0', coluna: 'W530x101.0', rv: [132, -10], rh: [160, 64], mx: [423, 134] },
  { h: 6, L: 35, q: 'Q5', viga: 'W460x52.0', coluna: 'W530x72.0', rv: [93, -15], rh: [114, 54], mx: [315, 118] },
  { h: 6, L: 35, q: 'Q6', viga: 'W410x38.8', coluna: 'W460x52.0', rv: [58, -11], rh: [72, 39], mx: [201, 90] },
  { h: 6, L: 40, q: 'Q1', viga: 'W610x101.0', coluna: 'W610x140.0', rv: [171, -101], rh: [191, 203], mx: [605, 560] },
  { h: 6, L: 40, q: 'Q2', viga: 'W530x72.0', coluna: 'W610x101.0', rv: [153, -73], rh: [215, 168], mx: [616, 409] },
  { h: 6, L: 40, q: 'Q3', viga: 'W530x66.0', coluna: 'W610x101.0', rv: [152, -36], rh: [217, 108], mx: [619, 254] },
  { h: 6, L: 40, q: 'Q4', viga: 'W530x66.0', coluna: 'W610x101.0', rv: [152, -3], rh: [217, 50], mx: [619, 103] },
  { h: 6, L: 40, q: 'Q5', viga: 'W530x66.0', coluna: 'W530x82.0', rv: [108, -8], rh: [150, 40], mx: [428, 85] },
  { h: 6, L: 40, q: 'Q6', viga: 'W460x52.0', coluna: 'W530x66.0', rv: [69, -9], rh: [98, 31], mx: [282, 69] },
  { h: 6, L: 45, q: 'Q1', viga: 'W610x101.0', coluna: 'W610x155.0', rv: [188, -117], rh: [293, 270], mx: [873, 689] },
  { h: 6, L: 45, q: 'Q2', viga: 'W610x101.0', coluna: 'W610x155.0', rv: [188, -67], rh: [293, 187], mx: [873, 464] },
  { h: 6, L: 45, q: 'Q3', viga: 'W530x82.0', coluna: 'W610x140.0', rv: [174, -37], rh: [277, 120], mx: [840, 279] },
  { h: 6, L: 45, q: 'Q4', viga: 'W530x72.0', coluna: 'W610x125.0', rv: [177, -3], rh: [275, 55], mx: [766, 109] },
  { h: 6, L: 45, q: 'Q5', viga: 'W530x66.0', coluna: 'W610x101.0', rv: [123, -8], rh: [208, 53], mx: [637, 140] },
  { h: 6, L: 45, q: 'Q6', viga: 'W460x52.0', coluna: 'W530x82.0', rv: [78, -10], rh: [130, 39], mx: [392, 94] },
  { h: 6, L: 50, q: 'Q1', viga: 'W610x101.0', coluna: 'W610x174.0', rv: [209, -115], rh: [367, -260], mx: [1147, 612] },
  { h: 6, L: 50, q: 'Q2', viga: 'W610x101.0', coluna: 'W610x174.0', rv: [209, -76], rh: [367, 224], mx: [1149, -594] },
  { h: 6, L: 50, q: 'Q3', viga: 'W530x82.0', coluna: 'W610x174.0', rv: [202, -42], rh: [368, 179], mx: [1188, 501] },
  { h: 6, L: 50, q: 'Q4', viga: 'W530x92.0', coluna: 'W610x155.0', rv: [198, -3], rh: [358, 119], mx: [1128, 347] },
  { h: 6, L: 50, q: 'Q5', viga: 'W530x66.0', coluna: 'W610x125.0', rv: [139, -16], rh: [261, 99], mx: [862, 302] },
  { h: 6, L: 50, q: 'Q6', viga: 'W460x52.0', coluna: 'W530x101.0', rv: [87, -16], rh: [166, 73], mx: [540, 220] },
  { h: 9, L: 15, q: 'Q1', viga: 'W410x38.8', coluna: 'W530x72.0', rv: [71, -47], rh: [17, 93], mx: [56, 318] },
  { h: 9, L: 15, q: 'Q2', viga: 'W410x38.8', coluna: 'W530x72.0', rv: [72, -30], rh: [17, 87], mx: [56, 297] },
  { h: 9, L: 15, q: 'Q3', viga: 'W410x38.8', coluna: 'W410x67.0', rv: [70, -16], rh: [15, 79], mx: [49, 275] },
  { h: 9, L: 15, q: 'Q4', viga: 'W310x32.7', coluna: 'W410x67.0', rv: [69, -24], rh: [17, 76], mx: [56, 277] },
  { h: 9, L: 15, q: 'Q5', viga: 'W310x32.7', coluna: 'W410x67.0', rv: [52, -18], rh: [12, 57], mx: [42, 209] },
  { h: 9, L: 15, q: 'Q6', viga: 'W310x23.8', coluna: 'W410x60.0', rv: [33, -10], rh: [9, 39], mx: [29, 145] },
  { h: 9, L: 20, q: 'Q1', viga: 'W410x46.1', coluna: 'W530x72.0', rv: [87, -61], rh: [31, 109], mx: [109, 367] },
  { h: 9, L: 20, q: 'Q2', viga: 'W410x38.8', coluna: 'W530x72.0', rv: [86, -37], rh: [31, 85], mx: [111, 289] },
  { h: 9, L: 20, q: 'Q3', viga: 'W410x38.8', coluna: 'W410x67.0', rv: [85, -17], rh: [29, 61], mx: [101, 205] },
  { h: 9, L: 20, q: 'Q4', viga: 'W360x39.0', coluna: 'W410x67.0', rv: [85, -2], rh: [30, 42], mx: [104, 142] },
  { h: 9, L: 20, q: 'Q5', viga: 'W310x32.7', coluna: 'W410x67.0', rv: [63, -1], rh: [23, 32], mx: [85, 112] },
  { h: 9, L: 20, q: 'Q6', viga: 'W310x28.3', coluna: 'W410x60.0', rv: [41, -1], rh: [16, 22], mx: [57, 75] },
  { h: 9, L: 25, q: 'Q1', viga: 'W460x52.0', coluna: 'W530x92.0', rv: [108, -74], rh: [52, 132], mx: [182, 442] },
  { h: 9, L: 25, q: 'Q2', viga: 'W410x46.1', coluna: 'W530x82.0', rv: [105, -47], rh: [52, 100], mx: [184, 338] },
  { h: 9, L: 25, q: 'Q3', viga: 'W410x38.8', coluna: 'W410x67.0', rv: [100, -26], rh: [48, 71], mx: [166, 235] },
  { h: 9, L: 25, q: 'Q4', viga: 'W410x38.8', coluna: 'W410x67.0', rv: [100, -3], rh: [48, 47], mx: [166, 154] },
  { h: 9, L: 25, q: 'Q5', viga: 'W410x38.8', coluna: 'W410x67.0', rv: [75, -2], rh: [36, 35], mx: [125, 115] },
  { h: 9, L: 25, q: 'Q6', viga: 'W360x32.9', coluna: 'W410x60.0', rv: [48, -3], rh: [24, 24], mx: [86, 81] },
  { h: 9, L: 30, q: 'Q1', viga: 'W530x66.0', coluna: 'W610x101.0', rv: [128, -89], rh: [77, 155], mx: [279, 523] },
  { h: 9, L: 30, q: 'Q2', viga: 'W530x66.0', coluna: 'W530x82.0', rv: [124, -57], rh: [72, 110], mx: [254, 362] },
  { h: 9, L: 30, q: 'Q3', viga: 'W460x52.0', coluna: 'W530x82.0', rv: [120, -29], rh: [74, 82], mx: [270, 276] },
  { h: 9, L: 30, q: 'Q4', viga: 'W460x52.0', coluna: 'W530x82.0', rv: [120, -2], rh: [74, 51], mx: [270, 168] },
  { h: 9, L: 30, q: 'Q5', viga: 'W410x46.1', coluna: 'W530x72.0', rv: [87, -4], rh: [55, 40], mx: [206, 133] },
  { h: 9, L: 30, q: 'Q6', viga: 'W410x46.1', coluna: 'W410x67.0', rv: [58, -3], rh: [35, 26], mx: [124, 84] },
  { h: 9, L: 35, q: 'Q1', viga: 'W610x101.0', coluna: 'W610x101.0', rv: [157, -95], rh: [106, 162], mx: [376, 532] },
  { h: 9, L: 35, q: 'Q2', viga: 'W530x66.0', coluna: 'W610x101.0', rv: [149, -63], rh: [109, 134], mx: [405, 452] },
  { h: 9, L: 35, q: 'Q3', viga: 'W530x66.0', coluna: 'W610x101.0', rv: [145, -29], rh: [107, 91], mx: [404, 307] },
  { h: 9, L: 35, q: 'Q4', viga: 'W530x66.0', coluna: 'W610x101.0', rv: [145, -3], rh: [108, 53], mx: [402, 169] },
  { h: 9, L: 35, q: 'Q5', viga: 'W460x52.0', coluna: 'W530x82.0', rv: [102, -4], rh: [78, 43], mx: [291, 141] },
  { h: 9, L: 35, q: 'Q6', viga: 'W410x38.8', coluna: 'W410x67.0', rv: [68, -3], rh: [47, 26], mx: [170, 82] },
  { h: 9, L: 40, q: 'Q1', viga: 'W610x101.0', coluna: 'W610x155.0', rv: [192, 104], rh: [159, 206], mx: [588, 707] },
  { h: 9, L: 40, q: 'Q2', viga: 'W610x101.0', coluna: 'W610x101.0', rv: [178, -60], rh: [146, 133], mx: [512, 449] },
  { h: 9, L: 40, q: 'Q3', viga: 'W530x92.0', coluna: 'W610x101.0', rv: [175, -23], rh: [140, 86], mx: [530, 304] },
  { h: 9, L: 40, q: 'Q4', viga: 'W530x92.0', coluna: 'W610x125.0', rv: [172, -10], rh: [142, 47], mx: [514, 140] },
  { h: 9, L: 40, q: 'Q5', viga: 'W530x66.0', coluna: 'W530x92.0', rv: [119, -10], rh: [101, 44], mx: [375, 138] },
  { h: 9, L: 40, q: 'Q6', viga: 'W410x46.1', coluna: 'W460x74.0', rv: [74, -7], rh: [67, 34], mx: [263, 114] },
  { h: 9, L: 45, q: 'Q1', viga: 'W610x101.0', coluna: 'W610x174.0', rv: [216, -107], rh: [207, 232], mx: [817, 846] },
  { h: 9, L: 45, q: 'Q2', viga: 'W610x101.0', coluna: 'W610x155.0', rv: [205, -63], rh: [197, 163], mx: [772, 559] },
  { h: 9, L: 45, q: 'Q3', viga: 'W530x82.0', coluna: 'W610x155.0', rv: [198, -26], rh: [198, 117], mx: [799, 404] },
  { h: 9, L: 45, q: 'Q4', viga: 'W530x72.0', coluna: 'W610x155.0', rv: [195, -40], rh: [199, 68], mx: [808, 231] },
  { h: 9, L: 45, q: 'Q5', viga: 'W530x66.0', coluna: 'W610x101.0', rv: [134, -18], rh: [136, 53], mx: [535, 177] },
  { h: 9, L: 45, q: 'Q6', viga: 'W460x60.0', coluna: 'W530x72.0', rv: [84, -10], rh: [88, 36], mx: [340, 157] },
  { h: 9, L: 50, q: 'Q1', viga: 'W610x140.0', coluna: 'W610x174.0', rv: [240, -117], rh: [257, 244], mx: [1050, 860] },
  { h: 9, L: 50, q: 'Q2', viga: 'W610x101.0', coluna: 'W610x174.0', rv: [228, -70], rh: [248, 189], mx: [1003, 663] },
  { h: 9, L: 50, q: 'Q3', viga: 'W530x92.0', coluna: 'W610x174.0', rv: [220, -18], rh: [240, 123], mx: [1050, 450] },
  { h: 9, L: 50, q: 'Q4', viga: 'W530x92.0', coluna: 'W610x155.0', rv: [220, -40], rh: [250, 56], mx: [1034, 175] },
  { h: 9, L: 50, q: 'Q5', viga: 'W530x82.0', coluna: 'W610x140.0', rv: [160, -12], rh: [182, 47], mx: [753, 150] },
  { h: 9, L: 50, q: 'Q6', viga: 'W460x60.0', coluna: 'W530x92.0', rv: [94, -10], rh: [111, 40], mx: [461, 140] },
  { h: 12, L: 15, q: 'Q1', viga: 'W460x52.0', coluna: 'W610x113.0', rv: [94, -32], rh: [14, 113], mx: [58, 518] },
  { h: 12, L: 15, q: 'Q2', viga: 'W460x52.0', coluna: 'W610x101.0', rv: [91, -14], rh: [13, 88], mx: [57, 404] },
  { h: 12, L: 15, q: 'Q3', viga: 'W410x38.8', coluna: 'W530x82.0', rv: [84, -2], rh: [13, 67], mx: [54, 314] },
  { h: 12, L: 15, q: 'Q4', viga: 'W410x38.8', coluna: 'W530x82.0', rv: [84, -14], rh: [12, 47], mx: [53, 224] },
  { h: 12, L: 15, q: 'Q5', viga: 'W410x38.8', coluna: 'W530x72.0', rv: [60, -9], rh: [9, 36], mx: [38, 36] },
  { h: 12, L: 15, q: 'Q6', viga: 'W310x28.3', coluna: 'W410x60.0', rv: [38, -4], rh: [6, 24], mx: [26, 144] },
  { h: 12, L: 20, q: 'Q1', viga: 'W460x52.0', coluna: 'W610x113.0', rv: [109, -50], rh: [25, 129], mx: [114, 580] },
  { h: 12, L: 20, q: 'Q2', viga: 'W460x52.0', coluna: 'W610x101.0', rv: [106, -26], rh: [24, 98], mx: [109, 453] },
  { h: 12, L: 20, q: 'Q3', viga: 'W410x38.8', coluna: 'W530x92.0', rv: [101, -7], rh: [24, 75], mx: [110, 346] },
  { h: 12, L: 20, q: 'Q4', viga: 'W410x38.8', coluna: 'W530x82.0', rv: [99, -11], rh: [24, 52], mx: [107, 239] },
  { h: 12, L: 20, q: 'Q5', viga: 'W410x38.8', coluna: 'W530x72.0', rv: [72, -6], rh: [18, 39], mx: [78, 176] },
  { h: 12, L: 20, q: 'Q6', viga: 'W310x28.3', coluna: 'W410x60.0', rv: [45, -1], rh: [11, 26], mx: [52, 122] },
  { h: 12, L: 25, q: 'Q1', viga: 'W530x66.0', coluna: 'W610x113.0', rv: [127, -67], rh: [40, 141], mx: [175, 624] },
  { h: 12, L: 25, q: 'Q2', viga: 'W410x60.0', coluna: 'W610x101.0', rv: [122, -38], rh: [40, 109], mx: [183, 499] },
  { h: 12, L: 25, q: 'Q3', viga: 'W410x46.1', coluna: 'W530x92.0', rv: [117, -15], rh: [38, 81], mx: [176, 373] },
  { h: 12, L: 25, q: 'Q4', viga: 'W410x38.8', coluna: 'W530x82.0', rv: [112, -6], rh: [37, 57], mx: [174, 264] },
  { h: 12, L: 25, q: 'Q5', viga: 'W410x38.8', coluna: 'W530x72.0', rv: [82, -2], rh: [28, 42], mx: [126, 195] },
  { h: 12, L: 25, q: 'Q6', viga: 'W360x32.9', coluna: 'W410x60.0', rv: [52, -1], rh: [17, 28], mx: [79, 131] },
  { h: 12, L: 30, q: 'Q1', viga: 'W530x72.0', coluna: 'W610x155.0', rv: [155, -74], rh: [60, 163], mx: [286, 745] },
  { h: 12, L: 30, q: 'Q2', viga: 'W530x66.0', coluna: 'W610x125.0', rv: [146, -44], rh: [58, 122], mx: [272, 551] },
  { h: 12, L: 30, q: 'Q3', viga: 'W460x60.0', coluna: 'W530x92.0', rv: [136, -21], rh: [55, 87], mx: [254, 387] },
  { h: 12, L: 30, q: 'Q4', viga: 'W460x52.0', coluna: 'W530x101.0', rv: [135, -1], rh: [56, 59], mx: [262, 265] },
  { h: 12, L: 30, q: 'Q5', viga: 'W410x46.1', coluna: 'W530x82.0', rv: [97, -2], rh: [41, 45], mx: [195, 205] },
  { h: 12, L: 30, q: 'Q6', viga: 'W410x38.8', coluna: 'W410x67.0', rv: [62, -2], rh: [25, 30], mx: [117, 134] },
  { h: 12, L: 35, q: 'Q1', viga: 'W610x101.0', coluna: 'W610x140.0', rv: [180, -86], rh: [83, 172], mx: [382, 751] },
  { h: 12, L: 35, q: 'Q2', viga: 'W530x72.0', coluna: 'W610x113.0', rv: [163, -57], rh: [81, 136], mx: [382, 604] },
  { h: 12, L: 35, q: 'Q3', viga: 'W530x66.0', coluna: 'W610x101.0', rv: [157, -25], rh: [79, 97], mx: [374, 429] },
  { h: 12, L: 35, q: 'Q4', viga: 'W530x66.0', coluna: 'W610x101.0', rv: [159, -11], rh: [80, 61], mx: [382, 272] },
  { h: 12, L: 35, q: 'Q5', viga: 'W460x52.0', coluna: 'W530x101.0', rv: [113, -13], rh: [58, 49], mx: [283, 219] },
  { h: 12, L: 35, q: 'Q6', viga: 'W410x38.8', coluna: 'W360x79.0', rv: [70, -3], rh: [35, 34], mx: [165, 147] },
  { h: 12, L: 40, q: 'Q1', viga: 'W610x101.0', coluna: 'W610x155.0', rv: [208, -94], rh: [120, 211], mx: [534, 878] },
  { h: 12, L: 40, q: 'Q2', viga: 'W610x101.0', coluna: 'W610x113.0', rv: [189, -61], rh: [139, 133], mx: [480, 613] },
  { h: 12, L: 40, q: 'Q3', viga: 'W610x101.0', coluna: 'W610x101.0', rv: [187, -20], rh: [103, 95], mx: [464, 401] },
  { h: 12, L: 40, q: 'Q4', viga: 'W610x101.0', coluna: 'W610x101.0', rv: [187, -19], rh: [143, 48], mx: [536, 223] },
  { h: 12, L: 40, q: 'Q5', viga: 'W530x66.0', coluna: 'W530x82.0', rv: [126, -34], rh: [100, 45], mx: [373, 207] },
  { h: 12, L: 40, q: 'Q6', viga: 'W460x52.0', coluna: 'W460x74.0', rv: [79, -5], rh: [47, 35], mx: [225, 151] },
  { h: 12, L: 45, q: 'Q1', viga: 'W610x125.0', coluna: 'W610x174.0', rv: [216, -106], rh: [153, 231], mx: [739, 970] },
  { h: 12, L: 45, q: 'Q2', viga: 'W610x101.0', coluna: 'W610x155.0', rv: [219, -89], rh: [143, 165], mx: [700, 721] },
  { h: 12, L: 45, q: 'Q3', viga: 'W610x101.0', coluna: 'W610x113.0', rv: [210, -21], rh: [137, 104], mx: [633, 436] },
  { h: 12, L: 45, q: 'Q4', viga: 'W530x92.0', coluna: 'W610x113.0', rv: [204, -15], rh: [138, 62], mx: [655, 254] },
  { h: 12, L: 45, q: 'Q5', viga: 'W530x72.0', coluna: 'W610x101.0', rv: [145, -10], rh: [101, 51], mx: [497, 221] },
  { h: 12, L: 45, q: 'Q6', viga: 'W460x60.0', coluna: 'W530x72.0', rv: [89, -10], rh: [63, 37], mx: [304, 159] },
  { h: 12, L: 50, q: 'Q1', viga: 'W610x125.0', coluna: 'W610x217.0', rv: [276, -106], rh: [205, 245], mx: [1023, 1093] },
  { h: 12, L: 50, q: 'Q2', viga: 'W610x101.0', coluna: 'W610x195.0', rv: [263, -50], rh: [200, 176], mx: [1000, 790] },
  { h: 12, L: 50, q: 'Q3', viga: 'W610x101.0', coluna: 'W610x195.0', rv: [247, -21], rh: [187, 112], mx: [908, 478] },
  { h: 12, L: 50, q: 'Q4', viga: 'W610x113.0', coluna: 'W610x195.0', rv: [254, -15], rh: [188, 62], mx: [952, 217] },
  { h: 12, L: 50, q: 'Q5', viga: 'W530x72.0', coluna: 'W610x140.0', rv: [165, -10], rh: [136, 56], mx: [696, 240] },
  { h: 12, L: 50, q: 'Q6', viga: 'W460x60.0', coluna: 'W530x109.0', rv: [103, -10], rh: [84, 41], mx: [446, 183] },];

/**
 * Tabela 3 — composição dos estágios de ação.
 * O estágio combina a velocidade básica do vento (NBR 6123) com o espaçamento
 * entre pórticos. É o dado de entrada das tabelas.
 */
export function estagio(v0: number, B: number): Estagio | null {
  const m: Record<string, Estagio> = {
    '45|12': 'Q1',
    '45|9': 'Q2', '40|12': 'Q2',
    '40|9': 'Q3', '35|12': 'Q3',
    '45|6': 'Q4', '35|9': 'Q4', '30|12': 'Q4',
    '40|6': 'Q5', '30|9': 'Q5',
    '35|6': 'Q5',   // o manual lista 35/6 em Q5
    '30|6': 'Q6',
  };
  return m[`${v0}|${B}`] ?? null;
}

/** Peso do perfil em kg/m — está no próprio nome (W410x46.1 → 46,1 kg/m). */
export function pesoPerfil(perfil: string): number {
  const m = perfil.match(/x([\d.]+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * Consulta com interpolação.
 *
 * O manual manda arredondar para cima (usar a tabela imediatamente superior)
 * quando a medida é intermediária — é o que o exemplo 2 da pág. 54 faz:
 * H=11 m consulta a tabela de H=12 m. Isso é conservador e é o certo para
 * orçamento: erra para mais, não para menos.
 */
export function consultar(H: number, L: number, v0: number, B: number) {
  const q = estagio(v0, B);
  if (!q) return { erro: `Sem estágio para vento ${v0} m/s com espaçamento ${B} m. O manual cobre V0 de 30 a 45 m/s e B de 6, 9 ou 12 m.` };

  const alturas = [6, 9, 12];
  const vaos = [15, 20, 25, 30, 35, 40, 45, 50];
  const hUsar = alturas.find(a => a >= H) ?? null;
  const lUsar = vaos.find(v => v >= L) ?? null;

  if (!hUsar) return { erro: `Altura de ${H} m passa do limite do manual (12 m). Precisa de projeto estrutural específico.` };
  if (!lUsar) return { erro: `Vão de ${L} m passa do limite do manual (50 m). Precisa de projeto estrutural específico.` };

  const linha = TABELA.find(x => x.h === hUsar && x.L === lUsar && x.q === q);
  if (!linha) return { erro: `Combinação H=${hUsar} L=${lUsar} ${q} não está nas tabelas.` };

  const avisos: string[] = [];
  if (hUsar !== H) avisos.push(`Altura ${H} m → tabela de ${hUsar} m (o manual manda arredondar para cima; é conservador).`);
  if (lUsar !== L) avisos.push(`Vão ${L} m → tabela de ${lUsar} m (idem).`);

  return { ok: true, estagio: q, linha, h_tabela: hUsar, L_tabela: lUsar, avisos };
}

/**
 * Peso da estrutura, item a item, a partir da geometria.
 *
 * Método: conta os pórticos, mede cada peça e multiplica pelo peso linear do
 * perfil. É o mesmo caminho da lista de material do manual (pág. 60), e por
 * isso dá para conferir: o exemplo GMQ6/30/9/6 fecha em 25,6 kg/m² de
 * pórtico + travamentos, 32,5 kg/m² com o fechamento.
 */
export function pesoEstrutura(p: {
  vao: number; altura: number; comprimento: number; espacamento: number;
  v0: number; inclinacao?: number;
}) {
  const c = consultar(p.altura, p.vao, p.v0, p.espacamento);
  if ('erro' in c && c.erro) return c;
  const { linha, estagio: q, avisos } = c as any;

  const inc = p.inclinacao ?? 0.10;                       // 10%, premissa do manual
  const nPorticos = Math.floor(p.comprimento / p.espacamento) + 1;
  const areaProj = p.vao * p.comprimento;

  // a viga sobe pela inclinação: cada água mede (vão/2) / cos(θ)
  const ang = Math.atan(inc);
  const compViga = (p.vao / 2) / Math.cos(ang) * 2;

  const kgColuna = pesoPerfil(linha.coluna);
  const kgViga = pesoPerfil(linha.viga);

  const itens = [
    { peca: 'Colunas do pórtico', perfil: linha.coluna, un: 'kg',
      qtd: Math.round(nPorticos * 2 * (p.altura + 0.3) * kgColuna),
      nota: `${nPorticos} pórtico(s) × 2 colunas × ${(p.altura + 0.3).toFixed(1)} m` },
    { peca: 'Vigas do pórtico', perfil: linha.viga, un: 'kg',
      qtd: Math.round(nPorticos * compViga * kgViga),
      nota: `${nPorticos} × ${compViga.toFixed(1)} m (inclinação ${(inc * 100).toFixed(0)}%)` },
    // mísulas: recorte da própria viga, b = L/10 (cap. 5.1) — ~8% a mais de viga
    { peca: 'Mísulas (recorte da viga)', perfil: linha.viga, un: 'kg',
      qtd: Math.round(nPorticos * 2 * (p.vao / 10) * kgViga * 0.5),
      nota: `b = L/10 = ${(p.vao / 10).toFixed(1)} m por nó` },
  ];

  const pesoPortico = itens.reduce((s, i) => s + i.qtd, 0);

  // Travamentos e acessórios: proporções da lista de material do manual (pág. 60).
  // Terças UDC 150x60x20 a cada 2,5 m (contenção da mesa comprimida, cap. 3.3.3).
  const nTercas = Math.ceil(compViga / 2.5) + 1;
  const kgTerca = 6.04;
  const terças = Math.round(nTercas * p.comprimento * kgTerca);

  const acessorios = [
    { peca: 'Terças UDC 150x60x20x3', perfil: 'UDC 150x60x20', un: 'kg', qtd: terças,
      nota: `${nTercas} linha(s) × ${p.comprimento} m — travamento a cada 2,5 m` },
    { peca: 'Escoras de beiral W150x22,5', perfil: 'W150x22.5', un: 'kg',
      qtd: Math.round((nPorticos - 1) * 2 * p.espacamento * 22.5), nota: 'entre pórticos, nos dois beirais' },
    { peca: 'Contraventamento vertical e horizontal L76x5', perfil: 'L76x5', un: 'kg',
      qtd: Math.round(pesoPortico * 0.13), nota: '≈13% do pórtico (aferido na lista do manual, pág. 60)' },
    { peca: 'Tirantes Ø16 e L51x3', perfil: 'Ø16 / L51x3', un: 'kg',
      qtd: Math.round(terças * 0.14), nota: '≈14% das terças' },
    { peca: 'Placas de base e chumbadores', perfil: 'CH 25 / Ø25', un: 'kg',
      qtd: Math.round(nPorticos * 2 * 57), nota: `${nPorticos * 2} base(s) × 57 kg — ver tabela 6.6 do manual` },
    { peca: 'Detalhes de ligação', perfil: '—', un: 'kg',
      qtd: Math.round(pesoPortico * 0.042), nota: 'chapas, parafusos, solda — 3% sobre o total (aferido no manual)' },
  ];

  const total = pesoPortico + acessorios.reduce((s, i) => s + i.qtd, 0);
  const taxa = areaProj > 0 ? total / areaProj : 0;

  return {
    ok: true, estagio: q, avisos,
    perfis: { viga: linha.viga, coluna: linha.coluna },
    itens: [...itens, ...acessorios],
    n_porticos: nPorticos,
    peso_total_kg: total,
    taxa_kg_m2: Math.round(taxa * 10) / 10,
    area_projecao: areaProj,
    reacoes: {
      rv1: linha.rv[0], rv2: linha.rv[1],
      rh1: linha.rh[0], rh2: linha.rh[1],
      mx1: linha.mx[0], mx2: linha.mx[1],
      nota: 'Índice 1 = permanente + sobrecarga; índice 2 = vento. Valores por base, em kN e kN·m.',
    },
  };
}

/**
 * Fundação a partir das reações do pórtico.
 *
 * AQUI MORA O LIMITE: dimensionar estaca exige sondagem SPT. Sem o laudo do
 * solo, qualquer número é chute com aparência de cálculo. Então o sistema
 * exige a capacidade do solo como PREMISSA EXPLÍCITA e diz de onde ela veio.
 */
export function fundacao(p: {
  rv1: number; rh1: number; mx1: number;
  n_porticos: number;
  /** capacidade da estaca em tf. Sem sondagem, é premissa — não cálculo. */
  capacidade_estaca_tf?: number;
  diametro_estaca_cm?: number;
  profundidade_m?: number;
}) {
  const nBases = p.n_porticos * 2;
  const cap = p.capacidade_estaca_tf ?? 40;
  const diam = p.diametro_estaca_cm ?? 60;
  const prof = p.profundidade_m ?? 8;

  // carga por base: vertical + o efeito do momento (binário no bloco)
  const cargaVertical_tf = p.rv1 / 9.81;
  const bracoBloco = 1.2;                                  // m — típico para bloco de 2 estacas
  const acrescimoMomento_tf = (p.mx1 / 9.81) / bracoBloco;
  const cargaTotal_tf = cargaVertical_tf + acrescimoMomento_tf;

  const estacasPorBase = Math.max(1, Math.ceil(cargaTotal_tf / cap));
  const metrosEstaca = nBases * estacasPorBase * prof;

  // bloco de coroamento: volume aproximado por estaca
  const volBloco = nBases * (estacasPorBase >= 2 ? 1.8 : 0.9);
  const kgAcoBloco = volBloco * 85;                        // taxa usual de armadura em bloco

  return {
    n_bases: nBases,
    carga_por_base_tf: Math.round(cargaTotal_tf * 10) / 10,
    estacas_por_base: estacasPorBase,
    metros_estaca: Math.round(metrosEstaca),
    volume_bloco_m3: Math.round(volBloco * 10) / 10,
    aco_bloco_kg: Math.round(kgAcoBloco),
    premissas: [
      `Capacidade da estaca: ${cap} tf (Ø${diam} cm × ${prof} m).`,
      `Carga por base: ${Math.round(cargaVertical_tf)} tf vertical + ${Math.round(acrescimoMomento_tf)} tf do momento de engaste.`,
    ],
    alerta: p.capacidade_estaca_tf
      ? 'A capacidade da estaca foi informada como premissa. Confirme com o laudo de sondagem antes de fechar preço.'
      : 'SEM SONDAGEM: a capacidade de 40 tf é um valor genérico, não um cálculo. A fundação é o item que mais surpreende em obra — exija o SPT antes de assumir esse número numa proposta.',
  };
}
