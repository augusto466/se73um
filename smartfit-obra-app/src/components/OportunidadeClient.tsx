'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import GalpaoClient from './GalpaoClient';
import EnviarProposta from './EnviarProposta';
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
  const [metodo, setMetodo] = useState<'engenharia' | 'parametrico'>('engenharia');
  const [enviando, setEnviando] = useState(false);
  const [itens, setItens] = useState(itensProposta);
  const [editando, setEditando] = useState<number | null>(null);
  const [edicao, setEdicao] = useState<any>({});
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

  async function salvarItem(item: any) {
    setOcupado(true);
    try {
      const r = await fetch('/api/comercial/base', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: item.id,
          quantidade: edicao.quantidade !== undefined ? Number(edicao.quantidade) : undefined,
          custo_unitario: edicao.custo_unitario !== undefined ? Number(edicao.custo_unitario) : undefined,
          bdi_pct: edicao.bdi_pct !== undefined ? Number(edicao.bdi_pct) / 100 : undefined,
        }),
      });
      const j = await r.json();
      if (j.erro) { alert(j.erro); setOcupado(false); return; }
      setEditando(null); setEdicao({});
      location.reload();
    } catch (e: any) { alert('Falha: ' + e.message); }
    setOcupado(false);
  }

  async function removerItem(item: any) {
    if (!confirm(`Remover "${item.descricao.slice(0, 60)}" da proposta?`)) return;
    setOcupado(true);
    try {
      const r = await fetch('/api/comercial/base', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id, remover: true }),
      });
      const j = await r.json();
      if (j.erro) { alert(j.erro); setOcupado(false); return; }
      setItens(l => l.filter((x: any) => x.id !== item.id));
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

      {/* ---------- escolha do método ---------- */}
      <div className="panel">
        <div className="hd">
          <div className="subtabs">
            <button className={`subtab ${metodo === 'engenharia' ? 'on' : ''}`} onClick={() => setMetodo('engenharia')}>Galpão por engenharia</button>
            <button className={`subtab ${metodo === 'parametrico' ? 'on' : ''}`} onClick={() => setMetodo('parametrico')}>Paramétrico (índice médio)</button>
          </div>
        </div>
        <div className="bd">
          <p className="hint">
            {metodo === 'engenharia'
              ? 'Estrutura pelas tabelas do manual Gerdau, fechamento pela geometria com desconto de porta, fundação por Décourt-Quaresma (NBR 6122). Use quando for galpão em pórtico e você tiver as dimensões.'
              : 'Multiplica os índices de uma obra anterior pela área nova. Serve para uma primeira conversa, quando ainda não há dimensões — mas erra quando a obra é diferente.'}
          </p>
        </div>
      </div>

      {metodo === 'engenharia' && <GalpaoClient op={op} />}

      {/* ---------- premissas (paramétrico) ---------- */}
      {metodo === 'parametrico' && (
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

      )}

      {/* ---------- resultado (paramétrico) ---------- */}
      {metodo === 'parametrico' && res && (
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
              {ultima.status !== 'aceita' && (
                <button className="mini" onClick={() => setEnviando(e => !e)}>{enviando ? 'fechar' : '✉ Enviar ao cliente'}</button>
              )}
              {ultima.status !== 'aceita' && !op.obra_id &&
                <button className="btn" disabled={ocupado} onClick={converter}>Ganhou → criar obra</button>}
            </div>
          </div>
          <div className="bd">
            {enviando && <EnviarProposta propostaId={ultima.id} onFechar={() => setEnviando(false)} />}
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

            {itens.length > 0 && (
              <>
                <button className="mini" style={{ marginTop: 10 }} onClick={() => setVerItens(v => !v)}>
                  {verItens ? 'ocultar' : `ver os ${itens.length} itens`}
                </button>
                {verItens && (
                  <div style={{ overflowX: 'auto', marginTop: 8 }}>
                    <p className="hint" style={{ marginBottom: 6 }}>
                      O motor propõe; você ajusta. Clique em <b>editar</b> para mudar quantidade, custo ou BDI de um item.
                      {ultima.status === 'aceita' && ' Proposta aceita não se edita — crie uma nova versão.'}
                    </p>
                    <table className="tab">
                      <thead><tr><th>Item</th><th>Descrição</th><th>Un</th><th style={{ textAlign: 'right' }}>Qtde</th><th style={{ textAlign: 'right' }}>Custo un.</th><th style={{ textAlign: 'right' }}>BDI</th><th style={{ textAlign: 'right' }}>Preço total</th><th></th></tr></thead>
                      <tbody>
                        {itens.map((i: any) => {
                          const emEdicao = editando === i.id;
                          const ajustado = i.origem === 'ajustado';
                          return (
                            <tr key={i.id} style={ajustado ? { background: 'var(--brand-soft)' } : undefined}>
                              <td><span className="hint">{i.indice_item}</span></td>
                              <td style={{ maxWidth: 300 }}>{i.descricao}
                                {ajustado && <div className="hint" style={{ color: 'var(--brand)' }}>ajustado à mão</div>}</td>
                              <td>{i.unidade}</td>
                              <td style={{ textAlign: 'right' }}>
                                {emEdicao
                                  ? <input type="number" step="0.01" defaultValue={i.quantidade}
                                      onChange={e => setEdicao({ ...edicao, quantidade: e.target.value })}
                                      style={{ width: 90, padding: '3px 5px', fontSize: 11, textAlign: 'right' }} />
                                  : Number(i.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {emEdicao
                                  ? <input type="number" step="0.01" defaultValue={i.custo_unitario}
                                      onChange={e => setEdicao({ ...edicao, custo_unitario: e.target.value })}
                                      style={{ width: 90, padding: '3px 5px', fontSize: 11, textAlign: 'right' }} />
                                  : fmtBRL(i.custo_unitario)}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {emEdicao
                                  ? <input type="number" step="1" defaultValue={(Number(i.bdi_pct) * 100).toFixed(0)}
                                      onChange={e => setEdicao({ ...edicao, bdi_pct: e.target.value })}
                                      style={{ width: 55, padding: '3px 5px', fontSize: 11, textAlign: 'right' }} />
                                  : <span className="hint">{(Number(i.bdi_pct) * 100).toFixed(0)}%</span>}
                              </td>
                              <td style={{ textAlign: 'right' }}><b>{fmtBRL(i.preco_total)}</b></td>
                              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                {ultima.status !== 'aceita' && (emEdicao
                                  ? <>
                                      <button className="mini" disabled={ocupado} onClick={() => salvarItem(i)}>salvar</button>
                                      <button className="mini" onClick={() => { setEditando(null); setEdicao({}); }}>✕</button>
                                    </>
                                  : <>
                                      <button className="mini" onClick={() => { setEditando(i.id); setEdicao({}); }}>editar</button>
                                      <button className="mini" onClick={() => removerItem(i)}>✕</button>
                                    </>)}
                              </td>
                            </tr>
                          );
                        })}
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
