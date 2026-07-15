/* =====================================================================
   Motor de inteligência do cockpit.
   PRINCÍPIO: sem base estatística, não projeta. Diz "ainda não dá".
   Número inventado é pior que número ausente — o CEO decide em cima dele.
   ===================================================================== */
import { projetarCaixa } from './financeiro';

export type Semaforo = 'ok' | 'atencao' | 'critico' | 'neutro';

export const CORES: Record<string, string> = {
  ok: 'var(--ok)', atencao: 'var(--warn)', critico: 'var(--brand)', neutro: 'var(--gray)',
};

/** Projeção só é confiável com base mínima. */
const MIN_ETAPAS_COMPRADAS = 2;   // para projetar margem
const MIN_AVANCO_PCT = 8;         // para projetar prazo (abaixo disso o ritmo é ruído)

/* ---------- 1) MARGEM ---------- */
export function analisarMargem(obras: any[], desvios: any[]) {
  const medido = obras.reduce((s, o) => s + Number(o.medido || 0), 0);
  const comprado = obras.reduce((s, o) => s + Number(o.custo_comprado || 0), 0);
  const margem = medido - comprado;
  const margemPct = medido > 0 ? margem / medido * 100 : 0;

  const porObra = obras.map(o => {
    // CUSTO, não preço. O orçamento guarda os dois: valor_orcado tem BDI
    // embutido; custo_orcado é o custo puro. Margem se mede contra custo —
    // subtrair preço de preço produz margem falsa.
    const dObra = desvios.filter(d => d.obra_id === o.obra_id && Number(d.custo_orcado) > 0);
    const custoTotal = dObra.reduce((s, d) => s + Number(d.custo_orcado), 0);
    const precoTotal = dObra.reduce((s, d) => s + Number(d.valor_orcado || 0), 0);
    const orcadoTotal = custoTotal;   // compatibilidade com quem lê este campo
    const comCompra = dObra.filter(d => Number(d.valor_comprado) > 0);
    const compradoAte = dObra.reduce((s, d) => s + Number(d.valor_comprado || 0), 0);
    const bdiEfetivo = custoTotal > 0 ? (precoTotal / custoTotal - 1) * 100 : null;

    // margem de contrato: o que a proposta previa (valor global − CUSTO orçado)
    const margemContrato = Number(o.valor_global) - custoTotal;
    const margemContratoPct = Number(o.valor_global) > 0 ? margemContrato / Number(o.valor_global) * 100 : 0;

    const projetavel = comCompra.length >= MIN_ETAPAS_COMPRADAS;
    let fator: number | null = null;
    let custoProjetado: number | null = null;
    let margemProjetada: number | null = null;
    let margemProjPct: number | null = null;

    if (projetavel) {
      // fator ponderado pelo valor orçado das etapas já compradas (não média simples)
      const orcComCompra = comCompra.reduce((s, d) => s + Number(d.custo_orcado), 0);
      const cmpComCompra = comCompra.reduce((s, d) => s + Number(d.valor_comprado), 0);
      fator = orcComCompra > 0 ? cmpComCompra / orcComCompra : 1;
      // etapas não compradas seguem o orçado corrigido pelo fator observado
      const orcRestante = custoTotal - orcComCompra;
      custoProjetado = cmpComCompra + orcRestante * fator;
      margemProjetada = Number(o.valor_global) - custoProjetado;
      margemProjPct = Number(o.valor_global) > 0 ? margemProjetada / Number(o.valor_global) * 100 : 0;
    }

    const sangria = dObra
      .filter(d => Number(d.desvio_compra) > 0)
      .map(d => ({ etapa: d.etapa, desvio: Number(d.desvio_compra), pct: Number(d.desvio_pct) }))
      .sort((a, b) => b.desvio - a.desvio);

    return {
      ...o, orcadoTotal, custoTotal, precoTotal, bdiEfetivo, compradoAte, margemContrato, margemContratoPct,
      projetavel, fator, custoProjetado, margemProjetada, margemProjPct, sangria,
      etapasCompradas: comCompra.length, etapasTotal: dObra.length,
    };
  });

  const carteira = obras.reduce((s, o) => s + Number(o.valor_global || 0), 0);
  const orcadoCarteira = porObra.reduce((s, o) => s + o.orcadoTotal, 0);
  const margemContratoTotal = carteira - orcadoCarteira;
  const margemContratoPctTotal = carteira > 0 ? margemContratoTotal / carteira * 100 : 0;

  const projetaveis = porObra.filter(o => o.projetavel);
  const temProjecao = projetaveis.length > 0;
  const margemProjetadaTotal = temProjecao
    ? porObra.reduce((s, o) => s + (o.margemProjetada ?? o.margemContrato), 0) : null;
  const margemProjPctTotal = temProjecao && carteira > 0 ? (margemProjetadaTotal! / carteira) * 100 : null;

  return {
    medido, comprado, margem, margemPct, porObra, carteira, orcadoCarteira,
    margemContratoTotal, margemContratoPctTotal,
    temProjecao, margemProjetadaTotal, margemProjPctTotal,
  };
}

