'use client';
import { useState } from 'react';
import { fmtBRL } from '@/lib/contrato';

const FECHAMENTOS = [
  { id: 'alvenaria_total', nome: 'Alvenaria — bloco de concreto, altura total' },
  { id: 'alvenaria_parcial', nome: 'Alvenaria parcial + isopainel PIR acima' },
  { id: 'isopainel', nome: 'Isopainel PIR 50 mm — altura total' },
  { id: 'tp40', nome: 'Telha TP-40 pintada' },
];
const COBERTURAS = [
  { id: 'tp40_branca', nome: 'Telha TP-40 branca' },
  { id: 'tp40_galvanizada', nome: 'Telha TP-40 galvanizada' },
  { id: 'isotermica_pir', nome: 'Telha isotérmica PIR 30 mm' },
];
const PISOS = [
  { id: 'industrial_20', nome: 'Industrial fck 20 MPa' },
  { id: 'industrial_25', nome: 'Industrial fck 25 MPa' },
  { id: 'industrial_30', nome: 'Industrial fck 30 MPa' },
  { id: 'polido', nome: 'Industrial polido fck 30 MPa' },
  { id: 'nenhum', nome: 'Sem piso' },
];
const PORTAS = [
  { id: 'enrolar', nome: 'De enrolar' },
  { id: 'seccional', nome: 'Seccional' },
  { id: 'pivotante', nome: 'Pivotante' },
  { id: 'social', nome: 'Social' },
];

