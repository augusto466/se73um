'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { subirArquivo } from '@/lib/arquivos';

type ItemForm = { recebida: string; recusada: string; motivo: string; foto: File | null };

const n = (s: string) => Number(s) || 0;

export default function RecebimentoClient({ itensIniciais, obraId }: { itensIniciais: any[]; obraId: number }) {
  const [itens, setItens] = useState(itensIniciais);
  const [conferindo, setConferindo] = useState<number | null>(null);
  const [form, setForm] = useState<Record<number, ItemForm>>({});
  const [finalDoPedido, setFinalDoPedido] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const supabase = supabaseBrowser();

  const porPedido = new Map<number, { pedido_id: number; titulo: string; itens: any[] }>();
  for (const it of itens) {
    if (!porPedido.has(it.pedido_id)) porPedido.set(it.pedido_id, { pedido_id: it.pedido_id, titulo: it.titulo, itens: [] });
    porPedido.get(it.pedido_id)!.itens.push(it);
  }
  const pedidos = Array.from(porPedido.values());

  function fd(idx: number): ItemForm {
    return form[idx] ?? { recebida: '', recusada: '', motivo: '', foto: null };
  }
  function setFd(idx: number, patch: Partial<ItemForm>) {
    setForm(f => ({ ...f, [idx]: { ...fd(idx), ...patch } }));
  }

  function abrirConferencia(pedidoId: number) {
    setConferindo(pedidoId);
    setForm({});
    setFinalDoPedido(false);
    setObservacao('');
  }

  async function enviarConferencia(pedido: { pedido_id: number; itens: any[] }) {
    const { data: { user } } = await supabase.auth.getUser();
    const linhasForm = pedido.itens
      .map(it => ({ it, f: fd(it.item_idx) }))
      .filter(({ f }) => n(f.recebida) > 0 || n(f.recusada) > 0);
    if (!linhasForm.length) { alert('Informe a quantidade recebida de ao menos um item.'); return; }

    setOcupado(true);
    const { data: receb, error } = await supabase.from('recebimento').insert({
      obra_id: obraId, pedido_id: pedido.pedido_id, recebido_por: user?.id,
      final_do_pedido: finalDoPedido, observacao: observacao.trim() || null,
    }).select().single();
    if (error || !receb) { alert(error?.message ?? 'Falha ao registrar o recebimento.'); setOcupado(false); return; }

    const linhas: any[] = [];
    for (const { it, f } of linhasForm) {
      const recebida = n(f.recebida);
      const recusada = Math.min(n(f.recusada), recebida);
      const aceita = Math.max(recebida - recusada, 0);
      let foto_path: string | null = null;
      if (f.foto) {
        try {
          const up = await subirArquivo(f.foto, `recebimento/${receb.id}/${it.item_idx}`);
          foto_path = up.path;
        } catch (e: any) {
          alert(`Não deu para subir a foto de "${it.descricao}": ${e.message}. O item foi registrado sem foto.`);
        }
      }
      linhas.push({
        recebimento_id: receb.id, obra_id: obraId, pedido_item_idx: it.item_idx,
        descricao: it.descricao, unidade: it.unidade, qtd_pedida: it.qtd_pedida,
        qtd_recebida: recebida, qtd_aceita: aceita, qtd_recusada: recusada,
        motivo_recusa: f.motivo.trim() || null, foto_path,
      });
    }

    const { error: e2 } = await supabase.from('recebimento_item').insert(linhas);
    setOcupado(false);
    if (e2) { alert(e2.message); return; }

    // atualiza saldo local com a mesma conta da view pedido_item_campo
    setItens(list => list.map(it => {
      const l = linhas.find(x => x.pedido_item_idx === it.item_idx && it.pedido_id === pedido.pedido_id);
      if (!l) return it;
      const qtd_recebida = Number(it.qtd_recebida) + l.qtd_recebida;
      const qtd_aceita = Number(it.qtd_aceita) + l.qtd_aceita;
      return { ...it, qtd_recebida, qtd_aceita, saldo: Math.max(Number(it.qtd_pedida) - qtd_aceita, 0) };
    }));
    setConferindo(null);
    alert('Conferência registrada.');
  }

  return (
    <>
      <h2 className="sec">Recebimento de materiais</h2>
      <p className="hint" style={{ marginBottom: 12 }}>
        Confira o que chegou contra o pedido, item a item. Divergência (item recusado, ou quantidade
        diferente da pedida na entrega final) trava o pagamento até a contratante resolver.
      </p>

      {pedidos.length === 0 && (
        <div className="panel"><div className="bd"><p className="hint">Nenhum pedido aprovado com saldo a receber.</p></div></div>
      )}

      {pedidos.map(p => {
        const saldoTotal = p.itens.reduce((s, it) => s + Number(it.saldo), 0);
        return (
          <div key={p.pedido_id} className="panel receb-card">
            <div className="hd" style={{ cursor: 'pointer' }} onClick={() => conferindo === p.pedido_id ? setConferindo(null) : abrirConferencia(p.pedido_id)}>
              <h3>{p.titulo}</h3>
              <span className="hint">{saldoTotal > 0 ? `saldo em ${p.itens.filter(it => Number(it.saldo) > 0).length} item(ns)` : 'tudo recebido'}</span>
            </div>

            {conferindo === p.pedido_id && (
              <div className="bd">
                {p.itens.map(it => {
                  const f = fd(it.item_idx);
                  return (
                    <div key={it.item_idx} className="receb-item">
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{it.descricao}</div>
                      <div className="hint" style={{ marginBottom: 8 }}>
                        pedido {Number(it.qtd_pedida).toLocaleString('pt-BR')} {it.unidade} · já recebido {Number(it.qtd_recebida).toLocaleString('pt-BR')} · saldo {Number(it.saldo).toLocaleString('pt-BR')}
                      </div>
                      <div className="receb-grid">
                        <div className="fg"><label>Recebida agora</label>
                          <input type="number" inputMode="decimal" min={0} step="any" value={f.recebida}
                            onChange={e => setFd(it.item_idx, { recebida: e.target.value })} placeholder="0" /></div>
                        <div className="fg"><label>Recusada</label>
                          <input type="number" inputMode="decimal" min={0} step="any" value={f.recusada}
                            onChange={e => setFd(it.item_idx, { recusada: e.target.value })} placeholder="0" /></div>
                        <div className="fg full"><label>Motivo da recusa (se houver)</label>
                          <input value={f.motivo} onChange={e => setFd(it.item_idx, { motivo: e.target.value })}
                            placeholder="Ex.: embalagem violada, especificação errada..." /></div>
                        <div className="fg full">
                          <label className="mini" style={{ display: 'inline-block', cursor: 'pointer' }}>
                            {f.foto ? `📷 ${f.foto.name}` : '📷 anexar foto'}
                            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                              onChange={e => setFd(it.item_idx, { foto: e.target.files?.[0] ?? null })} />
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="fg" style={{ marginTop: 10 }}>
                  <label className="mini" style={{ display: 'flex', alignItems: 'center', gap: 6, width: 'fit-content', cursor: 'pointer' }}>
                    <input type="checkbox" checked={finalDoPedido} onChange={e => setFinalDoPedido(e.target.checked)} />
                    Esta é a última entrega deste pedido
                  </label>
                </div>
                <div className="fg" style={{ marginTop: 8 }}>
                  <label>Observação (opcional)</label>
                  <input value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex.: entrega parcial, resto chega semana que vem" />
                </div>

                <button className="btn" style={{ width: '100%', marginTop: 12 }} disabled={ocupado} onClick={() => enviarConferencia(p)}>
                  {ocupado ? 'Registrando…' : 'Registrar conferência'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
