/**
 * Motor de replanejamento.
 *
 * Princípio: o baseline contratual (base_*) NUNCA é tocado. Toda simulação
 * e todo replanejamento acontecem sobre prev_*, e o impacto é sempre medido
 * contra o baseline — é isso que sustenta uma conversa contratual.
 *
 * Regra de negócio: antecipar/atrasar a execução move o evento de medição
 * junto (o faturamento acompanha o físico).
 */

export type EventoCron = {
  id: string;
  obra_id: number;
  etapa: string;
  descricao?: string;
  status: string;
  valor_bruto: number;
  base_inicio: string | null;
  base_fim: string | null;
  base_mes: number | null;
  prev_inicio: string | null;
  prev_fim: string | null;
  real_inicio?: string | null;
  real_fim?: string | null;
  duracao_dias: number | null;
  critico?: boolean;
};

export type Dependencia = {
  evento_id: string;      // sucessor
  depende_de: string;     // predecessor
  tipo: 'FS' | 'SS' | 'FF';
  folga_dias: number;
};

export type Ajuste = { evento_id: string; novo_inicio: string };

export type LinhaDiff = {
  evento_id: string;
  etapa: string;
  valor: number;
  de_inicio: string | null;
  para_inicio: string | null;
  de_fim: string | null;
  para_fim: string | null;
  dias: number;                 // negativo = antecipou; positivo = atrasou
  motivo: 'direto' | 'cascata'; // pedido por você ou puxado por dependência
};

export type Impacto = {
  diff: LinhaDiff[];
  entrega_base: string | null;
  entrega_prev: string | null;
  dias_entrega: number;
  faturamento: { periodo: string; base: number; prev: number; delta: number }[];
  alertas: string[];
};

// ---------- utilitários de data (dias corridos, sem fuso) ----------
const D = (s: string) => new Date(s + 'T12:00:00');
const iso = (d: Date) => d.toISOString().slice(0, 10);
const somaDias = (s: string, n: number) => { const d = D(s); d.setDate(d.getDate() + n); return iso(d); };
export const difDias = (a: string, b: string) => Math.round((D(a).getTime() - D(b).getTime()) / 86400000);
const mesDe = (s: string) => s.slice(0, 7);

/** Data vigente de um evento: o replanejado, ou o baseline se ainda não houve replanejamento. */
export const inicioVigente = (e: EventoCron) => e.prev_inicio ?? e.base_inicio;
export const fimVigente = (e: EventoCron) => e.prev_fim ?? e.base_fim;

const duracaoDe = (e: EventoCron) => {
  if (e.duracao_dias && e.duracao_dias > 0) return e.duracao_dias;
  const i = inicioVigente(e), f = fimVigente(e);
  if (i && f) return Math.max(0, difDias(f, i));
  return 0;
};

/**
 * Propaga os ajustes pela cascata de dependências.
 * Devolve o mapa de novas datas SEM gravar nada — é a base tanto da simulação
 * quanto da aplicação de uma revisão.
 */
export function propagar(eventos: EventoCron[], deps: Dependencia[], ajustes: Ajuste[]) {
  const porId = new Map(eventos.map(e => [e.id, e]));
  const novas = new Map<string, { inicio: string; fim: string; motivo: 'direto' | 'cascata' }>();

  // 1) aplica o que foi pedido explicitamente
  for (const a of ajustes) {
    const e = porId.get(a.evento_id);
    if (!e) continue;
    novas.set(e.id, { inicio: a.novo_inicio, fim: somaDias(a.novo_inicio, duracaoDe(e)), motivo: 'direto' });
  }

  // 2) propaga pelos sucessores até estabilizar (o grafo é pequeno; 50 passadas cobrem com folga)
  const sucessores = new Map<string, Dependencia[]>();
  deps.forEach(d => {
    const lista = sucessores.get(d.depende_de) ?? [];
    lista.push(d);
    sucessores.set(d.depende_de, lista);
  });

  for (let passada = 0; passada < 50; passada++) {
    let mudou = false;
    for (const [id, dados] of Array.from(novas.entries())) {
      for (const d of sucessores.get(id) ?? []) {
        const suc = porId.get(d.evento_id);
        if (!suc) continue;
        // evento já concluído não é replanejado
        if (['aprovado', 'glosado'].includes(suc.status)) continue;

        const atual = novas.get(suc.id);
        const iAtual = atual?.inicio ?? inicioVigente(suc);
        if (!iAtual) continue;

        let iNovo: string;
        if (d.tipo === 'FS')      iNovo = somaDias(dados.fim, 1 + d.folga_dias);
        else if (d.tipo === 'SS') iNovo = somaDias(dados.inicio, d.folga_dias);
        else                      iNovo = somaDias(dados.fim, d.folga_dias - duracaoDe(suc)); // FF

        if (iNovo !== iAtual) {
          novas.set(suc.id, { inicio: iNovo, fim: somaDias(iNovo, duracaoDe(suc)), motivo: atual?.motivo === 'direto' ? 'direto' : 'cascata' });
          mudou = true;
        }
      }
    }
    if (!mudou) break;
  }

  return novas;
}