/* ---------- 2) CAIXA ---------- */
export function analisarCaixa(lancamentos: any[], saldo: number, saldoInformado: boolean) {
  const abertos = lancamentos.filter(l => ['previsto', 'confirmado'].includes(l.status));
  const proj = projetarCaixa(abertos, saldo, 26);
  const menor = proj.length ? Math.min(...proj.map(p => p.saldo)) : saldo;
  const iFura = proj.findIndex(p => p.saldo < 0);
  const semanaFura = iFura >= 0 ? proj[iFura] : null;
  const semanasAteFurar = iFura >= 0 ? iFura : null;

  const mov = proj.slice(0, 4);
  const temMovimento = mov.some(p => p.entra > 0 || p.sai > 0);
  const queima = temMovimento ? mov.reduce((s, p) => s + (p.sai - p.entra), 0) / 4 : null;

  const semaforo: Semaforo = !saldoInformado ? 'neutro'
    : semanasAteFurar === null ? 'ok'
    : semanasAteFurar <= 4 ? 'critico' : 'atencao';

  return { proj, menor, semanaFura, semanasAteFurar, queima, semaforo, saldoInformado, temMovimento };
}

/* ---------- 3) PRAZO ---------- */
export function analisarPrazo(obras: any[]) {
  const hoje = new Date();
  return obras.map(o => {
    const meses = (o.meses ?? []) as any[];
    const planAcum = meses.filter(m => m.id <= o.mes_atual).reduce((s, m) => s + Number(m.plan), 0);
    const planPct = Number(o.valor_global) > 0 ? planAcum / Number(o.valor_global) * 100 : 0;
    const realPct = Number(o.avanco_pct || 0);
    const gap = realPct - planPct;

    const entrega = o.entrega_final ? new Date(o.entrega_final + 'T12:00:00') : null;
    const diasRestantes = entrega ? Math.ceil((entrega.getTime() - hoje.getTime()) / 86400000) : 0;

    // Só projeta com avanço mínimo — abaixo disso o ritmo é ruído estatístico.
    const projetavel = realPct >= MIN_AVANCO_PCT && o.mes_atual > 0;
    let atrasoProjetado: number | null = null;
    let dataProjetada: Date | null = null;
    if (projetavel) {
      const ritmoMes = realPct / o.mes_atual;             // % por mês
      const mesesFalta = (100 - realPct) / ritmoMes;
      const diasFalta = mesesFalta * 30.4;
      dataProjetada = new Date(hoje.getTime() + diasFalta * 86400000);
      atrasoProjetado = entrega ? Math.round((dataProjetada.getTime() - entrega.getTime()) / 86400000) : null;
    }

    // Semáforo pelo gap (dado firme), não pela projeção
    const semaforo: Semaforo = gap < -10 ? 'critico' : gap < -3 ? 'atencao' : 'ok';
    return { ...o, planPct, realPct, gap, diasRestantes, projetavel, atrasoProjetado, dataProjetada, semaforo };
  });
}

