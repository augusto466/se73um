'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtBRL, fmtData } from '@/lib/contrato';

export default function OportunidadeClient({ op, premissasIniciais, modelos, propostas, itensProposta }:
  { op: any; premissasIniciais: any; modelos: any[]; propostas: any[]; itensProposta: any[] }) {
  const [prem, setPrem] = useState<any>(premissasIniciais ?? {
    area_projecao: '', area_laje: '', pe_direito: '', prazo_meses: '', padrao_acabamento: 'medio',
  });
  const [modeloId, setModeloId] = useState(modelos[0]?.id ?? '');
  const [sim, setSim] = useState<any>(null);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [verItens, setVerItens] = useState(false);
  const supabase = supabaseBrowser();

  const ultima = propostas[0];

  async function salvarPremissas() {
    setOcupado(true);
    const payload: any = { oportunidade_id: op.id, atualizado_em: new Date().toISOString() };
    ['area_projecao','area_laje','area_fachada','pe_direito','prazo_meses','distancia_km'].forEach(k => {
      payload[k] = prem[k] ? Number(prem[k]) : null;
    });
    ['tipo_estrutura','tipo_fechamento','tipo_cobertura','tipo_piso','padrao_acabamento','notas'].forEach(k => {
      payload[k] = prem[k] || null;
    });
    const { error } = await supabase.from('oportunidade_premissas').upsert(payload, { onConflict: 'oportunidade_id' });
    if (error) { alert(error.message); setOcupado(false); return; }
    if (op.estagio === 'contato') {
      await supabase.from('oportunidades').update({ estagio: 'premissas', probabilidade: 25 }).eq('id', op.id);
    }
    setOcupado(false);
    alert('Premissas salvas.');
  }

  async function gerar(gravar = false) {
    if (!prem.area_projecao) { alert('A área de projeção é obrigatória — é o principal driver do orçamento.'); return; }
    setOcupado(true);
    try {
      const r = await fetch('/api/comercial/gerar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oportunidade_id: op.id, modelo_id: modeloId, gravar,
          premissas: {
            area_projecao: Number(prem.area_projecao), area_laje: prem.area_laje ? Number(prem.area_laje) : null,
            area_fachada: prem.area_fachada ? Number(prem.area_fachada) : null,
            pe_direito: prem.pe_direito ? Number(prem.pe_direito) : null,
            prazo_meses: prem.prazo_meses ? Number(prem.prazo_meses) : null,
            padrao_acabamento: prem.padrao_acabamento || 'medio',
          },
        }),
      });
      const j = await r.json();
      if (j.erro) { alert(j.erro); setOcupado(false); return; }
      setSim(j.orcamento);
      setAlertas(j.alertas_historico ?? []);
      if (gravar) { alert(`Proposta R${String(j.proposta.versao).padStart(2,'0')} criada.`); location.reload(); }
    } catch (e: any) { alert('Falha: ' + e.message); }
    setOcupado(false);
  }

  async function converter() {
    const codigo = prompt('Código da nova obra (ex.: TK-329/2026):');
    if (!codigo) return;
    setOcupado(true);
    try {
      const r = await fetch('/api/comercial/converter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposta_id: ultima.id, codigo }),
      });
      const j = await r.json();
      if (j.erro) { alert(j.erro); setOcupado(false); return; }
      alert(`Obra ${j.obra.codigo} criada com ${j.etapas} etapa(s) de orçamento.\n\n${j.proximo}`);
      location.href = '/obras';
    } catch (e: any) { alert('Falha: ' + e.message); }
    setOcupado(false);
  }

  const res = sim ?? (ultima ? { custo_total: ultima.custo_total, preco_total: ultima.preco_total,
    bdi_efetivo: (ultima.bdi_medio ?? 0) * 100, etapas: [], avisos: [],
    custo_m2: prem.area_projecao ? Math.round(ultima.custo_total / Number(prem.area_projecao)) : null,
    preco_m2: prem.area_projecao ? Math.round(ultima.preco_total / Number(prem.area_projecao)) : null } : null);

  return (
    <>
      <section className="cock-hero">
        <div className="saud">{op.titulo}</div>
        <div className="resumo">
          {op.cliente} · {op.codigo} · estágio <b>{op.estagio}</b>
          {op.prazo_proposta && <> · proposta até <b>{fmtData(op.prazo_proposta)}</b></>}
        </div>
      </section>

      {/* ---------- premissas ---------- */}
      <div className="panel">
        <div className="hd">
          <h3>Premissas da obra</h3>
          <span className="hint">é daqui que o orçamento sai</span>
        </div>
        <div className="bd">
          <div className="form-grid">
            <div className="fg"><label>Área de projeção (m²) *</label>
              <input type="number" step="0.01" value={prem.area_projecao ?? ''} onChange={e => setPrem({ ...prem, area_projecao: e.target.value })} /></div>
            <div className="fg"><label>Área de laje / mezanino (m²)</label>
              <input type="number" step="0.01" value={prem.area_laje ?? ''} onChange={e => setPrem({ ...prem, area_laje: e.target.value })} /></div>
            <div className="fg"><label>Pé-direito (m)</label>
              <input type="number" step="0.1" value={prem.pe_direito ?? ''} onChange={e => setPrem({ ...prem, pe_direito: e.target.value })} /></div>
            <div className="fg"><label>Prazo (meses)</label>
              <input type="number" step="0.5" value={prem.prazo_meses ?? ''} onChange={e => setPrem({ ...prem, prazo_meses: e.target.value })} /></div>
            <div className="fg"><label>Padrão de acabamento</label>
              <select value={prem.padrao_acabamento ?? 'medio'} onChange={e => setPrem({ ...prem, padrao_acabamento: e.target.value })}>
                <option value="simples">Simples (−8%)</option>
                <option value="medio">Médio (referência)</option>
                <option value="alto">Alto (+18%)</option>
              </select></div>
            <div className="fg"><label>Modelo de orçamento</label>
              <select value={modeloId} onChange={e => setModeloId(Number(e.target.value))}>
                {modelos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="mini" disabled={ocupado} onClick={salvarPremissas}>Salvar premissas</button>
            <button className="btn" disabled={ocupado || !prem.area_projecao} onClick={() => gerar(false)}>
              {ocupado ? 'calculando…' : 'Gerar orçamento'}
            </button>
          </div>
        </div>
      </div>

      {/* ---------- resultado ---------- */}
      {res && (
        <div className="panel" style={{ borderLeft: '3px solid var(--brand)' }}>
          <div className="hd">
            <h3>{sim ? 'Orçamento simulado' : `Proposta R${String(ultima.versao).padStart(2,'0')}`}</h3>
            {sim && <button className="mini" onClick={() => { setSim(null); setAlertas([]); }}>limpar</button>}
          </div>
          <div className="bd">
            <div className="cock-strip" style={{ marginBottom: 14 }}>
              <div className="it"><div className="n" style={{ fontSize: 15 }}>{fmtBRL(res.custo_total)}</div><div className="l">Custo</div></div>
              <div className="it"><div className="n" style={{ fontSize: 15 }}>{fmtBRL(res.preco_total - res.custo_total)}</div><div className="l">BDI ({res.bdi_efetivo?.toFixed(1)}%)</div></div>
              <div className="it"><div className="n" style={{ fontSize: 15 }}>{fmtBRL(res.preco_total)}</div><div className="l">Preço</div></div>
              {res.custo_m2 && <div className="it"><div className="n" style={{ fontSize: 15 }}>{fmtBRL(res.preco_m2)}</div><div className="l">Preço / m²</div></div>}
            </div>

            {(res.avisos ?? []).map((a: string, i: number) => (
              <p key={i} className="hint" style={{ paddingLeft: 10, borderLeft: '2px solid var(--line-strong)', marginBottom: 5 }}>{a}</p>
            ))}

            {alertas.map((a: any, i: number) => (
              <p key={i} style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 6, paddingLeft: 10, borderLeft: '2px solid var(--brand)' }}>
                <b>{a.etapa}</b>: {a.nota}
              </p>
            ))}

            {(res.etapas ?? []).length > 0 && (
              <table className="tab" style={{ marginTop: 10 }}>
                <thead><tr><th>Etapa</th><th style={{ textAlign: 'right' }}>Custo</th><th style={{ textAlign: 'right' }}>Preço</th><th style={{ textAlign: 'right' }}>%</th></tr></thead>
                <tbody>
                  {res.etapas.map((e: any) => (
                    <tr key={e.etapa}>
                      <td>{e.etapa}</td>
                      <td style={{ textAlign: 'right' }}>{fmtBRL(e.custo)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtBRL(e.preco)}</td>
                      <td style={{ textAlign: 'right' }}><span className="hint">{e.pct}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {sim && (
              <button className="btn" style={{ marginTop: 12 }} disabled={ocupado} onClick={() => gerar(true)}>
                Salvar como proposta R{String((propostas[0]?.versao ?? 0) + 1).padStart(2, '0')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---------- propostas ---------- */}
      {propostas.length > 0 && (
        <div className="panel">
          <div className="hd">
            <h3>Propostas · {propostas.length} versão(ões)</h3>
            <div style={{ display: 'flex', gap: 7 }}>
              <a className="mini" href={`/api/comercial/pdf?proposta=${ultima.id}`} target="_blank" rel="noreferrer">↓ PDF</a>
              {ultima.status !== 'aceita' && !op.obra_id &&
                <button className="btn" disabled={ocupado} onClick={converter}>Ganhou → criar obra</button>}
            </div>
          </div>
          <div className="bd">
            <table className="tab">
              <thead><tr><th>Versão</th><th>Status</th><th style={{ textAlign: 'right' }}>Custo</th><th style={{ textAlign: 'right' }}>Preço</th><th>Criada</th></tr></thead>
              <tbody>
                {propostas.map(p => (
                  <tr key={p.id}>
                    <td><b>R{String(p.versao).padStart(2, '0')}</b></td>
                    <td><span className="hint">{p.status}</span></td>
                    <td style={{ textAlign: 'right' }}>{fmtBRL(p.custo_total)}</td>
                    <td style={{ textAlign: 'right' }}><b>{fmtBRL(p.preco_total)}</b></td>
                    <td><span className="hint">{fmtData(String(p.criado_em).slice(0, 10))}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {itensProposta.length > 0 && (
              <>
                <button className="mini" style={{ marginTop: 10 }} onClick={() => setVerItens(v => !v)}>
                  {verItens ? 'ocultar' : `ver os ${itensProposta.length} itens`}
                </button>
                {verItens && (
                  <div style={{ overflowX: 'auto', marginTop: 8 }}>
                    <table className="tab">
                      <thead><tr><th>Item</th><th>Descrição</th><th>Un</th><th style={{ textAlign: 'right' }}>Qtde</th><th style={{ textAlign: 'right' }}>Custo un.</th><th style={{ textAlign: 'right' }}>Preço total</th></tr></thead>
                      <tbody>
                        {itensProposta.map((i: any) => (
                          <tr key={i.id}>
                            <td><span className="hint">{i.indice_item}</span></td>
                            <td style={{ maxWidth: 340 }}>{i.descricao}</td>
                            <td>{i.unidade}</td>
                            <td style={{ textAlign: 'right' }}>{Number(i.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                            <td style={{ textAlign: 'right' }}>{fmtBRL(i.custo_unitario)}</td>
                            <td style={{ textAlign: 'right' }}>{fmtBRL(i.preco_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
