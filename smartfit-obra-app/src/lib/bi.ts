/* =====================================================================
   Motor de inteligência do cockpit.
   Transforma dados operacionais em diagnóstico: margem, caixa, prazo e decisão.
   Toda projeção é marcada como estimativa e explica a premissa.
   ===================================================================== */
import { projetarCaixa } from './financeiro';

export type Semaforo = 'ok' | 'atencao' | 'critico';

export const CORES: Record<Semaforo, string> = {
  ok: 'var(--ok)', atencao: 'var(--warn)', critico: 'var(--brand)',
};

/* ---------- 1) MARGEM ---------- */
export function analisarMargem(obras: any[], desvios: any[]) {
  const medido = obras.reduce((s, o) => s + Number(o.medido || 0), 0);
  const comprado = obras.reduce((s, o) => s + Number(o.custo_comprado || 0), 0);
  const margem = medido - comprado;
  const margemPct = medido > 0 ? margem / medido * 100 : 0;

  // margem projetada: se o ritmo de compra vs. orçado se mantiver até o fim
  const porObra = obras.map(o => {
    const dObra = desvios.filter(d => d.obra_id === o.obra_id && Number(d.valor_orcado) > 0);
    const orcadoTotal = dObra.reduce((s, d) => s + Number(d.valor_orcado), 0);
    const compradoAte = dObra.reduce((s, d) => s + Number(d.valor_comprado || 0), 0);
    // etapas que já têm compra: qual o fator médio de desvio?
    const comCompra = dObra.filter(d => Number(d.valor_comprado) > 0);
    const fator = comCompra.length
      ? comCompra.reduce((s, d) => s + Number(d.valor_comprado) / Number(d.valor_orcado), 0) / comCompra.length
      : 1;
    const custoProjetado = orcadoTotal * fator;
    const margemProjetada = Number(o.valor_global) - custoProjetado;
    const margemProjPct = Number(o.valor_global) > 0 ? margemProjetada / Number(o.valor_global) * 100 : 0;

    // etapas sangrando (comprou acima do orçado)
    const sangria = dObra
      .filter(d => Number(d.desvio_compra) > 0)
      .map(d => ({ etapa: d.etapa, desvio: Number(d.desvio_compra), pct: Number(d.desvio_pct) }))
      .sort((a, b) => b.desvio - a.desvio);

    return {
      ...o, orcadoTotal, compradoAte, fator, custoProjetado,
      margemProjetada, margemProjPct, sangria,
      confiavel: comCompra.length >= 2,   // com <2 etapas compradas, a projeção é frágil
      etapasCompradas: comCompra.length, etapasTotal: dObra.length,
    };
  });

  const margemProjetadaTotal = porObra.reduce((s, o) => s + o.margemProjetada, 0);
  const carteira = obras.reduce((s, o) => s + Number(o.valor_global || 0), 0);
  const margemProjPctTotal = carteira > 0 ? margemProjetadaTotal / carteira * 100 : 0;

  return { medido, comprado, margem, margemPct, porObra, margemProjetadaTotal, margemProjPctTotal, carteira };
}

/* ---------- 2) CAIXA ---------- */
export function analisarCaixa(lancamentos: any[], saldo: number) {
  const proj = projetarCaixa(lancamentos.filter(l => ['previsto', 'confirmado'].includes(l.status)), saldo, 26);
  const menor = proj.length ? Math.min(...proj.map(p => p.saldo)) : saldo;
  const semanaFura = proj.find(p => p.saldo < 0);
  const semanasAteFurar = semanaFura ? proj.indexOf(semanaFura) : null;

  // runway: por quantas semanas o saldo se mantém positivo
  const runway = semanasAteFurar ?? proj.length;
  const queima = proj.slice(0, 4).reduce((s, p) => s + (p.sai - p.entra), 0) / 4; // média semanal
  const sem: Semaforo = semanasAteFurar === null ? 'ok' : semanasAteFurar <= 4 ? 'critico' : 'atencao';

  return { proj, menor, semanaFura, semanasAteFurar, runway, queima, semaforo: sem };
}

