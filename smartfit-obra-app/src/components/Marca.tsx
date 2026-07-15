/**
 * Marca Se73um.
 *
 * O símbolo é vetor puro (não imagem embutida): nítido de 16px a 1000px,
 * e as barras neutras usam currentColor — em fundo claro herdam preto,
 * em fundo escuro herdam branco. Um componente, dois temas.
 *
 * Geometria extraída do arquivo oficial da marca.
 */

type MarcaProps = {
  size?: number;
  /** Cor das barras neutras. Por padrão herda do contexto (currentColor). */
  neutra?: string;
  className?: string;
};

export function Simbolo({ size = 30, neutra, className }: MarcaProps) {
  const cinza = neutra ?? 'currentColor';
  return (
    <svg
      width={size} height={size * 1.326} viewBox="0 0 100 100"
      className={className} fill="none" aria-hidden="true"
    >
      {/* chevron: aponta para a esquerda, vértice alinhado à borda das barras */}
      <path
        d="M99.7 0 L0 21.74 L99.7 35.54 L99.7 25.5 L20.5 21.74 L99.7 7.51 Z"
        fill="var(--brand, #FD1843)"
      />
      {/* 2 barras neutras */}
      <rect x="0" y="35.65" width="100" height="7.73" fill={cinza} />
      <rect x="0" y="45.47" width="100" height="7.73" fill={cinza} />
      {/* 3 barras da marca */}
      <rect x="0" y="59.05" width="100" height="7.73" fill="var(--brand, #FD1843)" />
      <rect x="0" y="68.87" width="100" height="7.73" fill="var(--brand, #FD1843)" />
      <rect x="0" y="78.81" width="100" height="7.73" fill="var(--brand, #FD1843)" />
      {/* barra neutra isolada */}
      <rect x="0" y="92.38" width="100" height="7.73" fill={cinza} />
    </svg>
  );
}

/**
 * Versão compacta para espaços apertados (avatar do advisor, favicon):
 * só o chevron. Em 13px as barras viram um borrão — o chevron sozinho
 * continua legível e é o elemento mais reconhecível da marca.
 */
export function SimboloMini({ size = 14, cor }: { size?: number; cor?: string }) {
  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 100 72" fill="none" aria-hidden="true">
      <path
        d="M99.7 0 L0 43.5 L99.7 71.1 L99.7 51 L41 43.5 L99.7 15 Z"
        fill={cor ?? 'var(--brand, #FD1843)'}
      />
    </svg>
  );
}

/** Lockup horizontal: símbolo + nome. Sidebar e login. */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
      <Simbolo size={size} />
      <div>
        <div className="nm">Se<em>73</em>um</div>
        <div className="tg">Technology</div>
      </div>
    </div>
  );
}

/** Compatibilidade: o hexágono saiu; o nome segue usado em alguns pontos. */
export function HexMark({ size = 30, cor }: { size?: number; cor?: string }) {
  return <SimboloMini size={size} cor={cor} />;
}
