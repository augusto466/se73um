/**
 * Parsing de extrato bancário (OFX + CSV) e casamento com lançamentos.
 * Tudo puro/sem I/O — só transforma texto em linhas, e linhas em
 * candidatos de casamento. Nenhuma chamada de rede aqui.
 */

export type LinhaExtratoParsed = {
  data: string;                    // YYYY-MM-DD
  valor: number;                   // sempre positivo — a direção vai em `tipo`
  tipo: 'debito' | 'credito';
  descricao: string;
  fitid: string | null;
};

const numBR = (s: string) => {
  const limpo = String(s ?? '').replace(/[R$\s]/g, '');
  if (!limpo) return 0;
  const n = Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo);
  return isFinite(n) ? n : 0;
};

// ---------------- OFX (SGML 1.x e XML 2.x, mesmo parser) ----------------

function extrairTagsOFX(bloco: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const re = /<([A-Za-z0-9._]+)>\s*([^\r\n<]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bloco))) {
    const valor = m[2].trim();
    if (valor) tags[m[1].toUpperCase()] = valor;
  }
  return tags;
}

function parseDataOFX(dtposted: string): string | null {
  const digitos = dtposted.replace(/\D/g, '').slice(0, 8);
  if (digitos.length < 8) return null;
  return `${digitos.slice(0, 4)}-${digitos.slice(4, 6)}-${digitos.slice(6, 8)}`;
}

/** Extrai as transações de um arquivo OFX (texto bruto). */
export function parseOFX(texto: string): LinhaExtratoParsed[] {
  const linhas: LinhaExtratoParsed[] = [];
  const reBloco = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let m: RegExpExecArray | null;
  while ((m = reBloco.exec(texto))) {
    const tags = extrairTagsOFX(m[1]);
    const data = tags.DTPOSTED ? parseDataOFX(tags.DTPOSTED) : null;
    const bruto = tags.TRNAMT ? numBR(tags.TRNAMT) : 0;
    if (!data || !bruto) continue;
    linhas.push({
      data,
      valor: Math.abs(bruto),
      tipo: bruto < 0 ? 'debito' : 'credito',
      descricao: tags.NAME || tags.MEMO || tags.PAYEE || 'Sem descrição',
      fitid: tags.FITID || null,
    });
  }
  return linhas;
}

/** Início/fim do período coberto, se o OFX declarar (para extrato_importado.periodo). */
export function periodoOFX(texto: string): { inicio: string | null; fim: string | null } {
  const tags = extrairTagsOFX(texto);
  return {
    inicio: tags.DTSTART ? parseDataOFX(tags.DTSTART) : null,
    fim: tags.DTEND ? parseDataOFX(tags.DTEND) : null,
  };
}

// ---------------- CSV (layout variável por banco) ----------------

export type MapeamentoCSV = { iData: number; iDescricao: number; iValor: number; iDebito: number; iCredito: number };

/** Lê a primeira linha como cabeçalho e detecta o separador (';' ou ','). */
export function detectarCabecalhoCSV(texto: string) {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim());
  if (!linhas.length) return { cabecalho: [] as string[], separador: ';', linhas: [] as string[] };
  const separador = (linhas[0].match(/;/g) ?? []).length >= (linhas[0].match(/,/g) ?? []).length ? ';' : ',';
  const cabecalho = linhas[0].split(separador).map(c => c.trim().replace(/^"|"$/g, ''));
  return { cabecalho, separador, linhas };
}

/** Heurística: pré-seleciona colunas pelo nome do cabeçalho. Editável na tela. */
export function sugerirMapeamento(cabecalho: string[]): MapeamentoCSV {
  const low = cabecalho.map(c => c.toLowerCase());
  const acha = (subs: string[]) => low.findIndex(c => subs.some(s => c.includes(s)));
  return {
    iData: acha(['data', 'date']),
    iDescricao: acha(['descri', 'histor', 'memo', 'lancamento', 'lançamento']),
    iValor: acha(['valor', 'amount', 'montante']),
    iDebito: acha(['debito', 'débito', 'saida', 'saída']),
    iCredito: acha(['credito', 'crédito', 'entrada']),
  };
}

function normalizarDataCSV(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/); // dd/mm/aaaa — convenção BR
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Aplica o mapeamento de colunas às linhas de dados (sem o cabeçalho). */
export function parseLinhasCSV(linhasTexto: string[], separador: string, map: MapeamentoCSV): LinhaExtratoParsed[] {
  const out: LinhaExtratoParsed[] = [];
  for (let n = 1; n < linhasTexto.length; n++) {
    const cols = linhasTexto[n].split(separador).map(c => c.trim().replace(/^"|"$/g, ''));
    if (map.iData < 0 || !cols[map.iData]) continue;
    const data = normalizarDataCSV(cols[map.iData]);
    if (!data) continue;
    const descricao = map.iDescricao >= 0 ? (cols[map.iDescricao] || 'Sem descrição') : 'Sem descrição';

    let valor = 0;
    let tipo: 'debito' | 'credito' = 'debito';
    if (map.iValor >= 0) {
      const bruto = numBR(cols[map.iValor]);
      if (!bruto) continue;
      valor = Math.abs(bruto);
      tipo = bruto < 0 ? 'debito' : 'credito';
    } else {
      const deb = map.iDebito >= 0 ? numBR(cols[map.iDebito]) : 0;
      const cred = map.iCredito >= 0 ? numBR(cols[map.iCredito]) : 0;
      if (deb > 0) { valor = Math.abs(deb); tipo = 'debito'; }
      else if (cred > 0) { valor = Math.abs(cred); tipo = 'credito'; }
      else continue;
    }
    if (valor <= 0) continue;
    out.push({ data, valor, tipo, descricao, fitid: null });
  }
  return out;
}

// ---------------- Dedup e casamento ----------------

/** Mesma fórmula gravada em extrato_linha.chave_sintetica — usada quando não há FITID. */
export function chaveSintetica(data: string, valor: number, descricao: string) {
  return `${data}|${valor.toFixed(2)}|${descricao.trim().toLowerCase().slice(0, 40)}`;
}

export function diasEntre(a: string, b: string) {
  return Math.round((new Date(a + 'T12:00:00').getTime() - new Date(b + 'T12:00:00').getTime()) / 86400000);
}

/** Lançamentos abertos com mesmo valor e data dentro da janela de tolerância. */
export function candidatosParaLinha(
  linha: { data: string; valor: number; tipo: 'debito' | 'credito' },
  lancamentos: any[],
  janelaDias: number
) {
  const natureza = linha.tipo === 'debito' ? 'pagar' : 'receber';
  return lancamentos.filter(l =>
    ['previsto', 'confirmado'].includes(l.status) &&
    l.natureza === natureza &&
    Number(l.valor) === Number(linha.valor) &&
    Math.abs(diasEntre(l.vencimento, linha.data)) <= janelaDias
  );
}