/* ---------- 3) PRAZO ---------- */
export function analisarPrazo(obras: any[]) {
  return obras.map(o => {
    const meses = (o.meses ?? []) as any[];
    const planAcum = meses.filter(m => m.id <= o.mes_atual).reduce((s, m) => s + Number(m.plan), 0);
    const planPct = Number(o.valor_global) > 0 ? planAcum / Number(o.valor_global) * 100 : 0;
    const realPct = Number(o.avanco_pct || 0);
    const gap = realPct - planPct;

    // projeção: mantido o ritmo atual, quando chega a 100%?
    const hoje = new Date();
    const entrega = o.entrega_final ? new Date(o.entrega_final + 'T12:00:00') : null;
    const diasRestantes = entrega ? Math.ceil((entrega.getTime() - hoje.getTime()) / 86400000) : 0;
    // ritmo = % por mês corrido (baseado no mês atual do cronograma)
    const ritmo = o.mes_atual > 0 ? realPct / o.mes_atual : 0;
    const mesesNecessarios = ritmo > 0 ? (100 - realPct) / ritmo : Infinity;
    const diasNecessarios = mesesNecessarios * 30;
    const atrasoProjetado = isFinite(diasNecessarios) ? Math.round(diasNecessarios - diasRestantes) : null;

    const sem: Semaforo = gap < -10 ? 'critico' : gap < -3 ? 'atencao' : 'ok';
    return { ...o, planPct, realPct, gap, diasRestantes, ritmo, atrasoProjetado, semaforo: sem };
  });
}

/* ---------- 4) GARGALOS (decisões travadas com valor e consequência) ---------- */
export function analisarGargalos(eventos: any[], pedidos: any[], cotacoes: any[], obras: any[]) {
  const hoje = new Date();
  const g: any[] = [];

  // medições aguardando validação
  eventos.filter(e => e.status === 'validacao').forEach(e => {
    const obra = obras.find(o => o.obra_id === e.obra_id);
    const dias = e.atualizado_em ? Math.floor((hoje.getTime() - new Date(e.atualizado_em).getTime()) / 86400000) : 0;
    const liq = Number(e.valor_bruto) * 0.9;
    g.push({
      tipo: 'medicao', id: e.id, obra: obra?.codigo ?? '—', obraId: e.obra_id,
      titulo: `Medição ${e.id} — ${e.etapa}`,
      valor: liq, dias,
      prazoContratual: 7,
      consequencia: dias > 7
        ? `Prazo de análise da Cl. 3.4.6 (7 dias úteis) estourado há ${dias - 7} dia(s). A contratada pode alegar mora.`
        : `Restam ${7 - dias} dia(s) úteis do prazo de análise (Cl. 3.4.6).`,
      impacto: liq, href: '/cronograma',
    });
  });

  // pedidos aguardando aprovação
  pedidos.filter(p => p.status === 'enviado').forEach(p => {
    const obra = obras.find(o => o.obra_id === p.obra_id);
    const cots = cotacoes.filter(c => c.pedido_id === p.id);
    const menor = cots.length ? Math.min(...cots.map(c => Number(c.valor_total))) : 0;
    const dias = Math.floor((hoje.getTime() - new Date(p.criado_em).getTime()) / 86400000);
    const diasAteNecessidade = p.necessidade
      ? Math.ceil((new Date(p.necessidade + 'T12:00:00').getTime() - hoje.getTime()) / 86400000) : null;
    // prazo de entrega da cotação mais rápida
    const prazos = cots.map(c => parseInt(String(c.prazo_entrega ?? '').replace(/\D/g, '')) || 0).filter(Boolean);
    const prazoMin = prazos.length ? Math.min(...prazos) : null;
    let conseq = 'Compra parada aguardando autorização escrita (Cl. 3.4.2).';
    if (diasAteNecessidade !== null && prazoMin) {
      const folga = diasAteNecessidade - prazoMin;
      conseq = folga < 0
        ? `⚠ Mesmo aprovando hoje, o material chega ${Math.abs(folga)} dia(s) DEPOIS da necessidade em obra. A etapa vinculada atrasa.`
        : `Folga de ${folga} dia(s): aprovando até ${new Date(Date.now() + folga * 86400000).toLocaleDateString('pt-BR')}, o material chega a tempo.`;
    }
    g.push({
      tipo: 'pedido', id: p.id, obra: obra?.codigo ?? '—', obraId: p.obra_id,
      titulo: `PM-${String(p.id).padStart(3, '0')} — ${p.titulo}`,
      valor: menor, dias, evento: p.evento_id,
      consequencia: conseq, impacto: menor, href: '/materiais',
      urgente: diasAteNecessidade !== null && prazoMin !== null && (diasAteNecessidade - prazoMin) < 7,
    });
  });

  return g.sort((a, b) => (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0) || b.impacto - a.impacto);
}

