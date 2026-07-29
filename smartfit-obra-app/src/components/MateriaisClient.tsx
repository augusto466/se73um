'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { PEDIDO_STATUS, DECISAO_CLIENTE_LABEL, fmtBRL, fmtData, numeroPedido } from '@/lib/contrato';
import { decidirPedido, registrarCompraPedido } from '@/lib/pedidosMateriais';
import Anexos from './Anexos';

type Item = { descricao: string; unidade: string; qtd: string };
type Cot = { fornecedor: string; cnpj: string; valor_total: string; prazo_entrega: string; condicoes_pagamento: string; frete: string; observacoes: string };

const itemVazio = (): Item => ({ descricao: '', unidade: 'un', qtd: '' });
const cotVazia = (): Cot => ({ fornecedor: '', cnpj: '', valor_total: '', prazo_entrega: '', condicoes_pagamento: '', frete: '', observacoes: '' });
const num = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0;

export default function MateriaisClient({
  pedidosIniciais, cotacoesIniciais, eventos, papel, obraId, decisoesCliente = [],
  recebimentosIniciais = [], recebimentoItensIniciais = [], pessoas = [],
}: {
  pedidosIniciais: any[]; cotacoesIniciais: any[]; eventos: any[]; papel: string; obraId: number; decisoesCliente?: any[];
  recebimentosIniciais?: any[]; recebimentoItensIniciais?: any[]; pessoas?: any[];
}) {

  const [pedidos, setPedidos] = useState(pedidosIniciais);
  // Decisao do cliente por pedido, para mostrar o selo na coluna de status.
  const decisaoDe = (pid: number) => decisoesCliente.find(d => d.pedido_id === pid);
  const [cots, setCots] = useState(cotacoesIniciais);
  const [aberto, setAberto] = useState<number | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [recebimentos, setRecebimentos] = useState(recebimentosIniciais);
  const [recebimentoItens] = useState(recebimentoItensIniciais);
  const supabase = supabaseBrowser();
  const podeDecidir = papel === 'contratante' || papel === 'admin';

  const pessoaNome = (id: string | null) => id ? (pessoas.find(p => p.id === id)?.nome ?? '—') : '—';
  const recebimentosDe = (pid: number) => recebimentos.filter(r => r.pedido_id === pid);
  const itensDe = (recebimentoId: number) => recebimentoItens.filter((i: any) => i.recebimento_id === recebimentoId);

  // Espelha public.pedido_tem_divergencia() (supabase/migracao-recebimento.sql)
  // só para exibir o selo aqui — a trava de verdade é o trigger no banco,
  // isto é só leitura para não precisar de uma chamada RPC por pedido na lista.
  function temDivergencia(p: any) {
    const regs = recebimentosDe(p.id).filter(r => r.status === 'registrado');
    const todosItens = regs.flatMap(r => itensDe(r.id));
    if (todosItens.some((i: any) => Number(i.qtd_recusada) > 0)) return true;
    const temFinal = regs.some(r => r.final_do_pedido);
    if (!temFinal) return false;
    const porIdx = new Map<number, number>();
    for (const i of todosItens) porIdx.set(i.pedido_item_idx, (porIdx.get(i.pedido_item_idx) ?? 0) + Number(i.qtd_recebida));
    return (p.itens ?? []).some((it: any, idx: number) => (porIdx.get(idx) ?? 0) !== Number(it.qtd));
  }

  async function marcarRecebimento(r: any, status: 'resolvido' | 'cancelado') {
    setOcupado(true);
    const { error } = await supabase.from('recebimento').update({ status }).eq('id', r.id);
    setOcupado(false);
    if (error) { alert(error.message); return; }
    setRecebimentos(rs => rs.map(x => x.id === r.id ? { ...x, status } : x));
  }

  const [form, setForm] = useState({ titulo: '', evento_id: '', necessidade: '', justificativa: '' });
  const [itens, setItens] = useState<Item[]>([itemVazio()]);
  const [novasCots, setNovasCots] = useState<Cot[]>([cotVazia(), cotVazia(), cotVazia()]);

  const cotsDe = (pid: number) => cots.filter(c => c.pedido_id === pid);
  const aguardando = pedidos.filter(p => p.status === 'enviado').length;
  const valorAutorizado = pedidos
    .filter(p => ['aprovado', 'comprado'].includes(p.status))
    .reduce((s, p) => { const v = cotsDe(p.id).find(c => c.id === p.cotacao_vencedora); return s + (v ? Number(v.valor_total) : 0); }, 0);

  async function audit(acao: string, id: number, detalhe: any) {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('auditoria').insert({ usuario: user?.id, acao, entidade: 'pedidos_materiais', entidade_id: String(id), detalhe, obra_id: obraId });
  }

  async function alternarFatDireto(p: any) {
    // Faturamento direto marcado no pedido: o cliente passa a ver este pedido e
    // a decidir sobre ele. Controle fino — dentro de um evento, um pedido pode
    // ser faturamento direto e outro seu custo.
    const novo = !p.faturamento_direto;
    const { error } = await supabase.from('pedidos_materiais').update({ faturamento_direto: novo }).eq('id', p.id);
    if (error) { alert(error.message); return; }
    setPedidos(ps => ps.map(x => x.id === p.id ? { ...x, faturamento_direto: novo } : x));
  }

  async function enviarPedido() {
    const itensValidos = itens.filter(i => i.descricao.trim());
    const cotsValidas = novasCots.filter(c => c.fornecedor.trim() && num(c.valor_total) > 0);
    if (!form.titulo.trim()) { alert('Informe o título do pedido.'); return; }
    if (!itensValidos.length) { alert('Inclua ao menos um item.'); return; }
    if (cotsValidas.length < 1) { alert('Inclua ao menos uma cotação com fornecedor e valor.'); return; }
    if (cotsValidas.length < 3 && !confirm('O padrão do contrato é apresentar 3 cotações. Enviar assim mesmo?')) return;

    setOcupado(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: pedido, error } = await supabase.from('pedidos_materiais').insert({
      titulo: form.titulo.trim(), evento_id: form.evento_id || null,
      necessidade: form.necessidade || null, justificativa: form.justificativa.trim() || null,
      itens: itensValidos.map(i => ({ descricao: i.descricao.trim(), unidade: i.unidade, qtd: num(i.qtd) })),
      status: 'enviado', criado_por: user?.id, obra_id: obraId,
    }).select().single();
    if (error || !pedido) { alert(error?.message ?? 'Falha ao criar o pedido.'); setOcupado(false); return; }

    const { data: cotsCriadas, error: e2 } = await supabase.from('cotacoes').insert(
      cotsValidas.map(c => ({
        pedido_id: pedido.id, fornecedor: c.fornecedor.trim(), cnpj: c.cnpj.trim() || null,
        valor_total: num(c.valor_total), prazo_entrega: c.prazo_entrega.trim() || null,
        condicoes_pagamento: c.condicoes_pagamento.trim() || null, frete: c.frete.trim() || null,
        observacoes: c.observacoes.trim() || null,
      }))
    ).select();
    if (e2) { alert(e2.message); setOcupado(false); return; }

    await audit('pedido_enviado', pedido.id, { titulo: pedido.titulo, cotacoes: cotsValidas.length });
    fetch('/api/notificar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'pedido_enviado', pedidoId: pedido.id, obraId }) }).catch(() => {});

    setPedidos(ps => [pedido, ...ps]);
    setCots(cs => [...cs, ...(cotsCriadas ?? [])]);
    setForm({ titulo: '', evento_id: '', necessidade: '', justificativa: '' });
    setItens([itemVazio()]); setNovasCots([cotVazia(), cotVazia(), cotVazia()]);
    setMostrarForm(false); setAberto(pedido.id); setOcupado(false);
  }

  async function decidir(p: any, status: 'aprovado' | 'recusado', cotacaoId?: number) {
    setOcupado(true);
    const patch = await decidirPedido(supabase, obraId, p, status, cotacaoId);
    setOcupado(false);
    if (patch) setPedidos(ps => ps.map(x => x.id === p.id ? { ...x, ...patch } : x));
  }

  async function registrarCompra(p: any) {
    setOcupado(true);
    const patch = await registrarCompraPedido(supabase, obraId, p);
    setOcupado(false);
    if (patch) setPedidos(ps => ps.map(x => x.id === p.id ? { ...x, ...patch } : x));
  }

  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="kpi blu"><div className="lbl">Pedidos registrados</div><div className="val">{pedidos.length}</div></div>
        <div className="kpi wrn"><div className="lbl">Aguardando aprovação</div><div className="val">{aguardando}</div><div className="foot">autorização escrita — Cl. 3.4.2</div></div>
        <div className="kpi acc"><div className="lbl">Valor autorizado</div><div className="val">{fmtBRL(valorAutorizado)}</div><div className="foot">cotações vencedoras aprovadas</div></div>
        <div className="kpi okk"><div className="lbl">Compras efetuadas</div><div className="val">{pedidos.filter(p => p.status === 'comprado').length}</div></div>
      </div>

      <h2 className="sec">Central de pedidos de materiais</h2>

      <div className="panel">
        <div className="hd">
          <h3>Pedidos e cotações</h3>
          <button className="btn" onClick={() => setMostrarForm(m => !m)}>{mostrarForm ? 'Fechar formulário' : '+ Novo pedido de materiais'}</button>
        </div>

        {mostrarForm && (
          <div className="bd" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="form-grid">
              <div className="fg" style={{ gridColumn: 'span 2' }}><label>Título do pedido</label>
                <input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Aço estrutural — lote 01" /></div>
              <div className="fg"><label>Evento vinculado</label>
                <select value={form.evento_id} onChange={e => setForm({ ...form, evento_id: e.target.value })}>
                  <option value="">— sem vínculo —</option>
                  {eventos.map(e => <option key={e.id} value={e.id}>{e.id} · {e.etapa}</option>)}
                </select></div>
              <div className="fg"><label>Necessidade em obra</label>
                <input type="date" value={form.necessidade} onChange={e => setForm({ ...form, necessidade: e.target.value })} /></div>
              <div className="fg full"><label>Justificativa técnica</label>
                <textarea rows={2} value={form.justificativa} onChange={e => setForm({ ...form, justificativa: e.target.value })}
                  placeholder="Vínculo com o cronograma, impacto no prazo, especificação exigida pela Smart Fit..." /></div>
            </div>

            <h2 className="sec">Itens do pedido</h2>
            {itens.map((it, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 90px 110px auto', gap: 8, marginBottom: 6 }}>
                <input placeholder="Descrição do material" value={it.descricao}
                  onChange={e => setItens(a => a.map((x, j) => j === i ? { ...x, descricao: e.target.value } : x))}
                  style={{ border: '1px solid var(--line-strong)', borderRadius: 4, padding: '8px 9px' }} />
                <select value={it.unidade} onChange={e => setItens(a => a.map((x, j) => j === i ? { ...x, unidade: e.target.value } : x))}
                  style={{ border: '1px solid var(--line-strong)', borderRadius: 4, padding: '8px 6px' }}>
                  {['un', 'kg', 'm', 'm2', 'm3', 'L', 'cj', 'vb'].map(u => <option key={u}>{u}</option>)}
                </select>
                <input placeholder="Qtd" value={it.qtd}
                  onChange={e => setItens(a => a.map((x, j) => j === i ? { ...x, qtd: e.target.value } : x))}
                  style={{ border: '1px solid var(--line-strong)', borderRadius: 4, padding: '8px 9px', textAlign: 'right', fontFamily: 'var(--mono)' }} />
                <button className="mini danger" onClick={() => setItens(a => a.length > 1 ? a.filter((_, j) => j !== i) : a)}>remover</button>
              </div>
            ))}
            <button className="mini" onClick={() => setItens(a => [...a, itemVazio()])}>+ adicionar item</button>

            <h2 className="sec">Cotações (padrão do contrato: 3 orçamentos)</h2>
            {novasCots.map((c, i) => (
              <div key={i} className="panel" style={{ marginBottom: 8 }}>
                <div className="bd form-grid">
                  <div className="fg"><label>Cotação {i + 1} — Fornecedor</label><input value={c.fornecedor} onChange={e => setNovasCots(a => a.map((x, j) => j === i ? { ...x, fornecedor: e.target.value } : x))} /></div>
                  <div className="fg"><label>CNPJ</label><input value={c.cnpj} onChange={e => setNovasCots(a => a.map((x, j) => j === i ? { ...x, cnpj: e.target.value } : x))} /></div>
                  <div className="fg"><label>Valor total (R$)</label><input value={c.valor_total} onChange={e => setNovasCots(a => a.map((x, j) => j === i ? { ...x, valor_total: e.target.value } : x))} placeholder="0,00" /></div>
                  <div className="fg"><label>Prazo de entrega</label><input value={c.prazo_entrega} onChange={e => setNovasCots(a => a.map((x, j) => j === i ? { ...x, prazo_entrega: e.target.value } : x))} placeholder="Ex.: 20 dias corridos" /></div>
                  <div className="fg"><label>Condições de pagamento</label><input value={c.condicoes_pagamento} onChange={e => setNovasCots(a => a.map((x, j) => j === i ? { ...x, condicoes_pagamento: e.target.value } : x))} /></div>
                  <div className="fg"><label>Frete</label><input value={c.frete} onChange={e => setNovasCots(a => a.map((x, j) => j === i ? { ...x, frete: e.target.value } : x))} placeholder="CIF / FOB" /></div>
                  <div className="fg" style={{ gridColumn: 'span 2' }}><label>Observações</label><input value={c.observacoes} onChange={e => setNovasCots(a => a.map((x, j) => j === i ? { ...x, observacoes: e.target.value } : x))} /></div>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <button className="mini" onClick={() => setNovasCots(a => [...a, cotVazia()])}>+ adicionar cotação</button>
              <button className="btn" onClick={enviarPedido} disabled={ocupado}>{ocupado ? 'Enviando…' : 'Enviar para aprovação da contratante'}</button>
            </div>
          </div>
        )}

        <div className="bd tblwrap">
          <table>
            <thead><tr><th>Pedido</th><th>Título / evento</th><th className="num">Necessidade</th><th className="num">Cotações</th><th className="num">Menor valor</th><th>Status</th></tr></thead>
            <tbody>
              {pedidos.map(p => {
                const pc = cotsDe(p.id);
                const menor = pc.length ? Math.min(...pc.map(c => Number(c.valor_total))) : 0;
                const [lbl, cls] = PEDIDO_STATUS[p.status] ?? ['?', 'st-pend'];
                const dc = decisaoDe(p.id);
                const vencedora = pc.find(c => c.id === p.cotacao_vencedora);
                return (
                  <Frag key={p.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => setAberto(a => a === p.id ? null : p.id)}>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{numeroPedido(p.id)}</td>
                      <td><b>{p.titulo}</b><div className="hint">{p.evento_id ? `Evento ${p.evento_id}` : 'Sem vínculo'} · {Array.isArray(p.itens) ? p.itens.length : 0} item(ns)</div></td>
                      <td className="num">{fmtData(p.necessidade)}</td>
                      <td className="num">{pc.length}</td>
                      <td className="num">{menor ? fmtBRL(menor) : '—'}</td>
                      <td>
                        <span className={`stamp ${cls}`}><span className="dot" />{lbl}</span>
                        {p.faturamento_direto && <span className="stamp st-valid" style={{ marginLeft: 6 }}>Fat. direto</span>}
                        {dc && DECISAO_CLIENTE_LABEL[dc.decisao] && (
                          <span className={`stamp ${DECISAO_CLIENTE_LABEL[dc.decisao][1]}`} style={{ marginLeft: 6 }}
                            title={dc.comentario ? `Comentário: ${dc.comentario}` : undefined}>
                            {DECISAO_CLIENTE_LABEL[dc.decisao][0]}
                          </span>
                        )}
                      </td>
                    </tr>
                    {aberto === p.id && (
                      <tr><td colSpan={6} style={{ background: 'var(--surface-2)' }}>
                        {/* Faturamento direto: decide se o pedido vai ao cliente para decisao */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: 10, border: '1px solid var(--line)', borderRadius: 6 }}>
                          <button className="mini" disabled={ocupado} onClick={() => alternarFatDireto(p)}
                            style={p.faturamento_direto ? { color: 'var(--ok)', borderColor: 'var(--ok)' } : undefined}>
                            {p.faturamento_direto ? '✓ Faturamento direto' : 'Marcar faturamento direto'}
                          </button>
                          <span className="hint" style={{ fontSize: 11.5 }}>
                            {p.faturamento_direto
                              ? 'O cliente paga direto ao fornecedor, vê este pedido e decide sobre ele.'
                              : 'Pedido de custo seu. Marque se o cliente paga direto ao fornecedor.'}
                          </span>
                          {p.faturamento_direto && p.cotacao_vencedora && (
                            <a className="mini" href={`/pedido-compra/${p.id}`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', textDecoration: 'none' }}>
                              Ver pedido de compra →
                            </a>
                          )}
                        </div>

                        {p.justificativa && <p style={{ fontSize: 13, marginBottom: 10 }}><b>Justificativa:</b> {p.justificativa}</p>}

                        <div className="fg"><label>Itens do pedido</label></div>
                        <div className="tblwrap" style={{ marginBottom: 12 }}><table>
                          <thead><tr><th>Descrição</th><th>Unid.</th><th className="num">Qtd</th></tr></thead>
                          <tbody>{(p.itens ?? []).map((it: any, i: number) => (
                            <tr key={i}><td>{it.descricao}</td><td>{it.unidade}</td><td className="num">{Number(it.qtd).toLocaleString('pt-BR')}</td></tr>
                          ))}</tbody>
                        </table></div>

                        {podeDecidir && (
                          <>
                            <div className="fg"><label>Mapa comparativo de cotações</label></div>
                            <div className="tblwrap"><table>
                              <thead><tr>{p.status === 'enviado' && <th>Aprovar</th>}<th>Fornecedor</th><th>CNPJ</th><th className="num">Valor total</th><th>Prazo</th><th>Pagamento</th><th>Frete</th><th>Obs.</th></tr></thead>
                              <tbody>
                                {pc.map(c => {
                                  const ehMenor = Number(c.valor_total) === menor;
                                  const ehVenc = c.id === p.cotacao_vencedora;
                                  return (
                                    <tr key={c.id} style={ehVenc ? { background: 'var(--ok-soft)' } : ehMenor ? { background: 'var(--info-soft)' } : undefined}>
                                      {p.status === 'enviado' && (
                                        <td><button className="mini" disabled={ocupado} onClick={() => decidir(p, 'aprovado', c.id)}>✓ escolher</button></td>
                                      )}
                                      <td><b>{c.fornecedor}</b>{ehMenor ? ' ★' : ''}{ehVenc ? ' — VENCEDORA' : ''}</td>
                                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{c.cnpj ?? '—'}</td>
                                      <td className="num"><b>{fmtBRL(Number(c.valor_total))}</b></td>
                                      <td>{c.prazo_entrega ?? '—'}</td>
                                      <td>{c.condicoes_pagamento ?? '—'}</td>
                                      <td>{c.frete ?? '—'}</td>
                                      <td className="hint">{c.observacoes ?? ''}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table></div>
                            <p className="hint" style={{ margin: '6px 0 10px' }}>★ menor preço. A escolha não precisa ser o menor valor — prazo e condições podem justificar (registre na observação da aprovação).</p>
                          </>
                        )}
                        {!podeDecidir && pc.length > 0 && (
                          <p className="hint" style={{ margin: '6px 0 10px' }}>{pc.length} cotação(ões) em análise pela contratante.</p>
                        )}

                        <div className="fg" style={{ marginBottom: 10 }}><label>Anexos (PDFs das cotações, pedido de compra, NF)</label>
                          <Anexos entidade="pedido" entidadeId={String(p.id)} obraId={obraId} /></div>

                        {['aprovado', 'comprado'].includes(p.status) && (
                          <div style={{ marginBottom: 10 }}>
                            <div className="fg"><label>Recebimento</label></div>
                            {recebimentosDe(p.id).length === 0 && <p className="hint">Nenhuma conferência registrada em obra ainda.</p>}
                            {recebimentosDe(p.id).map(r => {
                              const divRec = itensDe(r.id).some((i: any) => Number(i.qtd_recusada) > 0);
                              return (
                                <div key={r.id} className={`dia-item ${r.status === 'registrado' && divRec ? 'critico' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                    <div>
                                      <b>{fmtData(r.recebido_em?.slice(0, 10))}</b> · {pessoaNome(r.recebido_por)}
                                      {r.final_do_pedido && <span className="stamp st-valid" style={{ marginLeft: 6 }}>entrega final</span>}
                                      <span className={`stamp ${r.status === 'registrado' ? 'st-pend' : r.status === 'resolvido' ? 'st-ok' : 'st-risk'}`} style={{ marginLeft: 6 }}>{r.status}</span>
                                      {r.observacao && <div className="hint">{r.observacao}</div>}
                                    </div>
                                    {podeDecidir && r.status === 'registrado' && (
                                      <div style={{ display: 'flex', gap: 6 }}>
                                        <button className="mini" disabled={ocupado} onClick={() => marcarRecebimento(r, 'resolvido')}>marcar resolvido</button>
                                        <button className="mini danger" disabled={ocupado} onClick={() => marcarRecebimento(r, 'cancelado')}>cancelar</button>
                                      </div>
                                    )}
                                  </div>
                                  <div className="tblwrap"><table>
                                    <thead><tr><th>Item</th><th className="num">Pedida</th><th className="num">Recebida</th><th className="num">Aceita</th><th className="num">Recusada</th><th>Motivo</th></tr></thead>
                                    <tbody>
                                      {itensDe(r.id).map((i: any) => (
                                        <tr key={i.id} style={Number(i.qtd_recusada) > 0 ? { background: 'var(--risk-soft)' } : undefined}>
                                          <td>{i.descricao}</td>
                                          <td className="num">{Number(i.qtd_pedida).toLocaleString('pt-BR')} {i.unidade}</td>
                                          <td className="num">{Number(i.qtd_recebida).toLocaleString('pt-BR')}</td>
                                          <td className="num">{Number(i.qtd_aceita).toLocaleString('pt-BR')}</td>
                                          <td className="num">{Number(i.qtd_recusada).toLocaleString('pt-BR')}</td>
                                          <td className="hint">{i.motivo_recusa ?? ''}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table></div>
                                </div>
                              );
                            })}
                            {temDivergencia(p) && (
                              <div className="alert risk" style={{ marginTop: 8 }}>
                                <b>Divergência aberta</b>
                                O lançamento deste pedido não pode ser pago enquanto a divergência não for resolvida.
                              </div>
                            )}
                          </div>
                        )}

                        {p.motivo_decisao && <div className="alert info"><b>Decisão registrada</b>{p.motivo_decisao}</div>}
                        {p.compra_info && <div className="alert info"><b>Compra efetuada</b>Pedido de compra: {p.compra_info.pedido_compra || '—'} · NF: {p.compra_info.nf || '—'} · Data: {fmtData(p.compra_info.data)}</div>}

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {podeDecidir && p.status === 'enviado' && (
                            <button className="mini danger" disabled={ocupado} onClick={() => decidir(p, 'recusado')}>✕ Recusar pedido</button>
                          )}
                          {podeDecidir && p.status === 'aprovado' && (
                            <button className="btn sec" disabled={ocupado} onClick={() => registrarCompra(p)}>Registrar compra efetuada com {vencedora?.fornecedor ?? 'o fornecedor'}</button>
                          )}
                          {!podeDecidir && p.status === 'enviado' && <span className="hint">Aguardando aprovação da contratante (Cl. 3.4.2). Decisão será notificada por e-mail.</span>}
                        </div>
                      </td></tr>
                    )}
                  </Frag>
                );
              })}
              {pedidos.length === 0 && <tr><td colSpan={6} className="hint">Nenhum pedido registrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Frag({ children }: { children: React.ReactNode }) { return <>{children}</>; }
