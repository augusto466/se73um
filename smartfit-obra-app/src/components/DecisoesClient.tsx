'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtBRL, fmtData, numeroPedido, DECISAO_CLIENTE_LABEL } from '@/lib/contrato';
import { decidirPedido, registrarCompraPedido } from '@/lib/pedidosMateriais';
import { mudarStatusEvento, aprovarComGlosa as aprovarComGlosaAcao } from '@/lib/eventos';

export default function DecisoesClient({
  pedidosIniciais, cotacoesIniciais, medicoesIniciais, pedidosAprovadosIniciais, decisoesClienteIniciais, obras, papel,
}: {
  pedidosIniciais: any[]; cotacoesIniciais: any[]; medicoesIniciais: any[];
  pedidosAprovadosIniciais: any[]; decisoesClienteIniciais: any[]; obras: any[]; papel: string;
}) {
  const [pedidos, setPedidos] = useState(pedidosIniciais);
  const [cotacoes] = useState(cotacoesIniciais);
  const [medicoes, setMedicoes] = useState(medicoesIniciais);
  const [pedidosAprovados, setPedidosAprovados] = useState(pedidosAprovadosIniciais);
  const [decisoesCliente] = useState(decisoesClienteIniciais);
  const [ocupado, setOcupado] = useState(false);
  const supabase = supabaseBrowser();
  const hoje = new Date().toISOString().slice(0, 10);

  const obraCod = (id: number | null) => id ? (obras.find(o => o.id === id)?.codigo ?? '—') : '—';
  const cotsDe = (pid: number) => cotacoes.filter(c => c.pedido_id === pid);
  const decisaoDe = (pid: number) => decisoesCliente.find(d => d.pedido_id === pid);
  const decisoesPendentes = pedidosAprovados.filter(p => decisaoDe(p.id));

  // Reusa os mesmos handlers de MateriaisClient.tsx/EventosClient.tsx
  // (src/lib/pedidosMateriais.ts, src/lib/eventos.ts) — só o estado local
  // (qual lista o item sai) muda de um componente para o outro.

  async function decidir(p: any, status: 'aprovado' | 'recusado', cotacaoId?: number) {
    setOcupado(true);
    const patch = await decidirPedido(supabase, p.obra_id, p, status, cotacaoId);
    setOcupado(false);
    if (patch) setPedidos(ps => ps.filter(x => x.id !== p.id));
  }

  async function registrarCompra(p: any) {
    setOcupado(true);
    const patch = await registrarCompraPedido(supabase, p.obra_id, p);
    setOcupado(false);
    if (patch) setPedidosAprovados(ps => ps.filter(x => x.id !== p.id));
  }

  async function aprovar(ev: any) {
    setOcupado(true);
    const patch = await mudarStatusEvento(supabase, { id: ev.obra_id }, papel, ev, 'aprovado');
    setOcupado(false);
    if (patch) setMedicoes(evs => evs.filter(x => x.id !== ev.id));
  }

  async function ajustar(ev: any) {
    setOcupado(true);
    const patch = await aprovarComGlosaAcao(supabase, { id: ev.obra_id }, papel, ev);
    setOcupado(false);
    if (patch) setMedicoes(evs => evs.filter(x => x.id !== ev.id));
  }

  const nada = pedidos.length === 0 && medicoes.length === 0 && decisoesPendentes.length === 0;

  return (
    <>
      <h2 className="sec">Compras a aprovar · {pedidos.length}</h2>
      <div className="panel">
        {pedidos.length === 0 && <div className="bd"><p className="hint">Nenhum pedido aguardando aprovação.</p></div>}
        {[...pedidos].sort((a, b) => (a.vencimento ?? '9').localeCompare(b.vencimento ?? '9')).map(p => {
          const pc = cotsDe(p.id);
          const menor = pc.length ? Math.min(...pc.map((c: any) => Number(c.valor_total))) : 0;
          const vencido = p.vencimento && p.vencimento < hoje;
          return (
            <div key={p.id} className={`dia-item ${vencido ? 'critico' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{numeroPedido(p.id)} — {p.titulo}</div>
                  <div className="hint">
                    {obraCod(p.obra_id)} · {p.situacao ?? 'aguardando aprovação'}
                    {p.vencimento ? ` · ${vencido ? '⚠ venceu em ' : 'necessidade em '}${fmtData(p.vencimento)}` : ''}
                  </div>
                </div>
                <span className="hint">{pc.length} cotação(ões){menor ? ` · menor ${fmtBRL(menor)}` : ''}</span>
              </div>
              {pc.length > 0 && (
                <div className="tblwrap"><table>
                  <thead><tr><th>Fornecedor</th><th className="num">Valor</th><th>Prazo</th><th></th></tr></thead>
                  <tbody>
                    {pc.map((c: any) => (
                      <tr key={c.id}>
                        <td>{c.fornecedor}{Number(c.valor_total) === menor ? ' ★' : ''}</td>
                        <td className="num">{fmtBRL(Number(c.valor_total))}</td>
                        <td>{c.prazo_entrega ?? '—'}</td>
                        <td><button className="mini" disabled={ocupado} onClick={() => decidir(p, 'aprovado', c.id)}>✓ escolher</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="mini danger" disabled={ocupado} onClick={() => decidir(p, 'recusado')}>✕ Recusar pedido</button>
                <Link href="/materiais" className="mini" style={{ textDecoration: 'none' }}>abrir em Materiais →</Link>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="sec">Medições em validação · {medicoes.length}</h2>
      <div className="panel">
        {medicoes.length === 0 && <div className="bd"><p className="hint">Nenhuma medição em validação.</p></div>}
        {[...medicoes].sort((a, b) => (a.vencimento ?? '9').localeCompare(b.vencimento ?? '9')).map(ev => {
          const vencido = ev.vencimento && ev.vencimento < hoje;
          return (
            <div key={ev.id} className={`dia-item ${vencido ? 'critico' : ''}`}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{ev.id} — {ev.etapa}</div>
                <div className="hint">
                  {obraCod(ev.obra_id)} · {ev.situacao ?? 'aguardando fiscalização'}
                  {ev.valor ? ` · ${fmtBRL(Number(ev.valor))}` : ''}
                  {ev.vencimento ? ` · ${vencido ? '⚠ ' : ''}${fmtData(ev.vencimento)}` : ''}
                </div>
              </div>
              <button className="mini" disabled={ocupado} onClick={() => aprovar(ev)}>✓ Aprovar</button>
              <button className="mini danger" disabled={ocupado} onClick={() => ajustar(ev)}>Aprovar com ajuste (glosa)</button>
              <Link href="/cronograma" className="mini" style={{ textDecoration: 'none' }}>abrir →</Link>
            </div>
          );
        })}
      </div>

      <h2 className="sec">Decisões do cliente · {decisoesPendentes.length}</h2>
      <div className="panel">
        {decisoesPendentes.length === 0 && <div className="bd"><p className="hint">Nenhuma decisão do cliente pendente de ação.</p></div>}
        {decisoesPendentes.map(p => {
          const dc = decisaoDe(p.id)!;
          const label = DECISAO_CLIENTE_LABEL[dc.decisao];
          return (
            <div key={p.id} className="dia-item">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{numeroPedido(p.id)} — {p.titulo}</div>
                <div className="hint">{obraCod(p.obra_id)}{dc.comentario ? ` · "${dc.comentario}"` : ''}</div>
              </div>
              {label && <span className={`stamp ${label[1]}`}>{label[0]}</span>}
              {dc.decisao === 'aprovado'
                ? <button className="btn sec" disabled={ocupado} onClick={() => registrarCompra(p)}>Registrar compra</button>
                : <Link href="/materiais" className="mini" style={{ textDecoration: 'none' }}>resolver em Materiais →</Link>}
            </div>
          );
        })}
      </div>

      {nada && (
        <div className="panel"><div className="bd"><p className="hint">Nada aguardando decisão. Tudo em dia.</p></div></div>
      )}
    </>
  );
}
