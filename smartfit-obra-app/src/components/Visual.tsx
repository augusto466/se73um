/**
 * Componentes visuais do redesign.
 *
 * Todos usam os tokens do globals.css — nenhuma cor fixa aqui. Trocar o tema
 * é trocar as variáveis, não caçar hex pelos componentes.
 */

/** Anel de progresso. O valor é o próprio traço do SVG — sem lib. */
export function Anel({ pct, rotulo, size = 96, cor }:
  { pct: number; rotulo?: string; size?: number; cor?: string }) {
  const r = size / 2 - 7;
  const circ = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle className="trilha" cx={size / 2} cy={size / 2} r={r} />
        <circle className="valor" cx={size / 2} cy={size / 2} r={r}
          strokeDasharray={`${circ * v / 100} ${circ}`}
          style={cor ? { stroke: cor } : undefined} />
      </svg>
      <div className="txt">
        <b>{Math.round(v)}%</b>
        {rotulo && <span>{rotulo}</span>}
      </div>
    </div>
  );
}

/** Barra de conformidade. */
export function Conformidade({ linhas }:
  { linhas: { nome: string; pct: number; cor?: string; sufixo?: string }[] }) {
  return (
    <div className="conf">
      {linhas.map(l => (
        <div key={l.nome} className="conf-l">
          <span className="nm">{l.nome}</span>
          <span className="br"><i style={{ width: `${Math.max(0, Math.min(100, l.pct))}%`, background: l.cor ?? 'var(--brand)' }} /></span>
          <span className="vl">{Math.round(l.pct)}% {l.sufixo ?? ''}</span>
        </div>
      ))}
    </div>
  );
}

/** Célula de métrica — o "resumo hoje". */
export function Metricas({ itens }:
  { itens: { n: string | number; label: string; sub?: string; risco?: boolean }[] }) {
  return (
    <div className="mrow">
      {itens.map((i, k) => (
        <div key={k} className="mcell">
          <div className="n" style={i.risco ? { color: 'var(--brand)' } : undefined}>{i.n}</div>
          <div className="l">{i.label}</div>
          {i.sub && <div className="s">{i.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/** Linha do tempo com marcos. */
export function LinhaTempo({ marcos, atual }:
  { marcos: string[]; atual?: number }) {
  if (!marcos.length) return null;
  return (
    <div className="tl">
      <div className="tl-eixo">
        {marcos.map((m, i) => <span key={i} className={i === atual ? 'on' : ''}>{m}</span>)}
      </div>
      <div className="tl-bar">
        {marcos.map((_, i) => (
          <i key={i} className={i === atual ? 'on' : ''}
            style={{ left: `${(i + 0.5) / marcos.length * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

/** Sparkline. Recebe os valores e desenha — sem eixo, sem grade: é tendência, não gráfico. */
export function Spark({ valores, altura = 64 }: { valores: number[]; altura?: number }) {
  if (valores.length < 2) return null;
  const max = Math.max(...valores), min = Math.min(...valores);
  const amp = max - min || 1;
  const W = 300, H = altura;
  const px = (i: number) => (i / (valores.length - 1)) * W;
  const py = (v: number) => H - 6 - ((v - min) / amp) * (H - 16);
  const linha = valores.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const area = `${linha} L${W},${H} L0,${H} Z`;
  const ult = valores.length - 1;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkgrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity=".22" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="area" d={area} />
      <path className="linha" d={linha} vectorEffect="non-scaling-stroke" />
      <circle className="pt" cx={px(ult)} cy={py(valores[ult])} r="3" />
    </svg>
  );
}

/** Badge de tipo do item (Meu Dia). */
export function Tipo({ tipo }: { tipo: string }) {
  const map: Record<string, string> = {
    tarefa: 'tp-tarefa', rotina: 'tp-rotina', medicao: 'tp-medicao',
    fvs: 'tp-fvs', evento: 'tp-medicao', documento: 'tp-fvs',
  };
  return <span className={`tp ${map[tipo] ?? 'tp-tarefa'}`}>{tipo}</span>;
}