/* ---------- 5) ALERTAS PREDITIVOS ---------- */
export function gerarAlertas(margem: any, caixa: any, prazos: any[], desvios: any[], docs: any[], fvs: any[]) {
  const a: { nivel: Semaforo; titulo: string; texto: string; href?: string }[] = [];

  if (caixa.semanaFura) {
    a.push({
      nivel: caixa.semanasAteFurar <= 4 ? 'critico' : 'atencao',
      titulo: `Caixa fura em ${new Date(caixa.semanaFura.ini + 'T12:00:00').toLocaleDateString('pt-BR')}`,
      texto: `Projeção indica saldo de ${fmt(caixa.menor)} em ${caixa.semanasAteFurar} semana(s). Queima média: ${fmt(caixa.queima)}/semana. Antecipe recebíveis ou renegocie vencimentos.`,
      href: '/financeiro',
    });
  }

  // etapas consumindo orçamento acima do avanço
  desvios.filter(d => Number(d.valor_orcado) > 0 && Number(d.valor_comprado) > 0).forEach(d => {
    const cons = Number(d.valor_comprado) / Number(d.valor_orcado) * 100;
    if (cons > 100) {
      a.push({
        nivel: 'critico',
        titulo: `${d.etapa}: compra estourou o orçado em ${fmtPct(cons - 100)}`,
        texto: `Orçado ${fmt(Number(d.valor_orcado))} · comprado ${fmt(Number(d.valor_comprado))}. Desvio de ${fmt(Number(d.desvio_compra))} sai direto da margem.`,
        href: '/painel-ceo',
      });
    } else if (cons > 85) {
      a.push({
        nivel: 'atencao',
        titulo: `${d.etapa}: ${fmtPct(cons)} do orçamento consumido`,
        texto: `Restam ${fmt(Number(d.valor_orcado) - Number(d.valor_comprado))} para concluir a etapa. Verifique se o saldo cobre o que falta comprar.`,
        href: '/painel-ceo',
      });
    }
  });

  // obras atrasadas com projeção
  prazos.filter(p => p.semaforo !== 'ok').forEach(p => {
    a.push({
      nivel: p.semaforo,
      titulo: `${p.codigo}: avanço ${fmtPct(Math.abs(p.gap))} abaixo do planejado`,
      texto: p.atrasoProjetado && p.atrasoProjetado > 0
        ? `Mantido o ritmo atual, a entrega escorrega ~${p.atrasoProjetado} dia(s) além de ${new Date(p.entrega_final + 'T12:00:00').toLocaleDateString('pt-BR')}. Multa por atraso: 0,5%/dia (Cl. 8.1).`
        : `Real ${fmtPct(p.realPct)} × planejado ${fmtPct(p.planPct)}. Recupere o ritmo para não acionar a Cl. 8.1.`,
      href: '/visao',
    });
  });

  // documentos vencendo
  const hoje = new Date().toISOString().slice(0, 10);
  const vencidos = docs.filter(d => d.validade && d.validade < hoje);
  if (vencidos.length) {
    a.push({
      nivel: 'critico',
      titulo: `${vencidos.length} documento(s) vencido(s)`,
      texto: `${vencidos.slice(0, 2).map(d => d.titulo).join(', ')}${vencidos.length > 2 ? '…' : ''}. Documento irregular autoriza a contratante a suspender medições e reter pagamentos (Cl. 13.3).`,
      href: '/documentos',
    });
  }

  // qualidade
  const reprovadas = fvs.filter(f => f.resultado === 'reprovado');
  if (reprovadas.length) {
    a.push({
      nivel: 'atencao',
      titulo: `${reprovadas.length} inspeção(ões) reprovada(s)`,
      texto: 'Retrabalho não corrigido vira glosa na medição e pode comprometer o recebimento definitivo (Cl. 4.6.1).',
      href: '/qualidade',
    });
  }

  const ordem: Record<Semaforo, number> = { critico: 0, atencao: 1, ok: 2 };
  return a.sort((x, y) => ordem[x.nivel] - ordem[y.nivel]);
}

const fmt = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtPct = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
