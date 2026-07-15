export function HexMark({ size = 30, cor = '#FD1843' }: { size?: number; cor?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path d="M50 6 90 28v44L50 94 10 72V28L50 6z" stroke={cor} strokeWidth="9" strokeLinejoin="round" />
      <path d="M64 36 40 50l24 14" stroke={cor} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M36 64 60 50 36 36" stroke={cor} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" opacity=".55" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
      <HexMark size={size} />
      <div>
        <div className="nm">Se<em>73</em>um</div>
        <div className="tg">Technology</div>
      </div>
    </div>
  );
}