/** Roda o cenário e devolve o impacto completo, sem gravar nada. */
export function simular(
  eventos: EventoCron[],
  deps: Dependencia[],
  ajustes: Ajuste[],
  obra: { entrega_final: string | null; valor_global: number }
): Impacto {
  const porId = new Map(eventos.map(e => [e.id, e]));
  const novas = propagar(eventos, deps, ajustes);

  // ---- diff
  const diff: LinhaDiff[] = [];
  for (const [id, dados] of Array.from(novas.entries())) {
    const e = porId.get(id)!;
    const deI = inicioVigente(e), deF = fimVigente(e);
    if (deI === dados.inicio && deF === dados.fim) continue;
    diff.push({
      evento_id: id, etapa: e.etapa, valor: Number(e.valor_bruto),
      de_inicio: deI, para_inicio: dados.inicio,
      de_fim: deF, para_fim: dados.fim,
      dias: deI ? difDias(dados.inicio, deI) : 0,
      motivo: dados.motivo,
    });
  }
  diff.sort((a, b) => (a.para_inicio ?? '').localeCompare(b.para_inicio ?? ''));

  // ---- entrega: maior fim entre todos os eventos
  const fimBase = eventos.map(e => e.base_fim).filter(Boolean).sort().pop() ?? null;
  const fimNovo = eventos.map(e => novas.get(e.id)?.fim ?? fimVigente(e)).filter(Boolean).sort().pop() ?? null;
  const diasEntrega = fimBase && fimNovo ? difDias(fimNovo, fimBase) : 0;

  // ---- faturamento por mês: baseline x replanejado
  // (regra do CEO: o evento de medição acompanha a execução)
  const meses = new Map<string, { base: number; prev: number }>();
  for (const e of eventos) {
    const v = Number(e.valor_bruto);
    const mBase = e.base_inicio ? mesDe(e.base_inicio) : (e.base_mes ? `M${String(e.base_mes).padStart(2, '0')}` : null);
    const iPrev = novas.get(e.id)?.inicio ?? inicioVigente(e);
    const mPrev = iPrev ? mesDe(iPrev) : mBase;
    if (mBase) { const r = meses.get(mBase) ?? { base: 0, prev: 0 }; r.base += v; meses.set(mBase, r); }
    if (mPrev) { const r = meses.get(mPrev) ?? { base: 0, prev: 0 }; r.prev += v; meses.set(mPrev, r); }
  }
  const faturamento = Array.from(meses.entries())
    .map(([periodo, r]) => ({ periodo, base: r.base, prev: r.prev, delta: r.prev - r.base }))
    .filter(r => r.base || r.prev)
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  // ---- alertas
  const alertas: string[] = [];
  if (obra.entrega_final && fimNovo && fimNovo > obra.entrega_final) {
    const atraso = difDias(fimNovo, obra.entrega_final);
    alertas.push(`A entrega projetada (${fimNovo}) passa da data contratual (${obra.entrega_final}) em ${atraso} dia(s). Cl. 8.1: multa de 0,5%/dia, teto 10%.`);
    if (atraso > 15) alertas.push('Atraso acima de 15 dias — Cl. 8.2 permite rescisão + multa de 20% se a etapa for crítica. Comunicação formal por escrito (Cl. 17.1) é indispensável.');
  }
  if (diasEntrega < 0) alertas.push(`O replanejamento antecipa a conclusão em ${Math.abs(diasEntrega)} dia(s) frente ao baseline.`);

  const antecipados = diff.filter(d => d.dias < 0);
  if (antecipados.length) {
    const valor = antecipados.reduce((s, d) => s + d.valor, 0);
    alertas.push(`${antecipados.length} evento(s) de medição antecipam junto com a execução, somando ${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}. Medir antes do mês contratual depende de aceite da contratante — Cl. 3.4.6 dá 7 dias úteis para análise.`);
  }

  const cascata = diff.filter(d => d.motivo === 'cascata');
  if (cascata.length) alertas.push(`${cascata.length} evento(s) foram movidos por precedência, não por pedido direto.`);

  if (!diff.length) alertas.push('Nenhuma data mudou — verifique se os eventos têm datas e dependências cadastradas.');

  return { diff, entrega_base: fimBase, entrega_prev: fimNovo, dias_entrega: diasEntrega, faturamento, alertas };
}

/** Texto do impacto para o advisor ler e comentar. */
export function impactoEmTexto(imp: Impacto): string {
  const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const L: string[] = [];
  L.push(`Eventos afetados: ${imp.diff.length}`);
  imp.diff.slice(0, 20).forEach(d =>
    L.push(`  ${d.evento_id} ${d.etapa}: ${d.de_inicio} → ${d.para_inicio} (${d.dias > 0 ? '+' : ''}${d.dias}d, ${d.motivo}) · ${brl(d.valor)}`));
  L.push(`Conclusão: baseline ${imp.entrega_base ?? '—'} → replanejada ${imp.entrega_prev ?? '—'} (${imp.dias_entrega > 0 ? '+' : ''}${imp.dias_entrega}d)`);
  L.push('Faturamento por mês (baseline → replanejado):');
  imp.faturamento.filter(f => f.delta !== 0).forEach(f =>
    L.push(`  ${f.periodo}: ${brl(f.base)} → ${brl(f.prev)} (${f.delta > 0 ? '+' : ''}${brl(f.delta)})`));
  if (imp.alertas.length) { L.push('Alertas:'); imp.alertas.forEach(a => L.push(`  - ${a}`)); }
  return L.join('\n');
}
