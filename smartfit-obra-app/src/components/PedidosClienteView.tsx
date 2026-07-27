'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtData } from '@/lib/contrato';

const fmt = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const DECISAO_ROTULO: Record<string, { txt: string; cor: string }> = {
  aprovado: { txt: 'Você aprovou', cor: 'st-exec' },
  recusado: { txt: 'Você recusou', cor: 'st-risk' },
  ajuste:   { txt: 'Ajuste solicitado', cor: 'st-valid' },
};

export default function PedidosClienteView({ pedidos, decisoes }: { pedidos: any[]; decisoes: any[] }) {
  const supabase = supabaseBrowser();
  const [mapa, setMapa] = useState<Record<number, any>>(
    Object.fromEntries((decisoes ?? []).map(d => [d.pedido_id, d]))
  );
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [ajusteAberto, setAjusteAberto] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');

  async function decidir(pedidoId: number, decisao: string, texto?: string) {
    setOcupado(pedidoId);
    // upsert: unique(pedido_id) garante uma decisao por pedido; mudar de ideia
    // substitui a anterior.
    const { data, error } = await supabase.from('pedido_decisao_cliente')
      .upsert({ pedido_id: pedidoId, decisao, comentario: texto || null }, { onConflict: 'pedido_id' })
      .select().single();
    setOcupado(null);
    if (error) { alert('Não foi possível registrar: ' + error.message); return; }
    setMapa(m => ({ ...m, [pedidoId]: data }));
    setAjusteAberto(null);
    setComentario('');
  }

  if (!pedidos.length) {
    return (
      <>
        <section className="cock-hero">
          <div className="saud">Pedidos de faturamento direto</div>
          <div className="resumo">Materiais pagos diretamente ao fornecedor, para sua aprovação.</div>
        </section>
        <div className="panel"><div className="bd">
          <p className="hint">Nenhum pedido aguardando sua decisão no momento.</p>
        </div></div>
      </>
    );
  }

  return (
    <>
      <section className="cock-hero">
        <div className="saud">Pedidos de faturamento direto</div>
        <div className="resumo">Materiais pagos diretamente ao fornecedor. Aprove, recuse ou peça ajuste.</div>
      </section>

      {pedidos.map(p => {
        const d = mapa[p.id];
        const itens = Array.isArray(p.itens) ? p.itens : [];
        const decidido = !!d;
        return (
          <div className="panel" key={p.id}>
            <div className="hd">
              <h3>{p.titulo}</h3>
              {decidido && (
                <span className={`stamp ${DECISAO_ROTULO[d.decisao]?.cor ?? 'st-pend'}`}>
                  {DECISAO_ROTULO[d.decisao]?.txt ?? d.decisao}
                </span>
              )}
            </div>
            <div className="bd">
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                <div className="hint">
                  {p.etapa}
                  {p.fornecedor ? ` · ${p.fornecedor}` : ''}
                  {p.necessidade ? ` · necessário até ${fmtData(p.necessidade)}` : ''}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <b style={{ fontSize: 15 }}>{fmt(p.valor_faturado)}</b>
                  <div className="hint" style={{ fontSize: 10.5 }}>faturamento direto</div>
                </div>
              </div>

              {itens.length > 0 && (
                <div className="tblwrap" style={{ marginBottom: 12 }}>
                  <table>
                    <thead><tr><th>Item</th><th className="num">Qtd</th><th>Unid.</th></tr></thead>
                    <tbody>
                      {itens.map((it: any, i: number) => (
                        <tr key={i}>
                          <td>{it.descricao ?? '—'}</td>
                          <td className="num">{it.qtd ?? ''}</td>
                          <td>{it.unidade ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {decidido && d.comentario && (
                <p className="hint" style={{ marginBottom: 12 }}>Seu comentário: “{d.comentario}”</p>
              )}

              {/* Ações. Mesmo decidido, pode mudar de ideia enquanto voce nao agiu. */}
              {ajusteAberto === p.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea value={comentario} onChange={e => setComentario(e.target.value)}
                    placeholder="Descreva o ajuste que você precisa neste pedido…"
                    rows={3} style={{ width: '100%' }} />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="mini" onClick={() => { setAjusteAberto(null); setComentario(''); }}>Cancelar</button>
                    <button className="btn" disabled={ocupado === p.id || !comentario.trim()}
                      onClick={() => decidir(p.id, 'ajuste', comentario)}>Enviar pedido de ajuste</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" disabled={ocupado === p.id}
                    onClick={() => decidir(p.id, 'aprovado')}
                    style={{ background: 'var(--ok)', borderColor: 'var(--ok)' }}>
                    {d?.decisao === 'aprovado' ? '✓ Aprovado' : 'Aprovar'}
                  </button>
                  <button className="btn" disabled={ocupado === p.id}
                    onClick={() => { if (confirm('Recusar este faturamento direto?')) decidir(p.id, 'recusado'); }}>
                    Recusar
                  </button>
                  <button className="mini" disabled={ocupado === p.id}
                    onClick={() => { setAjusteAberto(p.id); setComentario(d?.decisao === 'ajuste' ? (d.comentario ?? '') : ''); }}>
                    Pedir ajuste
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
