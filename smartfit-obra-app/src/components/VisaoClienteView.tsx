'use client';
import { Anel } from './Visual';
import { fmtData } from '@/lib/contrato';

const fmt = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_ROTULO: Record<string, { txt: string; cor: string }> = {
  aprovado:  { txt: 'Aprovado',        cor: 'st-exec' },
  glosado:   { txt: 'Aprovado',        cor: 'st-exec' },   // cliente ve como aprovado; glosa e interna
  validacao: { txt: 'Em análise',      cor: 'st-valid' },
  execucao:  { txt: 'Em execução',     cor: 'st-valid' },
  pendente:  { txt: 'A iniciar',       cor: 'st-pend' },
};

export default function VisaoClienteView({ obra, eventos }: { obra: any; eventos: any[] }) {
  if (!obra) {
    return (
      <div className="panel"><div className="bd">
        <p className="hint">Nenhuma obra disponível para acompanhamento no momento.</p>
      </div></div>
    );
  }

  const medido = Number(obra.medido || 0);
  const global = Number(obra.valor_global || 0);
  const avanco = Math.round(Number(obra.avanco_pct || 0));

  // "Aprovado" para o cliente = aprovado OU glosado (a glosa e ajuste interno).
  const aprovados = eventos.filter(e => ['aprovado', 'glosado'].includes(e.status));
  const totalAprovado = aprovados.reduce((s, e) => s + Number(e.valor_bruto || 0), 0);

  const diasEntrega = obra.entrega_final
    ? Math.ceil((new Date(obra.entrega_final + 'T12:00:00').getTime() - Date.now()) / 86400000)
    : null;

  return (
    <>
      <section className="cock-hero">
        <div className="saud">{obra.nome}</div>
        <div className="resumo">
          {obra.codigo} · Acompanhamento da obra
          {diasEntrega !== null && diasEntrega > 0 && <> · entrega prevista em {diasEntrega} dias</>}
        </div>
        <div className="cock-strip">
          <div className="it"><div className="n">{avanco}%</div><div className="l">Avanço físico</div></div>
          <div className="it"><div className="n">{fmt(global)}</div><div className="l">Valor do contrato</div></div>
          <div className="it"><div className="n">{aprovados.length}</div><div className="l">Etapas aprovadas</div></div>
          <div className="it"><div className="n">{obra.entrega_final ? fmtData(obra.entrega_final) : '—'}</div><div className="l">Entrega prevista</div></div>
        </div>
      </section>

      <div className="panel">
        <div className="hd"><h3>Andamento geral</h3></div>
        <div className="bd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 26, flexWrap: 'wrap' }}>
            <Anel pct={avanco} rotulo="executado" />
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="hint">Medido e aprovado</span>
                <b>{fmt(totalAprovado)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="hint">Valor do contrato</span>
                <b>{fmt(global)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span className="hint">Saldo a executar</span>
                <b>{fmt(global - totalAprovado)}</b>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="hd"><h3>Etapas da obra</h3></div>
        <div className="bd" style={{ padding: 0 }}>
          {eventos.map((e, k) => {
            const st = STATUS_ROTULO[e.status] ?? { txt: e.status, cor: 'st-pend' };
            const ini = e.prev_inicio ?? e.base_inicio;
            const fim = e.prev_fim ?? e.base_fim;
            return (
              <div key={`${e.id}-${k}`} className="dia-item">
                <span className={`stamp ${st.cor}`} style={{ minWidth: 92, justifyContent: 'center' }}>{st.txt}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{e.etapa}</div>
                  <div className="hint">
                    {e.descricao ?? ''}
                    {ini && fim ? ` · ${fmtData(ini)} a ${fmtData(fim)}` : ''}
                    {e.critico ? ' · caminho crítico' : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 110 }}>
                  <b style={{ fontSize: 13 }}>{fmt(e.valor_bruto)}</b>
                </div>
              </div>
            );
          })}
          {!eventos.length && <p className="hint" style={{ padding: 14 }}>As etapas ainda não foram cadastradas.</p>}
        </div>
      </div>
    </>
  );
}
