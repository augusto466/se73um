'use client';

// Gantt simples: uma barra por etapa, posicionada na escala de tempo comum.
// Le so de evento_cliente (sem custo/glosa). Cor por status.

const COR_STATUS: Record<string, string> = {
  aprovado: 'var(--ok)',
  glosado: 'var(--ok)',
  execucao: 'var(--warn)',
  validacao: 'var(--warn)',
  pendente: 'var(--gray)',
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function diasEntre(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export default function GanttCliente({ eventos }: { eventos: any[] }) {
  // so eventos com data
  const comData = eventos
    .map(e => ({
      ...e,
      ini: e.prev_inicio ?? e.base_inicio,
      fim: e.prev_fim ?? e.base_fim,
    }))
    .filter(e => e.ini && e.fim)
    .sort((a, b) => a.ini.localeCompare(b.ini));

  if (!comData.length) {
    return <p className="hint" style={{ padding: 14 }}>O cronograma ainda não foi definido.</p>;
  }

  const inicio = new Date(comData[0].ini + 'T12:00:00');
  const fim = new Date(comData.reduce((max, e) => e.fim > max ? e.fim : max, comData[0].fim) + 'T12:00:00');
  const spanTotal = Math.max(1, diasEntre(inicio, fim));

  // marcas de mes para o cabecalho
  const marcasMes: { label: string; pct: number }[] = [];
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  while (cursor <= fim) {
    const pct = Math.max(0, diasEntre(inicio, cursor) / spanTotal * 100);
    marcasMes.push({ label: `${MESES[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`, pct });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const hojePct = (() => {
    const h = new Date();
    if (h < inicio || h > fim) return null;
    return diasEntre(inicio, h) / spanTotal * 100;
  })();

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 640 }}>
        {/* cabecalho de meses */}
        <div style={{ position: 'relative', height: 22, marginLeft: 200, borderBottom: '1px solid var(--line)' }}>
          {marcasMes.map((m, i) => (
            <span key={i} className="hint" style={{ position: 'absolute', left: `${m.pct}%`, fontSize: 10.5, transform: 'translateX(2px)' }}>
              {m.label}
            </span>
          ))}
        </div>

        {/* linhas do gantt */}
        <div style={{ position: 'relative' }}>
          {hojePct !== null && (
            <div style={{ position: 'absolute', left: `calc(200px + ${hojePct}% * (100% - 200px) / 100)`,
              top: 0, bottom: 0, width: 1, background: 'var(--brand)', zIndex: 2, opacity: 0.6 }} title="hoje" />
          )}
          {comData.map((e, k) => {
            const bi = new Date(e.ini + 'T12:00:00');
            const bf = new Date(e.fim + 'T12:00:00');
            const left = diasEntre(inicio, bi) / spanTotal * 100;
            const width = Math.max(1.5, diasEntre(bi, bf) / spanTotal * 100);
            const cor = COR_STATUS[e.status] ?? 'var(--gray)';
            return (
              <div key={`${e.id}-${k}`} style={{ display: 'flex', alignItems: 'center', height: 30, borderBottom: '1px solid var(--line)' }}>
                <div style={{ width: 200, flexShrink: 0, fontSize: 11.5, paddingRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={e.etapa}>
                  {e.critico && <span style={{ color: 'var(--brand)', marginRight: 3 }}>▲</span>}
                  {e.etapa}
                </div>
                <div style={{ flex: 1, position: 'relative', height: '100%' }}>
                  <div style={{
                    position: 'absolute', left: `${left}%`, width: `${width}%`,
                    top: 7, height: 16, background: cor, borderRadius: 4, opacity: 0.85,
                  }} title={`${e.etapa}: ${e.ini} a ${e.fim}`} />
                </div>
              </div>
            );
          })}
        </div>

        {/* legenda */}
        <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
          {[['Aprovado', 'var(--ok)'], ['Em andamento', 'var(--warn)'], ['A iniciar', 'var(--gray)']].map(([txt, cor]) => (
            <span key={txt} className="hint" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <span style={{ width: 12, height: 12, background: cor, borderRadius: 3, display: 'inline-block' }} /> {txt}
            </span>
          ))}
          <span className="hint" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            <span style={{ color: 'var(--brand)' }}>▲</span> caminho crítico
          </span>
        </div>
      </div>
    </div>
  );
}
