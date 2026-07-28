'use client';
import { useState, useMemo } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

const fmt = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const parseNum = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0;

// Apropria um lancamento a itens do orcamento, rateando por valor. Grava em
// lancamento_item. A soma nao pode passar do valor do lancamento.
export default function ApropriarItem({ lancamento, itens, apropriacoesIniciais, obraId, onFechar, onMudou }:
  { lancamento: any; itens: any[]; apropriacoesIniciais: any[]; obraId: number; onFechar: () => void; onMudou: (aprs: any[]) => void }) {
  const supabase = supabaseBrowser();
  const valorLanc = Number(lancamento.valor);

  // estado: { item_id: valorString } — so os itens apropriados
  const [aprs, setAprs] = useState<Record<number, string>>(() =>
    Object.fromEntries(apropriacoesIniciais.map(a => [a.item_id, String(Number(a.valor).toFixed(2)).replace('.', ',')]))
  );
  const [busca, setBusca] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const somaApr = useMemo(() =>
    Object.values(aprs).reduce((s, v) => s + parseNum(v), 0), [aprs]);
  const resto = valorLanc - somaApr;

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = q ? itens.filter(i => i.codigo.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q)) : itens;
    // apropriados primeiro
    return [...base].sort((a, b) => (aprs[b.id] ? 1 : 0) - (aprs[a.id] ? 1 : 0));
  }, [itens, busca, aprs]);

  function setValor(itemId: number, v: string) {
    setAprs(a => {
      const n = { ...a };
      if (!v.trim() || parseNum(v) === 0) delete n[itemId];
      else n[itemId] = v;
      return n;
    });
  }

  function apropriarResto(itemId: number) {
    // joga o resto neste item
    const atual = parseNum(aprs[itemId] ?? '0');
    const novo = atual + resto;
    if (novo > 0) setValor(itemId, String(novo.toFixed(2)).replace('.', ','));
  }

  async function salvar() {
    if (somaApr - valorLanc > 0.01) { alert('A soma apropriada não pode passar do valor do lançamento.'); return; }
    setOcupado(true);

    // estrategia simples: apaga as apropriacoes do lancamento e regrava as atuais
    await supabase.from('lancamento_item').delete().eq('lancamento_id', lancamento.id);

    const linhas = Object.entries(aprs)
      .map(([itemId, v]) => ({ lancamento_id: lancamento.id, item_id: Number(itemId), obra_id: obraId, valor: parseNum(v) }))
      .filter(l => l.valor > 0);

    let criadas: any[] = [];
    if (linhas.length) {
      const { data, error } = await supabase.from('lancamento_item').insert(linhas).select();
      if (error) { alert(error.message); setOcupado(false); return; }
      criadas = data ?? [];
    }
    setOcupado(false);
    onMudou(criadas);
    onFechar();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'grid', placeItems: 'center', padding: 16 }}
      onClick={onFechar}>
      <div className="panel" style={{ maxWidth: 640, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
        <div className="hd">
          <h3>Apropriar ao orçamento</h3>
          <button className="mini" onClick={onFechar}>fechar</button>
        </div>
        <div className="bd" style={{ overflow: 'auto' }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600 }}>{lancamento.descricao}</div>
            <div className="hint">{fmt(valorLanc)} · {lancamento.natureza === 'pagar' ? 'a pagar' : 'a receber'}</div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 12, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 6 }}>
            <div><span className="hint">Apropriado</span><div style={{ fontWeight: 600 }}>{fmt(somaApr)}</div></div>
            <div><span className="hint">Resto</span><div style={{ fontWeight: 600, color: Math.abs(resto) < 0.01 ? 'var(--ok)' : resto < 0 ? 'var(--risk)' : 'var(--ink)' }}>{fmt(resto)}</div></div>
          </div>

          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item por código ou descrição…"
            style={{ width: '100%', marginBottom: 10, padding: '8px 10px', border: '1px solid var(--line-strong)', borderRadius: 4 }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filtrados.map(it => {
              const ativo = !!aprs[it.id];
              return (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4, background: ativo ? 'var(--ok-soft)' : undefined }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: ativo ? 600 : 400 }}>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--gray)' }}>{it.codigo}</span> {it.descricao}
                    </div>
                    <div className="hint" style={{ fontSize: 10.5 }}>orçado {fmt(it.custo_orcado)}</div>
                  </div>
                  {resto > 0.01 && (
                    <button className="mini" onClick={() => apropriarResto(it.id)} title="Jogar o resto aqui">+resto</button>
                  )}
                  <input value={aprs[it.id] ?? ''} onChange={e => setValor(it.id, e.target.value)} placeholder="0,00"
                    style={{ width: 100, padding: '6px 8px', border: '1px solid var(--line-strong)', borderRadius: 4, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }} />
                </div>
              );
            })}
            {!filtrados.length && <p className="hint">Nenhum item encontrado.</p>}
          </div>
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="hint">{Object.keys(aprs).length} item(ns) · {fmt(somaApr)} de {fmt(valorLanc)}</span>
          <button className="btn" onClick={salvar} disabled={ocupado || resto < -0.01}>
            {ocupado ? 'Salvando…' : 'Salvar apropriação'}
          </button>
        </div>
      </div>
    </div>
  );
}