/* ---------- 4) GARGALOS ---------- */
export function analisarGargalos(eventos: any[], pedidos: any[], cotacoes: any[], obras: any[]) {
  const hoje = new Date();
  const g: any[] = [];

  eventos.filter(e => e.status === 'validacao').forEach(e => {
    const obra = obras.find(o => o.obra_id === e.obra_id);
    const dias = e.atualizado_em ? Math.floor((hoje.getTime() - new Date(e.atualizado_em).getTime()) / 86400000) : 0;
    const liq = Number(e.valor_bruto) * 0.9;
    g.push({
      tipo: 'medicao', id: e.id, obra: obra?.codigo ?? '—', obraId: e.obra_id,
      titulo: `Medição ${e.id} — ${e.etapa}`, valor: liq, dias, impacto: liq, href: '/cronograma',
      urgente: dias > 7,
      consequencia: dias > 7
        ? `Prazo de análise da Cl. 3.4.6 (7 dias úteis) vencido há ${dias - 7} dia(s). A contratada pode alegar mora e suspender serviços (Cl. 5.8).`
        : `Restam ${Math.max(0, 7 - dias)} dia(s) do prazo de análise (Cl. 3.4.6).`,
    });
  });

  pedidos.filter(p => p.status === 'enviado').forEach(p => {
    const obra = obras.find(o => o.obra_id === p.obra_id);
    const cots = cotacoes.filter(c => c.pedido_id === p.id);
    const menor = cots.length ? Math.min(...cots.map(c => Number(c.valor_total))) : 0;
    const dias = Math.floor((hoje.getTime() - new Date(p.criado_em).getTime()) / 86400000);
    const diasAteNec = p.necessidade
      ? Math.ceil((new Date(p.necessidade + 'T12:00:00').getTime() - hoje.getTime()) / 86400000) : null;
    const prazos = cots.map(c => parseInt(String(c.prazo_entrega ?? '').replace(/\D/g, '')) || 0).filter(Boolean);
    const prazoMin = prazos.length ? Math.min(...prazos) : null;

    let conseq = 'Compra parada aguardando autorização escrita (Cl. 3.4.2).';
    let urgente = false;
    if (diasAteNec !== null && prazoMin !== null) {
      const folga = diasAteNec - prazoMin;
      urgente = folga < 7;
      conseq = folga < 0
        ? `⚠ Mesmo aprovando hoje, o material chega ${Math.abs(folga)} dia(s) DEPOIS da necessidade em obra — a etapa vinculada atrasa.`
        : `Folga de ${folga} dia(s): decidindo até ${new Date(Date.now() + folga * 86400000).toLocaleDateString('pt-BR')}, o material chega a tempo (menor prazo: ${prazoMin} dias).`;
    }
    g.push({
      tipo: 'pedido', id: p.id, obra: obra?.codigo ?? '—', obraId: p.obra_id,
      titulo: `PM-${String(p.id).padStart(3, '0')} — ${p.titulo}`,
      valor: menor, dias, evento: p.evento_id, consequencia: conseq, impacto: menor,
      href: '/materiais', urgente,
    });
  });

  return g.sort((a, b) => (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0) || b.impacto - a.impacto);
}

