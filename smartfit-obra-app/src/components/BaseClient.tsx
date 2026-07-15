'use client';
import { useState } from 'react';
import { fmtBRL, fmtData } from '@/lib/contrato';

export default function BaseClient({ bases, modelos, calibracoes, importacoes, resumo }:
  { bases: any[]; modelos: any[]; calibracoes: any[]; importacoes: any[]; resumo: any[] }) {
  const [modeloId, setModeloId] = useState(modelos[0]?.id ?? '');
  const [aba, setAba] = useState<'real' | 'base'>('real');
  const [analise, setAnalise] = useState<any>(null);
  const [escolhidos, setEscolhidos] = useState<number[]>([]);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [csv, setCsv] = useState('');
  const [baseId, setBaseId] = useState('sinapi_go');
  const [ref, setRef] = useState('');

  async function analisar() {
    setOcupado(true); setAnalise(null); setEscolhidos([]);
    try {
      const url = aba === 'real' ? `/api/comercial/calibrar?modelo=${modeloId}` : `/api/comercial/base?modelo=${modeloId}`;
      const r = await fetch(url);
      const j = await r.json();
      if (j.erro) { alert(j.erro); setOcupado(false); return; }
      setAnalise(j);
      setEscolhidos((j.propostas ?? []).map((p: any) => p.item_id));
    } catch (e: any) { alert('Falha: ' + e.message); }
    setOcupado(false);
  }

  async function aplicar() {
    if (!escolhidos.length) { alert('Escolha ao menos um item.'); return; }
    if (motivo.trim().length < 5) { alert('Descreva o motivo — fica no histórico do modelo.'); return; }
    setOcupado(true);
    try {
      const url = aba === 'real' ? '/api/comercial/calibrar' : '/api/comercial/base';
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelo_id: modeloId, aplicar: escolhidos, motivo }),
      });
      const j = await r.json();
      if (j.erro) { alert(j.erro); setOcupado(false); return; }
      alert(`${j.itens} item(ns) calibrado(s).\n\nCusto do modelo: R$ ${j.custo_m2_antes}/m² → R$ ${j.custo_m2_depois}/m² (${j.variacao_pct > 0 ? '+' : ''}${j.variacao_pct}%)`);
      location.reload();
    } catch (e: any) { alert('Falha: ' + e.message); }
    setOcupado(false);
  }

  async function importar() {
    if (!csv.trim()) { alert('Cole o conteúdo do CSV.'); return; }
    setOcupado(true);
    try {
      const r = await fetch('/api/comercial/importar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_id: baseId, csv, referencia: ref || null }),
      });
      const j = await r.json();
      if (j.erro) { alert(j.erro); setOcupado(false); return; }
      alert(`${j.lidas} linha(s): ${j.novas} nova(s), ${j.atualizadas} atualizada(s).` +
            (j.variacao_media_pct !== null ? `\nVariação média: ${j.variacao_media_pct}%` : '') +
            (j.aviso ? `\n\n${j.aviso}` : '') + `\n\n${j.proximo}`);
      location.reload();
    } catch (e: any) { alert('Falha: ' + e.message); }
    setOcupado(false);
  }

  const p = analise?.propostas ?? [];

  return (
    <>
      <section className="cock-hero">
        <div className="saud">Base de preços e modelos</div>
        <div className="resumo">
          O modelo nasceu com os índices de uma obra. Aqui ele aprende com o custo real — senão o erro de orçamento se repete para sempre.
        </div>
      </section>

      {/* ---------- resumo das bases ---------- */}
      <div className="panel">
        <div className="hd"><h3>Bases</h3></div>
        <div className="bd">
          <table className="tab">
            <thead><tr><th>Base</th><th>Tipo</th><th>UF</th><th>Referência</th><th style={{ textAlign: 'right' }}>Composições</th></tr></thead>
            <tbody>
              {bases.map(b => {
                const r = resumo.find((x: any) => x.base_id === b.id);
                return (
                  <tr key={b.id}>
                    <td><b>{b.nome}</b>{b.observacao && <div className="hint" style={{ maxWidth: 460 }}>{b.observacao}</div>}</td>
                    <td><span className="hint">{b.tipo}</span></td>
                    <td>{b.uf ?? '—'}</td>
                    <td>{b.referencia ? fmtData(b.referencia) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r?.qtd ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- calibração ---------- */}
      <div className="panel">
        <div className="hd">
          <h3>Calibrar modelo</h3>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            <select value={modeloId} onChange={e => { setModeloId(Number(e.target.value)); setAnalise(null); }}
              style={{ padding: '5px 8px', fontSize: 12 }}>
              {modelos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
            <button className="btn" disabled={ocupado} onClick={analisar}>{ocupado ? 'analisando…' : 'Analisar'}</button>
          </div>
        </div>
        <div className="bd">
          <div className="subtabs" style={{ marginBottom: 12 }}>
            <button className={`subtab ${aba === 'real' ? 'on' : ''}`} onClick={() => { setAba('real'); setAnalise(null); }}>Contra o custo real</button>
            <button className={`subtab ${aba === 'base' ? 'on' : ''}`} onClick={() => { setAba('base'); setAnalise(null); }}>Contra a base de preços</button>
          </div>

          <p className="hint" style={{ marginBottom: 12 }}>
            {aba === 'real'
              ? 'Compara o modelo com o que as obras realmente custaram (pedidos aprovados). Corrige o custo unitário, não o índice: se a etapa custou mais, o preço estava defasado — quantidade por m² só muda com medição física.'
              : 'Compara o custo do modelo com a base de preços atual. Use depois de importar uma tabela nova do SINAPI.'}
          </p>

          {analise?.aviso && <p style={{ fontSize: 12.5, paddingLeft: 10, borderLeft: '2px solid var(--line-strong)', marginBottom: 10 }}>{analise.aviso}</p>}

          {analise && !p.length && (
            <p className="hint">Nada a corrigir — o modelo está alinhado{aba === 'real' ? ' com o custo real observado' : ' com a base'}.</p>
          )}

          {p.length > 0 && (
            <>
              {analise.impacto_total_m2 !== undefined && (
                <div className="cock-strip" style={{ marginBottom: 12 }}>
                  <div className="it"><div className="n">{p.length}</div><div className="l">Itens a corrigir</div></div>
                  <div className={`it ${analise.impacto_total_m2 > 0 ? 'risco' : ''}`}>
                    <div className="n" style={{ fontSize: 15 }}>{analise.impacto_total_m2 > 0 ? '+' : ''}{fmtBRL(analise.impacto_total_m2)}</div>
                    <div className="l">Impacto por m²</div>
                  </div>
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table className="tab">
                  <thead><tr>
                    <th style={{ width: 30 }}>
                      <input type="checkbox" checked={escolhidos.length === p.length}
                        onChange={e => setEscolhidos(e.target.checked ? p.map((x: any) => x.item_id) : [])} />
                    </th>
                    <th>Etapa</th><th>Item</th>
                    <th style={{ textAlign: 'right' }}>De</th><th style={{ textAlign: 'right' }}>Para</th><th style={{ textAlign: 'right' }}>Δ</th>
                  </tr></thead>
                  <tbody>
                    {p.map((x: any) => (
                      <tr key={x.item_id}>
                        <td><input type="checkbox" checked={escolhidos.includes(x.item_id)}
                          onChange={e => setEscolhidos(l => e.target.checked ? [...l, x.item_id] : l.filter(i => i !== x.item_id))} /></td>
                        <td><span className="hint">{x.etapa}</span></td>
                        <td style={{ maxWidth: 300 }}>{x.descricao}
                          {x.fonte && <div className="hint">{x.fonte}</div>}</td>
                        <td style={{ textAlign: 'right' }}>{fmtBRL(x.de)}</td>
                        <td style={{ textAlign: 'right' }}><b>{fmtBRL(x.para)}</b></td>
                        <td style={{ textAlign: 'right', color: x.variacao_pct > 0 ? 'var(--brand)' : '#2e9e5b' }}>
                          {x.variacao_pct > 0 ? '+' : ''}{x.variacao_pct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(analise.ignoradas ?? []).length > 0 && (
                <details style={{ marginTop: 10 }}>
                  <summary className="hint" style={{ cursor: 'pointer' }}>{analise.ignoradas.length} etapa(s) ignorada(s)</summary>
                  {analise.ignoradas.map((i: string, n: number) => <p key={n} className="hint" style={{ marginTop: 4 }}>· {i}</p>)}
                </details>
              )}

              <div className="fg" style={{ marginTop: 14 }}>
                <label>Motivo da calibração (fica no histórico do modelo)</label>
                <input value={motivo} onChange={e => setMotivo(e.target.value)}
                  placeholder="Ex.: custo real da TK-328 após compra da estrutura" />
              </div>
              <button className="btn" style={{ marginTop: 10 }} disabled={ocupado || !escolhidos.length || motivo.trim().length < 5} onClick={aplicar}>
                Aplicar {escolhidos.length} correção(ões)
              </button>
            </>
          )}
        </div>
      </div>

      {/* ---------- importação ---------- */}
      <div className="panel">
        <div className="hd"><h3>Importar base (SINAPI)</h3></div>
        <div className="bd">
          <p className="hint" style={{ marginBottom: 10 }}>
            A Caixa publica o SINAPI em planilha mensal por estado — não há API. Baixe a planilha, deixe as colunas
            <b> codigo · descricao · unidade · custo</b>, salve como CSV e cole abaixo. Aceita separador <b>;</b> ou <b>,</b> e decimal com vírgula.
          </p>
          <div className="form-grid">
            <div className="fg"><label>Base de destino</label>
              <select value={baseId} onChange={e => setBaseId(e.target.value)}>
                {bases.filter(b => b.tipo === 'publica').map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </select></div>
            <div className="fg"><label>Mês de referência</label>
              <input type="date" value={ref} onChange={e => setRef(e.target.value)} /></div>
          </div>
          <div className="fg" style={{ marginTop: 10 }}>
            <label>Conteúdo do CSV</label>
            <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={6}
              placeholder={'codigo;descricao;unidade;custo\n88309;Pedreiro com encargos complementares;H;28,50'}
              style={{ fontFamily: 'var(--mono)', fontSize: 11 }} />
          </div>
          <button className="btn" style={{ marginTop: 10 }} disabled={ocupado || !csv.trim()} onClick={importar}>
            {ocupado ? 'importando…' : 'Importar'}
          </button>
        </div>
      </div>

      {/* ---------- histórico ---------- */}
      {(calibracoes.length > 0 || importacoes.length > 0) && (
        <div className="panel">
          <div className="hd"><h3>Histórico</h3></div>
          <div className="bd">
            {calibracoes.map((c: any) => (
              <div key={`c${c.id}`} style={{ paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <b style={{ fontSize: 12.5 }}>{c.motivo}</b>
                  <span className="hint">{fmtData(String(c.criado_em).slice(0, 10))} · {c.origem}</span>
                </div>
                <p className="hint" style={{ marginTop: 3 }}>
                  {c.itens_afetados} item(ns) · custo do modelo {fmtBRL(c.custo_antes)}/m² → {fmtBRL(c.custo_depois)}/m²
                  {c.custo_antes > 0 && ` (${((c.custo_depois / c.custo_antes - 1) * 100).toFixed(1)}%)`}
                </p>
              </div>
            ))}
            {importacoes.map((i: any) => (
              <div key={`i${i.id}`} style={{ paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <b style={{ fontSize: 12.5 }}>Importação · {i.base_id}</b>
                  <span className="hint">{fmtData(String(i.criado_em).slice(0, 10))}</span>
                </div>
                <p className="hint" style={{ marginTop: 3 }}>
                  {i.linhas_lidas} linha(s): {i.linhas_novas} nova(s), {i.linhas_atualizadas} atualizada(s)
                  {i.variacao_media_pct !== null && ` · variação média ${i.variacao_media_pct}%`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
