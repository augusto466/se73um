'use client';
import { useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtBRL, fmtPct, fmtData } from '@/lib/contrato';
import { LANC_STATUS, ORIGEM_LABEL, TIPO_LABEL, situacao, parseNum, projetarCaixa } from '@/lib/financeiro';

type Aba = 'agenda' | 'pagar' | 'receber' | 'fluxo' | 'dre' | 'recorrentes';

export default function FinanceiroClient({ lancamentos, categorias, obras, saldoInicial, dre, recorrentes, papel }:
  { lancamentos: any[]; categorias: any[]; obras: any[]; saldoInicial: number; dre: any[]; recorrentes: any[]; papel: string }) {

  const [lancs, setLancs] = useState(lancamentos);
  const [recs, setRecs] = useState(recorrentes);
  const [saldo, setSaldo] = useState(saldoInicial);
  const [aba, setAba] = useState<Aba>('agenda');
  const [filtroObra, setFiltroObra] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [novo, setNovo] = useState(false);
  const supabase = supabaseBrowser();
  const ehAdmin = papel === 'admin';
  const hoje = new Date().toISOString().slice(0, 10);

  const vis = useMemo(
    () => lancs.filter(l => !filtroObra || String(l.obra_id) === filtroObra),
    [lancs, filtroObra]);

  const abertos = vis.filter(l => ['previsto', 'confirmado'].includes(l.status));
  const aPagar = abertos.filter(l => l.natureza === 'pagar');
  const aReceber = abertos.filter(l => l.natureza === 'receber');
  const vencidos = abertos.filter(l => l.vencimento < hoje);
  const somaP = aPagar.reduce((s, l) => s + Number(l.valor), 0);
  const somaR = aReceber.reduce((s, l) => s + Number(l.valor), 0);
  const em30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const p30 = aPagar.filter(l => l.vencimento <= em30).reduce((s, l) => s + Number(l.valor), 0);
  const r30 = aReceber.filter(l => l.vencimento <= em30).reduce((s, l) => s + Number(l.valor), 0);
  const projecao = useMemo(() => projetarCaixa(abertos, saldo, 12), [abertos, saldo]);
  const menorSaldo = projecao.length ? Math.min(...projecao.map(p => p.saldo)) : saldo;

  const nomeObra = (id: number | null) => id ? (obras.find(o => o.id === id)?.codigo ?? '—') : 'Empresa (geral)';
  const nomeCat = (id: string | null) => categorias.find(c => c.id === id)?.nome ?? '—';

  async function quitar(l: any) {
    const alvo = l.natureza === 'pagar' ? 'pago' : 'recebido';
    const v = prompt(`Valor efetivamente ${alvo}:`, String(Number(l.valor).toFixed(2)).replace('.', ','));
    if (v === null) return;
    setOcupado(true);
    const { error } = await supabase.from('lancamentos').update({
      status: alvo, pago_em: hoje, valor_pago: parseNum(v), atualizado_em: new Date().toISOString(),
    }).eq('id', l.id);
    setOcupado(false);
    if (error) { alert('Apenas o administrador pode baixar lançamentos.'); return; }
    setLancs(ls => ls.map(x => x.id === l.id ? { ...x, status: alvo, pago_em: hoje, valor_pago: parseNum(v) } : x));
  }

  async function mudarStatus(l: any, status: string) {
    setOcupado(true);
    const { error } = await supabase.from('lancamentos').update({ status, atualizado_em: new Date().toISOString() }).eq('id', l.id);
    setOcupado(false);
    if (error) { alert('Sem permissão.'); return; }
    setLancs(ls => ls.map(x => x.id === l.id ? { ...x, status } : x));
  }

  async function salvarSaldo() {
    const v = prompt('Saldo atual em caixa/banco (R$):', String(saldo).replace('.', ','));
    if (v === null) return;
    const n = parseNum(v);
    const { error } = await supabase.from('caixa_config').update({ saldo_inicial: n, data_saldo: hoje }).eq('id', 1);
    if (error) { alert('Apenas administradores.'); return; }
    setSaldo(n);
  }

  async function gerarRecorrentes() {
    setOcupado(true);
    const { data, error } = await supabase.rpc('gerar_recorrentes', { p_meses: 3 });
    setOcupado(false);
    if (error) { alert(error.message); return; }
    alert(`${data} lançamento(s) gerado(s) para os próximos 3 meses. Recarregue a página.`);
    location.reload();
  }

  const AbaBtn = ({ id, children }: { id: Aba; children: React.ReactNode }) => (
    <button className={`subtab ${aba === id ? 'on' : ''}`} onClick={() => setAba(id)}>{children}</button>
  );

  const Linha = ({ l }: { l: any }) => {
    const [lbl, cls] = LANC_STATUS[l.status] ?? ['?', 'st-pend'];
    const sit = situacao(l);
    return (
      <tr style={sit === 'vencido' ? { background: 'var(--risk-soft)' } : sit === 'vence_semana' ? { background: 'var(--warn-soft)' } : undefined}>
        <td className="num" style={{ color: sit === 'vencido' ? 'var(--risk)' : undefined, fontWeight: sit === 'vencido' ? 600 : 400 }}>
          {fmtData(l.vencimento)}{sit === 'vencido' ? ' ⚠' : ''}
        </td>
        <td><b>{l.descricao}</b><div className="hint">{l.contraparte ?? '—'} · {nomeCat(l.categoria_id)} · <i>{ORIGEM_LABEL[l.origem]}</i></div></td>
        <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{nomeObra(l.obra_id)}</td>
        <td className="num" style={{ color: l.natureza === 'receber' ? 'var(--ok)' : 'var(--ink)', fontWeight: 600 }}>
          {l.natureza === 'receber' ? '+' : '−'} {fmtBRL(Number(l.valor))}
        </td>
        <td><span className={`stamp ${cls}`}><span className="dot" />{lbl}</span></td>
        {ehAdmin && (
          <td style={{ whiteSpace: 'nowrap' }}>
            {['previsto', 'confirmado'].includes(l.status) && <>
              <button className="mini" disabled={ocupado} onClick={() => quitar(l)}>✓ baixar</button>{' '}
              {l.status === 'previsto' && <button className="mini" disabled={ocupado} onClick={() => mudarStatus(l, 'confirmado')}>confirmar</button>}{' '}
              <button className="mini danger" disabled={ocupado} onClick={() => mudarStatus(l, 'cancelado')}>cancelar</button>
            </>}
            {['pago', 'recebido'].includes(l.status) && <button className="mini" disabled={ocupado} onClick={() => mudarStatus(l, 'previsto')}>↺ reabrir</button>}
          </td>
        )}
      </tr>
    );
  };

  const Tabela = ({ itens, vazio }: { itens: any[]; vazio: string }) => (
    <div className="tblwrap"><table>
      <thead><tr><th className="num">Vencimento</th><th>Descrição</th><th>Obra</th><th className="num">Valor</th><th>Status</th>{ehAdmin && <th>Ações</th>}</tr></thead>
      <tbody>
        {itens.map(l => <Linha key={l.id} l={l} />)}
        {itens.length === 0 && <tr><td colSpan={ehAdmin ? 6 : 5} className="hint">{vazio}</td></tr>}
      </tbody>
    </table></div>
  );

  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
        <div className="kpi blu">
          <div className="lbl">Saldo em caixa</div>
          <div className="val">{fmtBRL(saldo)}</div>
          <div className="foot">{ehAdmin ? <button className="mini" onClick={salvarSaldo}>atualizar saldo</button> : 'posição atual'}</div>
        </div>
        <div className="kpi okk"><div className="lbl">A receber (30 dias)</div><div className="val">{fmtBRL(r30)}</div><div className="foot">total em aberto: {fmtBRL(somaR)}</div></div>
        <div className="kpi wrn"><div className="lbl">A pagar (30 dias)</div><div className="val">{fmtBRL(p30)}</div><div className="foot">total em aberto: {fmtBRL(somaP)}</div></div>
        <div className={`kpi ${r30 - p30 >= 0 ? 'okk' : 'acc'}`}><div className="lbl">Resultado 30 dias</div><div className="val">{r30 - p30 >= 0 ? '+' : ''}{fmtBRL(r30 - p30)}</div><div className="foot">entradas − saídas previstas</div></div>
        <div className={`kpi ${menorSaldo < 0 ? 'acc' : 'okk'}`}><div className="lbl">Menor saldo projetado</div><div className="val">{fmtBRL(menorSaldo)}</div><div className="foot">nas próximas 12 semanas</div></div>
      </div>

      {menorSaldo < 0 && (
        <div className="alert risk" style={{ marginTop: 12 }}>
          <b>⚠ Projeção indica caixa negativo</b>
          Nas próximas 12 semanas o saldo chega a {fmtBRL(menorSaldo)}. Antecipe recebíveis, renegocie vencimentos ou reprograme compras.
        </div>
      )}
      {vencidos.length > 0 && (
        <div className="alert warn" style={{ marginTop: menorSaldo < 0 ? 0 : 12 }}>
          <b>{vencidos.length} lançamento(s) vencido(s) em aberto</b>
          {fmtBRL(vencidos.reduce((s, l) => s + Number(l.valor), 0))} — veja a Agenda.
        </div>
      )}

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="hd">
          <div className="subtabs">
            <AbaBtn id="agenda">Agenda de pagamentos</AbaBtn>
            <AbaBtn id="pagar">Contas a pagar</AbaBtn>
            <AbaBtn id="receber">Contas a receber</AbaBtn>
            <AbaBtn id="fluxo">Fluxo de caixa</AbaBtn>
            <AbaBtn id="dre">DRE por obra</AbaBtn>
            {ehAdmin && <AbaBtn id="recorrentes">Recorrentes</AbaBtn>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={filtroObra} onChange={e => setFiltroObra(e.target.value)}
              style={{ border: '1px solid var(--line-strong)', borderRadius: 4, padding: '6px 8px', background: 'var(--paper)' }}>
              <option value="">Todas as obras</option>
              {obras.map(o => <option key={o.id} value={o.id}>{o.codigo}</option>)}
            </select>
            {ehAdmin && <button className="btn" onClick={() => setNovo(n => !n)}>{novo ? 'Fechar' : '+ Lançamento'}</button>}
          </div>
        </div>

        {novo && ehAdmin && (
          <div className="bd" style={{ borderBottom: '1px solid var(--line)' }}>
            <NovoLancamento categorias={categorias} obras={obras} onCriar={l => { setLancs(ls => [...ls, l].sort((a, b) => a.vencimento.localeCompare(b.vencimento))); setNovo(false); }} />
          </div>
        )}

        <div className="bd">
          {aba === 'agenda' && (() => {
            const em7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
            const semana = abertos.filter(l => l.vencimento <= em7).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
            const pagarSem = semana.filter(l => l.natureza === 'pagar').reduce((s, l) => s + Number(l.valor), 0);
            const recSem = semana.filter(l => l.natureza === 'receber').reduce((s, l) => s + Number(l.valor), 0);
            return (
              <>
                <p className="hint" style={{ marginBottom: 10 }}>
                  Vencidos e a vencer nos próximos 7 dias. <b>Saídas:</b> {fmtBRL(pagarSem)} · <b>Entradas:</b> {fmtBRL(recSem)} · <b>Resultado:</b> {fmtBRL(recSem - pagarSem)}
                </p>
                <Tabela itens={semana} vazio="Nada vencendo nos próximos 7 dias. 🎉" />
              </>
            );
          })()}

          {aba === 'pagar' && <Tabela itens={aPagar.sort((a, b) => a.vencimento.localeCompare(b.vencimento))} vazio="Nenhuma conta a pagar em aberto." />}
          {aba === 'receber' && <Tabela itens={aReceber.sort((a, b) => a.vencimento.localeCompare(b.vencimento))} vazio="Nenhuma conta a receber em aberto." />}

          {aba === 'fluxo' && (
            <>
              <p className="hint" style={{ marginBottom: 10 }}>Projeção semanal a partir do saldo informado, considerando previstos e confirmados.</p>
              <div className="tblwrap"><table>
                <thead><tr><th>Semana</th><th className="num">Entradas</th><th className="num">Saídas</th><th className="num">Resultado</th><th className="num">Saldo projetado</th><th>Curva</th></tr></thead>
                <tbody>
                  {projecao.map((p, i) => {
                    const maxAbs = Math.max(...projecao.map(x => Math.abs(x.saldo)), 1);
                    return (
                      <tr key={i} style={p.saldo < 0 ? { background: 'var(--risk-soft)' } : undefined}>
                        <td style={{ fontFamily: 'var(--mono)' }}>{p.rotulo}</td>
                        <td className="num" style={{ color: 'var(--ok)' }}>{p.entra ? fmtBRL(p.entra) : '—'}</td>
                        <td className="num" style={{ color: 'var(--risk)' }}>{p.sai ? fmtBRL(p.sai) : '—'}</td>
                        <td className="num">{fmtBRL(p.entra - p.sai)}</td>
                        <td className="num" style={{ fontWeight: 600, color: p.saldo < 0 ? 'var(--risk)' : 'var(--ink)' }}>{fmtBRL(p.saldo)}</td>
                        <td><div className="bar"><i className={p.saldo >= 0 ? 'g' : ''} style={{ width: `${Math.abs(p.saldo) / maxAbs * 100}%`, background: p.saldo < 0 ? 'var(--risk)' : undefined }} /></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </>
          )}

          {aba === 'dre' && (
            <>
              <p className="hint" style={{ marginBottom: 10 }}>Receita medida × custo apropriado por obra (regime de caixa previsto). Margem real de cada contrato.</p>
              <div className="tblwrap"><table>
                <thead><tr><th>Obra</th><th className="num">Valor global</th><th className="num">Receita medida</th><th className="num">Custo apropriado</th><th className="num">Margem bruta</th><th className="num">Margem %</th></tr></thead>
                <tbody>
                  {dre.map(d => (
                    <tr key={d.obra_id}>
                      <td><b>{d.codigo}</b><div className="hint">{d.nome}</div></td>
                      <td className="num">{fmtBRL(Number(d.valor_global))}</td>
                      <td className="num" style={{ color: 'var(--ok)' }}>{fmtBRL(Number(d.receita_medida))}</td>
                      <td className="num" style={{ color: 'var(--risk)' }}>{fmtBRL(Number(d.custo_apropriado))}</td>
                      <td className="num" style={{ fontWeight: 600, color: Number(d.margem_bruta) < 0 ? 'var(--risk)' : 'var(--ok)' }}>{fmtBRL(Number(d.margem_bruta))}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{fmtPct(Number(d.margem_pct))}</td>
                    </tr>
                  ))}
                  {dre.length === 0 && <tr><td colSpan={6} className="hint">Sem dados ainda.</td></tr>}
                </tbody>
              </table></div>
              <p className="hint" style={{ marginTop: 8 }}>Custos administrativos gerais (sem obra vinculada) não entram aqui — veja o fluxo de caixa consolidado.</p>
            </>
          )}

          {aba === 'recorrentes' && ehAdmin && (
            <Recorrentes recs={recs} setRecs={setRecs} categorias={categorias} obras={obras} onGerar={gerarRecorrentes} ocupado={ocupado} />
          )}
        </div>
      </div>
    </>
  );
}

/* ---------------- Novo lançamento ---------------- */
function NovoLancamento({ categorias, obras, onCriar }: { categorias: any[]; obras: any[]; onCriar: (l: any) => void }) {
  const supabase = supabaseBrowser();
  const [f, setF] = useState({
    natureza: 'pagar', obra_id: '', categoria_id: 'cd_material', descricao: '', contraparte: '',
    documento: '', valor: '', vencimento: '', total_parcelas: '1',
  });
  const [ocupado, setOcupado] = useState(false);

  async function criar() {
    if (!f.descricao.trim() || !f.valor || !f.vencimento) { alert('Preencha descrição, valor e vencimento.'); return; }
    setOcupado(true);
    const { data: { user } } = await supabase.auth.getUser();
    const n = Math.max(1, Number(f.total_parcelas) || 1);
    const valorParcela = parseNum(f.valor) / n;
    const linhas = Array.from({ length: n }, (_, i) => {
      const d = new Date(f.vencimento + 'T12:00:00'); d.setMonth(d.getMonth() + i);
      return {
        obra_id: f.obra_id ? Number(f.obra_id) : null, natureza: f.natureza, categoria_id: f.categoria_id,
        descricao: n > 1 ? `${f.descricao.trim()} (${i + 1}/${n})` : f.descricao.trim(),
        contraparte: f.contraparte.trim() || null, documento: f.documento.trim() || null,
        valor: valorParcela, vencimento: d.toISOString().slice(0, 10), competencia: d.toISOString().slice(0, 10),
        status: 'previsto', parcela: i + 1, total_parcelas: n, origem: 'manual', criado_por: user?.id,
      };
    });
    const { data, error } = await supabase.from('lancamentos').insert(linhas).select();
    setOcupado(false);
    if (error) { alert(error.message); return; }
    (data ?? []).forEach(onCriar);
    setF({ ...f, descricao: '', contraparte: '', documento: '', valor: '', total_parcelas: '1' });
  }

  const cats = categorias.filter(c => f.natureza === 'receber' ? c.tipo === 'receita' : c.tipo !== 'receita');

  return (
    <div className="form-grid">
      <div className="fg"><label>Tipo</label>
        <select value={f.natureza} onChange={e => setF({ ...f, natureza: e.target.value, categoria_id: e.target.value === 'receber' ? 'rec_outras' : 'cd_material' })}>
          <option value="pagar">Conta a pagar</option><option value="receber">Conta a receber</option>
        </select></div>
      <div className="fg"><label>Obra / centro de custo</label>
        <select value={f.obra_id} onChange={e => setF({ ...f, obra_id: e.target.value })}>
          <option value="">Empresa (sem obra)</option>
          {obras.map(o => <option key={o.id} value={o.id}>{o.codigo}</option>)}
        </select></div>
      <div className="fg"><label>Categoria</label>
        <select value={f.categoria_id} onChange={e => setF({ ...f, categoria_id: e.target.value })}>
          {cats.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select></div>
      <div className="fg"><label>Fornecedor / cliente</label><input value={f.contraparte} onChange={e => setF({ ...f, contraparte: e.target.value })} /></div>
      <div className="fg" style={{ gridColumn: 'span 2' }}><label>Descrição</label><input value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} placeholder="Ex.: Aluguel do escritório" /></div>
      <div className="fg"><label>Documento (NF/PC)</label><input value={f.documento} onChange={e => setF({ ...f, documento: e.target.value })} /></div>
      <div className="fg"><label>Valor total (R$)</label><input value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} placeholder="0,00" /></div>
      <div className="fg"><label>1º vencimento</label><input type="date" value={f.vencimento} onChange={e => setF({ ...f, vencimento: e.target.value })} /></div>
      <div className="fg"><label>Parcelas (mensais)</label><input type="number" min={1} value={f.total_parcelas} onChange={e => setF({ ...f, total_parcelas: e.target.value })} /></div>
      <div className="fg" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={criar} disabled={ocupado}>{ocupado ? 'Salvando…' : 'Lançar'}</button></div>
    </div>
  );
}

/* ---------------- Recorrentes ---------------- */
function Recorrentes({ recs, setRecs, categorias, obras, onGerar, ocupado }:
  { recs: any[]; setRecs: (f: any) => void; categorias: any[]; obras: any[]; onGerar: () => void; ocupado: boolean }) {
  const supabase = supabaseBrowser();
  const [f, setF] = useState({ descricao: '', contraparte: '', categoria_id: 'da_escritorio', obra_id: '', valor: '', dia_vencimento: '5', inicio: new Date().toISOString().slice(0, 10) });

  async function criar() {
    if (!f.descricao.trim() || !f.valor) { alert('Preencha descrição e valor.'); return; }
    const { data, error } = await supabase.from('recorrentes').insert({
      descricao: f.descricao.trim(), contraparte: f.contraparte.trim() || null,
      categoria_id: f.categoria_id, obra_id: f.obra_id ? Number(f.obra_id) : null,
      valor: parseNum(f.valor), dia_vencimento: Number(f.dia_vencimento) || 5,
      inicio: f.inicio, natureza: 'pagar', ativo: true,
    }).select().single();
    if (error) { alert(error.message); return; }
    setRecs((r: any[]) => [...r, data]);
    setF({ ...f, descricao: '', contraparte: '', valor: '' });
  }

  async function alternar(r: any) {
    const { error } = await supabase.from('recorrentes').update({ ativo: !r.ativo }).eq('id', r.id);
    if (!error) setRecs((rs: any[]) => rs.map(x => x.id === r.id ? { ...x, ativo: !x.ativo } : x));
  }

  return (
    <>
      <p className="hint" style={{ marginBottom: 10 }}>Despesas fixas (aluguel, folha, software, pró-labore). Cadastre uma vez e gere os lançamentos dos próximos meses com um clique.</p>
      <div className="form-grid" style={{ marginBottom: 12 }}>
        <div className="fg" style={{ gridColumn: 'span 2' }}><label>Descrição</label><input value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} placeholder="Ex.: Aluguel do escritório" /></div>
        <div className="fg"><label>Fornecedor</label><input value={f.contraparte} onChange={e => setF({ ...f, contraparte: e.target.value })} /></div>
        <div className="fg"><label>Categoria</label>
          <select value={f.categoria_id} onChange={e => setF({ ...f, categoria_id: e.target.value })}>
            {categorias.filter(c => c.tipo !== 'receita').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select></div>
        <div className="fg"><label>Obra (opcional)</label>
          <select value={f.obra_id} onChange={e => setF({ ...f, obra_id: e.target.value })}>
            <option value="">Empresa (sem obra)</option>
            {obras.map(o => <option key={o.id} value={o.id}>{o.codigo}</option>)}
          </select></div>
        <div className="fg"><label>Valor mensal (R$)</label><input value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} placeholder="0,00" /></div>
        <div className="fg"><label>Dia do vencimento</label><input type="number" min={1} max={28} value={f.dia_vencimento} onChange={e => setF({ ...f, dia_vencimento: e.target.value })} /></div>
        <div className="fg"><label>Início</label><input type="date" value={f.inicio} onChange={e => setF({ ...f, inicio: e.target.value })} /></div>
        <div className="fg" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={criar}>Cadastrar</button></div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="btn sec" onClick={onGerar} disabled={ocupado}>Gerar lançamentos dos próximos 3 meses</button>
      </div>

      <div className="tblwrap"><table>
        <thead><tr><th>Descrição</th><th>Fornecedor</th><th>Obra</th><th className="num">Valor</th><th className="num">Dia</th><th>Situação</th><th>Ação</th></tr></thead>
        <tbody>
          {recs.map(r => (
            <tr key={r.id} style={!r.ativo ? { opacity: .5 } : undefined}>
              <td><b>{r.descricao}</b></td>
              <td>{r.contraparte ?? '—'}</td>
              <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{r.obra_id ? (obras.find(o => o.id === r.obra_id)?.codigo ?? '—') : 'Empresa'}</td>
              <td className="num">{fmtBRL(Number(r.valor))}</td>
              <td className="num">dia {r.dia_vencimento}</td>
              <td>{r.ativo ? <span className="stamp st-ok"><span className="dot" />ATIVA</span> : <span className="stamp st-pend"><span className="dot" />INATIVA</span>}</td>
              <td><button className="mini" onClick={() => alternar(r)}>{r.ativo ? 'desativar' : 'reativar'}</button></td>
            </tr>
          ))}
          {recs.length === 0 && <tr><td colSpan={7} className="hint">Nenhuma despesa recorrente cadastrada.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}