export default function GalpaoClient({ op }: { op?: any }) {
  const [f, setF] = useState<any>({
    vao: 30, comprimento: 36, altura: 9, espacamento: 6, v0: 30, inclinacao: 10,
    fechamento: 'alvenaria_parcial', altura_alvenaria: 3,
    cobertura: 'isotermica_pir', piso: 'industrial_20', espessura_piso: 14,
    area_laje: '', area_terreno: '', prazo_meses: 5,
    tipo_estaca: 'helice_continua', diametro_estaca_cm: 40,
    perfil_tipico: 'goiania_residual', tem_sondagem: false,
  });
  const [portas, setPortas] = useState<any[]>([{ tipo: 'enrolar', largura: 4, altura: 4.5, quantidade: 1 }]);
  const [camadas, setCamadas] = useState<any[]>([
    { ate: 4, nspt: 4, solo: 'argila' },
    { ate: 8, nspt: 9, solo: 'silte_argiloso' },
    { ate: 12, nspt: 18, solo: 'silte_arenoso' },
    { ate: 20, nspt: 32, solo: 'silte_arenoso' },
  ]);
  const [r, setR] = useState<any>(null);
  const [ocupado, setOcupado] = useState(false);
  const [verMemoria, setVerMemoria] = useState(false);
  const [verItens, setVerItens] = useState(false);

  const num = (v: any) => v === '' || v === null || v === undefined ? null : Number(v);

  async function calcular(gravar = false) {
    setOcupado(true);
    try {
      const res = await fetch('/api/comercial/galpao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oportunidade_id: op?.id, gravar,
          premissas: {
            vao: Number(f.vao), comprimento: Number(f.comprimento), altura: Number(f.altura),
            espacamento: Number(f.espacamento), v0: Number(f.v0), inclinacao: Number(f.inclinacao) / 100,
            fechamento: f.fechamento, altura_alvenaria: num(f.altura_alvenaria),
            cobertura: f.cobertura, piso: f.piso, espessura_piso: num(f.espessura_piso),
            area_laje: num(f.area_laje), area_terreno: num(f.area_terreno),
            prazo_meses: num(f.prazo_meses),
            tipo_estaca: f.tipo_estaca, diametro_estaca_cm: Number(f.diametro_estaca_cm),
            perfil_tipico: f.perfil_tipico, tem_sondagem: f.tem_sondagem,
            camadas_solo: f.tem_sondagem ? camadas.filter((c: any) => c.ate && c.nspt) : null,
            portas: portas.filter(p => p.quantidade > 0),
          },
        }),
      });
      const j = await res.json();
      if (j.erro) { alert(j.erro); setOcupado(false); return; }
      setR(j.orcamento);
      if (gravar) { alert(`Proposta R${String(j.proposta.versao).padStart(2, '0')} criada.`); location.reload(); }
    } catch (e: any) { alert('Falha: ' + e.message); }
    setOcupado(false);
  }

  return (
    <>
      <section className="cock-hero">
        <div className="saud">Orçamento de galpão</div>
        <div className="resumo">
          Estrutura pelo manual Gerdau, fechamento pela geometria, fundação pelas reações do pórtico.
          Cálculo, não índice médio.
        </div>
      </section>

      {/* ---------- geometria ---------- */}
      <div className="panel">
        <div className="hd"><h3>Geometria</h3><span className="hint">é daqui que sai tudo</span></div>
        <div className="bd">
          <div className="form-grid">
            <div className="fg"><label>Vão livre L (m)</label>
              <input type="number" step="0.5" value={f.vao} onChange={e => setF({ ...f, vao: e.target.value })} /></div>
            <div className="fg"><label>Comprimento (m)</label>
              <input type="number" step="0.5" value={f.comprimento} onChange={e => setF({ ...f, comprimento: e.target.value })} /></div>
            <div className="fg"><label>Pé-direito H (m)</label>
              <input type="number" step="0.5" value={f.altura} onChange={e => setF({ ...f, altura: e.target.value })} /></div>
            <div className="fg"><label>Espaçamento entre pórticos B (m)</label>
              <select value={f.espacamento} onChange={e => setF({ ...f, espacamento: e.target.value })}>
                <option value="6">6 m</option><option value="9">9 m</option><option value="12">12 m</option>
              </select></div>
            <div className="fg"><label>Vento V₀ (m/s) — NBR 6123</label>
              <select value={f.v0} onChange={e => setF({ ...f, v0: e.target.value })}>
                <option value="30">30 — Goiás</option><option value="35">35</option>
                <option value="40">40</option><option value="45">45</option>
              </select></div>
            <div className="fg"><label>Inclinação da cobertura (%)</label>
              <input type="number" step="1" value={f.inclinacao} onChange={e => setF({ ...f, inclinacao: e.target.value })} /></div>
            <div className="fg"><label>Área de laje / mezanino (m²)</label>
              <input type="number" step="0.01" value={f.area_laje} onChange={e => setF({ ...f, area_laje: e.target.value })} placeholder="steel deck, se houver" /></div>
            <div className="fg"><label>Área do terreno (m²)</label>
              <input type="number" step="0.01" value={f.area_terreno} onChange={e => setF({ ...f, area_terreno: e.target.value })} placeholder="para limpeza e terraplenagem" /></div>
            <div className="fg"><label>Prazo (meses)</label>
              <input type="number" step="0.5" value={f.prazo_meses} onChange={e => setF({ ...f, prazo_meses: e.target.value })} /></div>
          </div>
        </div>
      </div>

      {/* ---------- composição ---------- */}
      <div className="panel">
        <div className="hd"><h3>Fechamento, cobertura e piso</h3></div>
        <div className="bd">
          <div className="form-grid">
            <div className="fg full"><label>Fechamento</label>
              <select value={f.fechamento} onChange={e => setF({ ...f, fechamento: e.target.value })}>
                {FECHAMENTOS.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select></div>
            {f.fechamento === 'alvenaria_parcial' && (
              <div className="fg"><label>Altura da alvenaria (m)</label>
                <input type="number" step="0.1" value={f.altura_alvenaria} onChange={e => setF({ ...f, altura_alvenaria: e.target.value })} /></div>
            )}
            <div className="fg"><label>Cobertura</label>
              <select value={f.cobertura} onChange={e => setF({ ...f, cobertura: e.target.value })}>
                {COBERTURAS.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select></div>
            <div className="fg"><label>Piso</label>
              <select value={f.piso} onChange={e => setF({ ...f, piso: e.target.value })}>
                {PISOS.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select></div>
            {f.piso !== 'nenhum' && (
              <div className="fg"><label>Espessura do piso (cm)</label>
                <input type="number" step="0.5" value={f.espessura_piso} onChange={e => setF({ ...f, espessura_piso: e.target.value })} /></div>
            )}
          </div>
        </div>
      </div>

      {/* ---------- portas ---------- */}
      <div className="panel">
        <div className="hd">
          <h3>Portas e portões</h3>
          <button className="mini" onClick={() => setPortas(p => [...p, { tipo: 'enrolar', largura: 3, altura: 3, quantidade: 1 }])}>+ adicionar</button>
        </div>
        <div className="bd">
          <p className="hint" style={{ marginBottom: 10 }}>A área das portas é descontada do fechamento — quem esquece isso orça parede onde tem portão.</p>
          <table className="tab">
            <thead><tr><th>Tipo</th><th>Largura (m)</th><th>Altura (m)</th><th>Qtde</th><th style={{ textAlign: 'right' }}>Área</th><th></th></tr></thead>
            <tbody>
              {portas.map((d, i) => (
                <tr key={i}>
                  <td><select value={d.tipo} onChange={e => setPortas(l => l.map((x, j) => j === i ? { ...x, tipo: e.target.value } : x))}
                    style={{ padding: '4px 6px', fontSize: 12 }}>
                    {PORTAS.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                  </select></td>
                  <td><input type="number" step="0.1" value={d.largura} style={{ width: 80, padding: '4px 6px', fontSize: 12 }}
                    onChange={e => setPortas(l => l.map((x, j) => j === i ? { ...x, largura: Number(e.target.value) } : x))} /></td>
                  <td><input type="number" step="0.1" value={d.altura} style={{ width: 80, padding: '4px 6px', fontSize: 12 }}
                    onChange={e => setPortas(l => l.map((x, j) => j === i ? { ...x, altura: Number(e.target.value) } : x))} /></td>
                  <td><input type="number" step="1" value={d.quantidade} style={{ width: 60, padding: '4px 6px', fontSize: 12 }}
                    onChange={e => setPortas(l => l.map((x, j) => j === i ? { ...x, quantidade: Number(e.target.value) } : x))} /></td>
                  <td style={{ textAlign: 'right' }}>{(d.largura * d.altura * d.quantidade).toFixed(1)} m²</td>
                  <td style={{ textAlign: 'right' }}><button className="mini" onClick={() => setPortas(l => l.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              ))}
              {!portas.length && <tr><td colSpan={6}><span className="hint">Nenhuma porta.</span></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- fundação ---------- */}
      <div className="panel">
        <div className="hd"><h3>Fundação</h3></div>
        <div className="bd">
          <p className="hint" style={{ marginBottom: 10 }}>
            As reações vêm do pórtico (manual Gerdau). Mas dimensionar estaca exige <b>sondagem SPT</b> —
            sem o laudo, a capacidade é premissa, não cálculo. A fundação é o item que mais surpreende em obra.
          </p>
          <div className="form-grid">
            <div className="fg"><label>Tipo de estaca</label>
              <select value={f.tipo_estaca} onChange={e => setF({ ...f, tipo_estaca: e.target.value })}>
                <option value="helice_continua">Hélice contínua monitorada</option>
                <option value="escavada">Escavada mecanicamente</option>
                <option value="raiz">Raiz</option>
                <option value="pre_moldada">Pré-moldada de concreto</option>
              </select></div>
            <div className="fg"><label>Diâmetro (cm)</label>
              <select value={f.diametro_estaca_cm} onChange={e => setF({ ...f, diametro_estaca_cm: Number(e.target.value) })}>
                <option value="30">30 cm</option><option value="40">40 cm</option>
                <option value="50">50 cm</option><option value="60">60 cm</option>
                <option value="70">70 cm</option><option value="80">80 cm</option>
              </select></div>
            <div className="fg full"><label>Perfil do solo</label>
              <select value={f.tem_sondagem ? 'sondagem' : f.perfil_tipico}
                onChange={e => {
                  if (e.target.value === 'sondagem') setF({ ...f, tem_sondagem: true });
                  else setF({ ...f, tem_sondagem: false, perfil_tipico: e.target.value });
                }}>
                <option value="goiania_residual">Típico — Goiânia, argila porosa sobre solo residual</option>
                <option value="goiania_raso">Típico — Goiânia, impenetrável raso (otimista)</option>
                <option value="goiania_profundo">Típico — Goiânia, argila espessa (pessimista)</option>
                <option value="sondagem">Tenho a sondagem — informar o SPT</option>
              </select></div>
          </div>

          {f.tem_sondagem && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h4 style={{ fontSize: 11.5 }}>PERFIL DE SONDAGEM (SPT)</h4>
                <button className="mini" onClick={() => setCamadas((c: any) => [...c, { ate: '', nspt: '', solo: 'silte_argiloso' }])}>+ camada</button>
              </div>
              <table className="tab">
                <thead><tr><th>Até a cota (m)</th><th>N-SPT médio</th><th>Solo</th><th></th></tr></thead>
                <tbody>
                  {camadas.map((c: any, i: number) => (
                    <tr key={i}>
                      <td><input type="number" step="0.5" value={c.ate} style={{ width: 90, padding: '4px 6px', fontSize: 12 }}
                        onChange={e => setCamadas((l: any) => l.map((x: any, j: number) => j === i ? { ...x, ate: Number(e.target.value) } : x))} /></td>
                      <td><input type="number" step="1" value={c.nspt} style={{ width: 80, padding: '4px 6px', fontSize: 12 }}
                        onChange={e => setCamadas((l: any) => l.map((x: any, j: number) => j === i ? { ...x, nspt: Number(e.target.value) } : x))} /></td>
                      <td><select value={c.solo} style={{ padding: '4px 6px', fontSize: 12 }}
                        onChange={e => setCamadas((l: any) => l.map((x: any, j: number) => j === i ? { ...x, solo: e.target.value } : x))}>
                        <option value="argila">Argila</option>
                        <option value="silte_argiloso">Silte argiloso</option>
                        <option value="silte_arenoso">Silte arenoso</option>
                        <option value="areia">Areia</option>
                      </select></td>
                      <td style={{ textAlign: 'right' }}><button className="mini" onClick={() => setCamadas((l: any) => l.filter((_: any, j: number) => j !== i))}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint" style={{ marginTop: 6 }}>
                Agrupe o boletim em camadas de N-SPT parecido. A cota é a profundidade final de cada camada.
              </p>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn" disabled={ocupado} onClick={() => calcular(false)}>
          {ocupado ? 'calculando…' : 'Calcular orçamento'}
        </button>
        {r && op && <button className="mini" disabled={ocupado} onClick={() => calcular(true)}>Salvar como proposta</button>}
      </div>

      {/* ---------- resultado ---------- */}
      {r && (
        <>
          <div className="panel" style={{ borderLeft: '3px solid var(--brand)' }}>
            <div className="hd">
              <h3>Resultado</h3>
              <button className="mini" onClick={() => setVerMemoria(v => !v)}>{verMemoria ? 'ocultar' : 'memória de cálculo'}</button>
            </div>
            <div className="bd">
              <div className="cock-strip" style={{ marginBottom: 14 }}>
                <div className="it"><div className="n" style={{ fontSize: 15 }}>{fmtBRL(r.custo_total)}</div><div className="l">Custo</div></div>
                <div className="it"><div className="n" style={{ fontSize: 15 }}>{fmtBRL(r.preco_total - r.custo_total)}</div><div className="l">BDI {r.bdi_efetivo?.toFixed(1)}%</div></div>
                <div className="it"><div className="n" style={{ fontSize: 15 }}>{fmtBRL(r.preco_total)}</div><div className="l">Preço</div></div>
                <div className="it"><div className="n" style={{ fontSize: 15 }}>{fmtBRL(r.preco_m2)}</div><div className="l">Preço / m²</div></div>
              </div>

              {verMemoria && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                  <h4 style={{ fontSize: 11.5, marginBottom: 8 }}>ESTRUTURA — MANUAL GERDAU</h4>
                  <table className="tab" style={{ marginBottom: 12 }}>
                    <tbody>
                      <tr><td>Estágio de ação</td><td><b>{r.estrutura.estagio}</b> <span className="hint">(V₀ {f.v0} m/s · B {f.espacamento} m)</span></td></tr>
                      <tr><td>Viga do pórtico</td><td><b>{r.estrutura.perfis.viga}</b></td></tr>
                      <tr><td>Coluna</td><td><b>{r.estrutura.perfis.coluna}</b></td></tr>
                      <tr><td>Pórticos</td><td>{r.estrutura.n_porticos}</td></tr>
                      <tr><td>Peso da estrutura</td><td><b>{r.estrutura.peso_total_kg.toLocaleString('pt-BR')} kg</b> · {r.estrutura.taxa_kg_m2} kg/m²</td></tr>
                      <tr><td>Reações por base</td><td>
                        Rv {r.estrutura.reacoes.rv1} / {r.estrutura.reacoes.rv2} kN ·
                        Rh {r.estrutura.reacoes.rh1} / {r.estrutura.reacoes.rh2} kN ·
                        Mx {r.estrutura.reacoes.mx1} / {r.estrutura.reacoes.mx2} kN·m
                      </td></tr>
                    </tbody>
                  </table>

                  <h4 style={{ fontSize: 11.5, marginBottom: 8 }}>GEOMETRIA</h4>
                  <table className="tab" style={{ marginBottom: 12 }}>
                    <tbody>
                      <tr><td>Área de projeção</td><td>{r.geometria.areaProjecao} m²</td></tr>
                      <tr><td>Área de cobertura</td><td>{r.geometria.areaCobertura} m² <span className="hint">(inclinada)</span></td></tr>
                      <tr><td>Altura na cumeeira</td><td>{r.geometria.alturaCumeeira} m</td></tr>
                      <tr><td>Fachada bruta</td><td>{r.geometria.areaFachadaBruta} m²</td></tr>
                      <tr><td>Portas</td><td>− {r.geometria.areaPortas} m²</td></tr>
                      <tr><td><b>Fachada a fechar</b></td><td><b>{r.geometria.areaFachadaLiquida} m²</b></td></tr>
                    </tbody>
                  </table>

                  {r.fundacao && (
                    <>
                      <h4 style={{ fontSize: 11.5, marginBottom: 8 }}>
                        FUNDAÇÃO — {r.fundacao.estaca.metodo}
                      </h4>
                      <table className="tab" style={{ marginBottom: 8 }}>
                        <thead><tr><th>Combinação</th><th style={{ textAlign: 'right' }}>N (kN)</th><th style={{ textAlign: 'right' }}>M (kN·m)</th><th style={{ textAlign: 'right' }}>Compressão</th><th style={{ textAlign: 'right' }}>Tração</th></tr></thead>
                        <tbody>
                          <tr><td>Permanente + sobrecarga</td>
                            <td style={{ textAlign: 'right' }}>{r.fundacao.combinacoes.permanente.N}</td>
                            <td style={{ textAlign: 'right' }}>{r.fundacao.combinacoes.permanente.M}</td>
                            <td style={{ textAlign: 'right' }}>{r.fundacao.combinacoes.permanente.compressao}</td>
                            <td style={{ textAlign: 'right' }}>{r.fundacao.combinacoes.permanente.tracao}</td></tr>
                          <tr><td>Permanente + vento</td>
                            <td style={{ textAlign: 'right' }}>{r.fundacao.combinacoes.vento.N}</td>
                            <td style={{ textAlign: 'right' }}>{r.fundacao.combinacoes.vento.M}</td>
                            <td style={{ textAlign: 'right' }}><b>{r.fundacao.combinacoes.vento.compressao}</b></td>
                            <td style={{ textAlign: 'right', color: r.fundacao.combinacoes.vento.tracao < 0 ? 'var(--brand)' : undefined }}>
                              <b>{r.fundacao.combinacoes.vento.tracao}</b></td></tr>
                        </tbody>
                      </table>
                      <table className="tab">
                        <tbody>
                          <tr><td>Estaca</td><td><b>{r.fundacao.estaca.tipo.replace('_', ' ')} Ø{r.fundacao.estaca.diametro_cm} cm × {r.fundacao.estaca.profundidade_m} m</b></td></tr>
                          <tr><td>Condicionante</td><td><b style={{ color: r.fundacao.condicionante.includes('tração') ? 'var(--brand)' : undefined }}>{r.fundacao.condicionante}</b></td></tr>
                          <tr><td>Resistência de ponta</td><td>{r.fundacao.estaca.ponta.R_kn} kN <span className="hint">(N={r.fundacao.estaca.ponta.n_usado}, K={r.fundacao.estaca.ponta.K}, α={r.fundacao.estaca.ponta.alfa})</span></td></tr>
                          <tr><td>Resistência de fuste</td><td>{r.fundacao.estaca.fuste.R_kn} kN</td></tr>
                          <tr><td>Capacidade admissível</td><td><b>{r.fundacao.estaca.R_admissivel_kn} kN ({r.fundacao.estaca.R_admissivel_tf} tf)</b> <span className="hint">FS 2,0</span></td></tr>
                          <tr><td>Capacidade à tração</td><td>{r.fundacao.estaca.cap_tracao_kn} kN <span className="hint">(só fuste + peso próprio)</span></td></tr>
                          <tr><td>Total</td><td>{r.fundacao.n_bases} bases × {r.fundacao.estacas_por_base} = <b>{r.fundacao.metros_estaca} m</b> de estaca</td></tr>
                        </tbody>
                      </table>
                      <h5 style={{ fontSize: 10.5, margin: '8px 0 4px', color: 'var(--gray)' }}>ATRITO LATERAL POR CAMADA</h5>
                      <table className="tab">
                        <thead><tr><th>Trecho</th><th>Solo</th><th style={{ textAlign: 'right' }}>N</th><th style={{ textAlign: 'right' }}>N usado</th><th style={{ textAlign: 'right' }}>rl (kPa)</th><th style={{ textAlign: 'right' }}>Parcela</th></tr></thead>
                        <tbody>
                          {r.fundacao.estaca.fuste.detalhe.map((d: any, i: number) => (
                            <tr key={i}>
                              <td>{d.de} – {d.ate} m</td>
                              <td><span className="hint">{d.solo.replace('_', ' ')}</span></td>
                              <td style={{ textAlign: 'right' }}>{d.nspt}</td>
                              <td style={{ textAlign: 'right' }}>{d.n_usado}{d.nspt > 15 && <span className="hint"> (limite)</span>}</td>
                              <td style={{ textAlign: 'right' }}>{d.rl_kpa}</td>
                              <td style={{ textAlign: 'right' }}>{d.parcela_kn} kN</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!r.fundacao.solo_sondado && (
                        <p style={{ fontSize: 12, marginTop: 8, padding: 8, background: 'var(--brand-soft)', borderRadius: 6, borderLeft: '3px solid var(--brand)' }}>
                          <b>Solo presumido.</b> O método está certo; o dado de entrada é estimativa regional. Numa proposta, isto é risco.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {r.avisos.map((a: string, i: number) => (
                <p key={i} style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 6, paddingLeft: 10, borderLeft: '2px solid var(--brand)' }}>{a}</p>
              ))}

              <table className="tab" style={{ marginTop: 12 }}>
                <thead><tr><th>Etapa</th><th style={{ textAlign: 'right' }}>Custo</th><th style={{ textAlign: 'right' }}>Preço</th><th style={{ textAlign: 'right' }}>%</th></tr></thead>
                <tbody>
                  {r.etapas.map((e: any) => (
                    <tr key={e.etapa}>
                      <td>{e.etapa}</td>
                      <td style={{ textAlign: 'right' }}>{fmtBRL(e.custo)}</td>
                      <td style={{ textAlign: 'right' }}><b>{fmtBRL(e.preco)}</b></td>
                      <td style={{ textAlign: 'right' }}><span className="hint">{e.pct}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button className="mini" style={{ marginTop: 10 }} onClick={() => setVerItens(v => !v)}>
                {verItens ? 'ocultar' : `ver os ${r.itens.length} itens`}
              </button>
              {verItens && (
                <div style={{ overflowX: 'auto', marginTop: 8 }}>
                  <table className="tab">
                    <thead><tr><th>Etapa</th><th>Item</th><th>Un</th><th style={{ textAlign: 'right' }}>Qtde</th><th style={{ textAlign: 'right' }}>Custo un.</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                    <tbody>
                      {r.itens.map((i: any, n: number) => (
                        <tr key={n} style={!i.custo_unitario ? { opacity: .5 } : undefined}>
                          <td><span className="hint">{i.etapa}</span></td>
                          <td style={{ maxWidth: 320 }}>{i.descricao}
                            {i.nota && <div className="hint">{i.nota}</div>}
                            {!i.custo_unitario && <div className="hint" style={{ color: 'var(--brand)' }}>sem preço na base</div>}</td>
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
            </div>
          </div>
        </>
      )}
    </>
  );
}