/* ---------- 5) ALERTAS ---------- */
export function gerarAlertas(margem: any, caixa: any, prazos: any[], desvios: any[], docs: any[], fvs: any[], gargalos: any[]) {
  const a: { nivel: Semaforo; titulo: string; texto: string; href?: string }[] = [];

  if (caixa.saldoInformado && caixa.semanaFura) {
    a.push({
      nivel: caixa.semanasAteFurar <= 4 ? 'critico' : 'atencao',
      titulo: `Caixa fura na semana de ${new Date(caixa.semanaFura.ini + 'T12:00:00').toLocaleDateString('pt-BR')}`,
      texto: `Saldo projetado chega a ${fmt(caixa.menor)} em ${caixa.semanasAteFurar} semana(s). Antecipe recebíveis, renegocie vencimentos ou reprograme compras.`,
      href: '/financeiro',
    });
  }

  desvios.filter(d => Number(d.valor_orcado) > 0 && Number(d.valor_comprado) > 0).forEach(d => {
    const cons = Number(d.valor_comprado) / Number(d.valor_orcado) * 100;
    if (cons > 100) {
      a.push({ nivel: 'critico',
        titulo: `${d.etapa}: compra estourou o orçado em ${fmtPct(cons - 100)}`,
        texto: `Orçado ${fmt(Number(d.valor_orcado))} · comprado ${fmt(Number(d.valor_comprado))}. Os ${fmt(Number(d.desvio_compra))} de desvio saem direto da margem.`,
        href: '/painel-ceo' });
    } else if (cons > 85) {
      a.push({ nivel: 'atencao',
        titulo: `${d.etapa}: ${fmtPct(cons)} do orçamento consumido`,
        texto: `Restam ${fmt(Number(d.valor_orcado) - Number(d.valor_comprado))} para concluir a etapa.`,
        href: '/painel-ceo' });
    }
  });

  prazos.filter(p => p.semaforo !== 'ok').forEach(p => {
    a.push({ nivel: p.semaforo,
      titulo: `${p.codigo}: avanço ${fmtPct(Math.abs(p.gap))} abaixo do planejado`,
      texto: p.projetavel && p.atrasoProjetado && p.atrasoProjetado > 0
        ? `Real ${fmtPct(p.realPct)} × planejado ${fmtPct(p.planPct)}. Mantido o ritmo, a entrega escorrega ~${p.atrasoProjetado} dia(s). Multa: 0,5%/dia, teto 10% (Cl. 8.1).`
        : `Real ${fmtPct(p.realPct)} × planejado ${fmtPct(p.planPct)}. Recupere o ritmo antes que acione a Cl. 8.1.`,
      href: '/visao' });
  });

  const hoje = new Date().toISOString().slice(0, 10);
  const vencidos = docs.filter(d => d.validade && d.validade < hoje);
  if (vencidos.length) {
    a.push({ nivel: 'critico', titulo: `${vencidos.length} documento(s) vencido(s)`,
      texto: `${vencidos.slice(0, 2).map(d => d.titulo).join(', ')}${vencidos.length > 2 ? '…' : ''}. Documento irregular autoriza suspender medições e reter pagamentos (Cl. 13.3).`,
      href: '/documentos' });
  }

  const atrasadas = gargalos.filter((g: any) => g.tipo === 'medicao' && g.dias > 7);
  if (atrasadas.length) {
    a.push({ nivel: 'critico', titulo: `${atrasadas.length} medição(ões) com prazo de análise vencido`,
      texto: `A Cl. 3.4.6 dá 7 dias úteis para análise. Atraso na validação trava o caixa da contratada e enfraquece sua posição em eventual glosa.`,
      href: '/cronograma' });
  }

  const reprovadas = fvs.filter(f => f.resultado === 'reprovado');
  if (reprovadas.length) {
    a.push({ nivel: 'atencao', titulo: `${reprovadas.length} inspeção(ões) reprovada(s)`,
      texto: 'Retrabalho não corrigido vira glosa na medição e pode travar o recebimento definitivo (Cl. 4.6.1).',
      href: '/qualidade' });
  }

  const ordem: Record<string, number> = { critico: 0, atencao: 1, ok: 2, neutro: 3 };
  return a.sort((x, y) => ordem[x.nivel] - ordem[y.nivel]);
}

/* ---------- 6) ÍNDICE DE SAÚDE (só com dado firme) ---------- */
export function calcularSaude(margem: any, caixa: any, prazos: any[], alertas: any[]) {
  const dims: { nome: string; nota: number; peso: number; base: string }[] = [];

  // Margem: usa a projetada se houver; senão a de contrato (dado firme da proposta)
  const mPct = margem.temProjecao ? margem.margemProjPctTotal : margem.margemContratoPctTotal;
  dims.push({
    nome: 'Margem',
    nota: mPct >= 15 ? 100 : mPct >= 10 ? 75 : mPct >= 5 ? 50 : mPct >= 0 ? 25 : 0,
    peso: 3,
    base: margem.temProjecao ? 'projeção pelas compras' : 'orçamento da proposta',
  });

  // Caixa: só entra se o saldo foi informado
  if (caixa.saldoInformado) {
    dims.push({
      nome: 'Caixa',
      nota: caixa.semanasAteFurar === null ? 100 : caixa.semanasAteFurar > 12 ? 70 : caixa.semanasAteFurar > 4 ? 40 : 0,
      peso: 3, base: 'projeção de 26 semanas',
    });
  }

  // Prazo: gap é dado firme
  if (prazos.length) {
    const notaPrazo = prazos.reduce((s, p) => s + (p.gap >= -3 ? 100 : p.gap >= -10 ? 60 : 20), 0) / prazos.length;
    dims.push({ nome: 'Prazo', nota: notaPrazo, peso: 2, base: 'avanço real × planejado' });
  }

  // Conformidade
  const criticos = alertas.filter((a: any) => a.nivel === 'critico').length;
  dims.push({ nome: 'Conformidade', nota: Math.max(0, 100 - criticos * 25), peso: 1, base: 'alertas críticos abertos' });

  const somaPeso = dims.reduce((s, d) => s + d.peso, 0);
  const nota = Math.round(dims.reduce((s, d) => s + d.nota * d.peso, 0) / somaPeso);
  const completo = caixa.saldoInformado && margem.temProjecao;
  return { nota, dims, completo };
}

const fmt = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtPct = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
