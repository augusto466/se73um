'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtBRL, fmtData } from '@/lib/contrato';
import {
  parseOFX, periodoOFX, detectarCabecalhoCSV, sugerirMapeamento, parseLinhasCSV,
  chaveSintetica, candidatosParaLinha, type LinhaExtratoParsed, type MapeamentoCSV,
} from '@/lib/extrato';

export default function ConciliacaoClient({ lancamentosIniciais, obras, extratosIniciais, linhasIniciais }:
  { lancamentosIniciais: any[]; obras: any[]; extratosIniciais: any[]; linhasIniciais: any[] }) {
  const [lancamentos, setLancamentos] = useState(lancamentosIniciais);
  const [extratos, setExtratos] = useState(extratosIniciais);
  const [linhas, setLinhas] = useState(linhasIniciais);
  const [ocupado, setOcupado] = useState(false);
  const supabase = supabaseBrowser();

  // ---- importação ----
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [formato, setFormato] = useState<'ofx' | 'csv' | null>(null);
  const [banco, setBanco] = useState('');
  const [contaIdent, setContaIdent] = useState('');
  const [janelaDias, setJanelaDias] = useState('3');
  const [csvPreview, setCsvPreview] = useState<{ cabecalho: string[]; separador: string; linhasTexto: string[] } | null>(null);
  const [mapeamento, setMapeamento] = useState<MapeamentoCSV | null>(null);
  const [parsedLinhas, setParsedLinhas] = useState<LinhaExtratoParsed[] | null>(null);
  const [periodoDetectado, setPeriodoDetectado] = useState<{ inicio: string | null; fim: string | null }>({ inicio: null, fim: null });

  const nomeObra = (id: number | null) => id ? (obras.find(o => o.id === id)?.codigo ?? '—') : 'Empresa (geral)';
  const lancamentoDe = (id: number | null) => id ? lancamentos.find(l => l.id === id) : undefined;

  function limparImportacao() {
    setArquivo(null); setFormato(null); setCsvPreview(null); setMapeamento(null);
    setParsedLinhas(null); setPeriodoDetectado({ inicio: null, fim: null });
  }

  async function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    limparImportacao();
    setArquivo(f);
    const texto = await f.text();
    const ext = f.name.toLowerCase().split('.').pop() ?? '';
    if (ext === 'ofx' || ext === 'qfx') {
      setFormato('ofx');
      const parsed = parseOFX(texto);
      if (!parsed.length) { alert('Não encontrei nenhuma transação nesse OFX.'); return; }
      setParsedLinhas(parsed);
      setPeriodoDetectado(periodoOFX(texto));
    } else {
      setFormato('csv');
      const { cabecalho, separador, linhas: linhasTexto } = detectarCabecalhoCSV(texto);
      if (!cabecalho.length) { alert('Arquivo CSV vazio ou ilegível.'); return; }
      setCsvPreview({ cabecalho, separador, linhasTexto });
      setMapeamento(sugerirMapeamento(cabecalho));
    }
  }

  function gerarPreviewCSV() {
    if (!csvPreview || !mapeamento) return;
    if (mapeamento.iData < 0 || (mapeamento.iValor < 0 && mapeamento.iDebito < 0 && mapeamento.iCredito < 0)) {
      alert('Escolha ao menos a coluna de Data e a de Valor (ou Débito/Crédito).');
      return;
    }
    const parsed = parseLinhasCSV(csvPreview.linhasTexto, csvPreview.separador, mapeamento);
    if (!parsed.length) { alert('Nenhuma linha válida com esse mapeamento — confira as colunas escolhidas.'); return; }
    setParsedLinhas(parsed);
    const datas = parsed.map(l => l.data).sort();
    setPeriodoDetectado({ inicio: datas[0], fim: datas[datas.length - 1] });
  }

  async function importar() {
    if (!parsedLinhas || !parsedLinhas.length) { alert('Nenhuma linha pronta pra importar.'); return; }
    if (!contaIdent.trim()) { alert('Identifique a conta (ex.: "Itaú — cc 12345-6").'); return; }
    const janela = Number(janelaDias) || 0;

    setOcupado(true);
    const datas = parsedLinhas.map(l => l.data).sort();
    const inicio = periodoDetectado.inicio ?? datas[0];
    const fim = periodoDetectado.fim ?? datas[datas.length - 1];
    const { data: extrato, error } = await supabase.from('extrato_importado').insert({
      banco: banco.trim() || null,
      conta_ident: contaIdent.trim(),
      arquivo_nome: arquivo?.name ?? 'extrato',
      formato,
      periodo: `[${inicio},${fim}]`,
    }).select().single();
    if (error || !extrato) { setOcupado(false); alert(error?.message ?? 'Falha ao registrar a importação.'); return; }

    let importadas = 0, duplicadas = 0;
    const erros: string[] = [];
    const novasLinhas: any[] = [];
    for (const l of parsedLinhas) {
      const candidatos = candidatosParaLinha(l, lancamentos, janela);
      const { data: linha, error: eLinha } = await supabase.from('extrato_linha').insert({
        extrato_id: extrato.id,
        fitid: l.fitid,
        chave_sintetica: chaveSintetica(l.data, l.valor, l.descricao),
        data: l.data, valor: l.valor, descricao: l.descricao, tipo: l.tipo,
        lancamento_id: candidatos.length === 1 ? candidatos[0].id : null,
      }).select().single();
      if (eLinha) {
        if (eLinha.code === '23505') duplicadas++;
        else erros.push(`${l.descricao}: ${eLinha.message}`);
        continue;
      }
      importadas++;
      novasLinhas.push(linha);
    }
    setOcupado(false);
    setExtratos(es => [extrato, ...es]);
    setLinhas(ls => [...novasLinhas, ...ls]);
    limparImportacao();
    setBanco(''); setContaIdent('');
    alert(
      `${importadas} linha(s) importada(s).` +
      (duplicadas ? ` ${duplicadas} já tinham sido importadas antes (puladas).` : '') +
      (erros.length ? ` ${erros.length} erro(s): ${erros.slice(0, 3).join(' · ')}` : '')
    );
  }

  // ---- conciliar ----
  async function confirmar(linha: any, lancamentoId: number) {
    const alvo = linha.tipo === 'debito' ? 'pago' : 'recebido';
    setOcupado(true);
    const { error } = await supabase.from('lancamentos').update({
      status: alvo, pago_em: linha.data, valor_pago: linha.valor, atualizado_em: new Date().toISOString(),
    }).eq('id', lancamentoId);
    if (error) {
      setOcupado(false);
      alert(error.message.includes('divergência')
        ? `Não deu para conciliar: ${error.message} Resolva o recebimento em Materiais e tente de novo.`
        : error.message);
      return;
    }
    const { error: e2 } = await supabase.from('extrato_linha').update({ status: 'conciliado', lancamento_id: lancamentoId }).eq('id', linha.id);
    setOcupado(false);
    if (e2) { alert(e2.message); return; }
    setLancamentos(ls => ls.map(l => l.id === lancamentoId ? { ...l, status: alvo } : l));
    setLinhas(ls => ls.map(l => l.id === linha.id ? { ...l, status: 'conciliado', lancamento_id: lancamentoId } : l));
  }

  async function ignorar(linha: any) {
    if (!confirm(`Ignorar "${linha.descricao}" (${fmtBRL(Number(linha.valor))})? Ex.: tarifa, transferência entre contas próprias — não mexe em nenhum lançamento.`)) return;
    setOcupado(true);
    const { error } = await supabase.from('extrato_linha').update({ status: 'ignorado' }).eq('id', linha.id);
    setOcupado(false);
    if (error) { alert(error.message); return; }
    setLinhas(ls => ls.map(l => l.id === linha.id ? { ...l, status: 'ignorado' } : l));
  }

  async function criarEConciliar(linha: any) {
    setOcupado(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: novoLanc, error } = await supabase.from('lancamentos').insert({
      natureza: linha.tipo === 'debito' ? 'pagar' : 'receber',
      descricao: linha.descricao, valor: linha.valor, vencimento: linha.data,
      status: linha.tipo === 'debito' ? 'pago' : 'recebido',
      pago_em: linha.data, valor_pago: linha.valor,
      origem: 'manual', criado_por: user?.id,
    }).select().single();
    if (error || !novoLanc) { setOcupado(false); alert(error?.message ?? 'Falha ao criar o lançamento.'); return; }
    const { error: e2 } = await supabase.from('extrato_linha').update({ status: 'conciliado', lancamento_id: novoLanc.id }).eq('id', linha.id);
    setOcupado(false);
    if (e2) { alert(e2.message); return; }
    setLancamentos(ls => [...ls, novoLanc]);
    setLinhas(ls => ls.map(l => l.id === linha.id ? { ...l, status: 'conciliado', lancamento_id: novoLanc.id } : l));
  }

  const linhasPendentes = linhas.filter(l => l.status === 'pendente');
  const casadas = linhasPendentes.filter(l => l.lancamento_id);
  const semMatch = linhasPendentes.filter(l => !l.lancamento_id);
  const resolvidas = linhas.filter(l => l.status !== 'pendente')
    .sort((a, b) => b.data.localeCompare(a.data));

  const camposMapeamento: { chave: keyof MapeamentoCSV; label: string }[] = [
    { chave: 'iData', label: 'Data' },
    { chave: 'iDescricao', label: 'Descrição' },
    { chave: 'iValor', label: 'Valor (assinado, +/-)' },
    { chave: 'iDebito', label: 'Débito (se não houver "Valor" único)' },
    { chave: 'iCredito', label: 'Crédito (se não houver "Valor" único)' },
  ];

  return (
    <>
      <h2 className="sec">Conciliação bancária</h2>
      <p className="hint" style={{ marginBottom: 12 }}>
        Importa o extrato (OFX ou CSV) que você baixou do banco — nenhuma conexão automática, nenhuma senha de banco passa por aqui.
        Casa por valor + data (janela de tolerância) com os lançamentos em aberto; nunca concilia sozinho sem candidato único.
      </p>

      <div className="panel">
        <div className="hd"><h3>Importar extrato</h3></div>
        <div className="bd">
          <div className="form-grid">
            <div className="fg"><label>Arquivo (.ofx, .qfx ou .csv)</label>
              <input type="file" accept=".ofx,.qfx,.csv,.txt" onChange={onArquivo} /></div>
            <div className="fg"><label>Banco (opcional)</label>
              <input value={banco} onChange={e => setBanco(e.target.value)} placeholder="Ex.: Itaú" /></div>
            <div className="fg"><label>Conta</label>
              <input value={contaIdent} onChange={e => setContaIdent(e.target.value)} placeholder="Ex.: cc 12345-6" /></div>
            <div className="fg"><label>Janela de tolerância (dias)</label>
              <input type="number" min={0} max={30} value={janelaDias} onChange={e => setJanelaDias(e.target.value)} /></div>
          </div>

          {formato === 'csv' && csvPreview && !parsedLinhas && (
            <div style={{ marginTop: 14 }}>
              <p className="hint" style={{ marginBottom: 8 }}>
                Layout de CSV varia por banco — confira se acertei as colunas (cabeçalho detectado: {csvPreview.cabecalho.join(', ')}).
                Preencha "Valor" OU "Débito"/"Crédito", não precisa dos dois.
              </p>
              <div className="form-grid">
                {camposMapeamento.map(({ chave, label }) => (
                  <div className="fg" key={chave}><label>{label}</label>
                    <select value={mapeamento?.[chave] ?? -1}
                      onChange={e => setMapeamento(m => m ? { ...m, [chave]: Number(e.target.value) } : m)}>
                      <option value={-1}>— nenhuma —</option>
                      {csvPreview.cabecalho.map((c, i) => <option key={i} value={i}>{c}</option>)}
                    </select></div>
                ))}
              </div>
              <button className="btn sec" style={{ marginTop: 10 }} onClick={gerarPreviewCSV}>Pré-visualizar</button>
            </div>
          )}

          {parsedLinhas && (
            <div className="alert info" style={{ marginTop: 14 }}>
              <b>{parsedLinhas.length} linha(s) prontas para importar</b>
              {periodoDetectado.inicio && periodoDetectado.fim
                ? ` — período ${fmtData(periodoDetectado.inicio)} a ${fmtData(periodoDetectado.fim)}.`
                : '.'}
              {' '}Confira acima e clique em Importar.
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <button className="btn" disabled={ocupado || !parsedLinhas} onClick={importar}>
              {ocupado ? 'Importando…' : 'Importar'}
            </button>
          </div>
        </div>
      </div>

      {extratos.length > 0 && (
        <div className="panel">
          <div className="hd"><h3>Importações</h3></div>
          <div className="bd tblwrap">
            <table>
              <thead><tr><th>Arquivo</th><th>Conta</th><th>Formato</th><th>Período</th><th className="num">Linhas</th><th className="num">Pendentes</th></tr></thead>
              <tbody>
                {extratos.map(e => {
                  const desteExtrato = linhas.filter(l => l.extrato_id === e.id);
                  return (
                    <tr key={e.id}>
                      <td>{e.arquivo_nome}</td>
                      <td>{e.banco ? `${e.banco} — ` : ''}{e.conta_ident}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{e.formato.toUpperCase()}</td>
                      <td className="hint">{e.periodo ?? '—'}</td>
                      <td className="num">{desteExtrato.length}</td>
                      <td className="num">{desteExtrato.filter(l => l.status === 'pendente').length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 className="sec">Casadas automaticamente · {casadas.length}</h2>
      <div className="panel">
        {casadas.length === 0 && <div className="bd"><p className="hint">Nenhuma sugestão pendente de confirmação.</p></div>}
        {casadas.map(l => {
          const lanc = lancamentoDe(l.lancamento_id);
          return (
            <div key={l.id} className="dia-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <b>{fmtData(l.data)}</b> · {l.descricao} · <span style={{ color: l.tipo === 'debito' ? 'var(--risk)' : 'var(--ok)', fontWeight: 600 }}>{l.tipo === 'debito' ? '−' : '+'} {fmtBRL(Number(l.valor))}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn" disabled={ocupado} onClick={() => confirmar(l, l.lancamento_id)}>✓ Confirmar</button>
                  <button className="mini danger" disabled={ocupado} onClick={() => ignorar(l)}>ignorar</button>
                </div>
              </div>
              {lanc && (
                <div className="hint">
                  sugestão: <b>{lanc.descricao}</b> · {nomeObra(lanc.obra_id)} · vencimento {fmtData(lanc.vencimento)} · {fmtBRL(Number(lanc.valor))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h2 className="sec">Pendentes (sem candidato claro) · {semMatch.length}</h2>
      <div className="panel">
        {semMatch.length === 0 && <div className="bd"><p className="hint">Nada pendente.</p></div>}
        {semMatch.map(l => {
          const natureza = l.tipo === 'debito' ? 'pagar' : 'receber';
          const abertos = lancamentos.filter(x => x.natureza === natureza);
          return (
            <PendenteLinha key={l.id} linha={l} abertos={abertos} nomeObra={nomeObra} ocupado={ocupado}
              onConfirmar={id => confirmar(l, id)} onIgnorar={() => ignorar(l)} onCriar={() => criarEConciliar(l)} />
          );
        })}
      </div>

      {resolvidas.length > 0 && (
        <div className="panel">
          <div className="hd"><h3>Histórico (conciliadas / ignoradas)</h3></div>
          <div className="bd tblwrap">
            <table>
              <thead><tr><th className="num">Data</th><th>Descrição</th><th className="num">Valor</th><th>Situação</th></tr></thead>
              <tbody>
                {resolvidas.slice(0, 50).map(l => (
                  <tr key={l.id}>
                    <td className="num">{fmtData(l.data)}</td>
                    <td>{l.descricao}</td>
                    <td className="num">{l.tipo === 'debito' ? '−' : '+'} {fmtBRL(Number(l.valor))}</td>
                    <td><span className={`stamp ${l.status === 'conciliado' ? 'st-ok' : 'st-pend'}`}>{l.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function PendenteLinha({ linha, abertos, nomeObra, ocupado, onConfirmar, onIgnorar, onCriar }: {
  linha: any; abertos: any[]; nomeObra: (id: number | null) => string; ocupado: boolean;
  onConfirmar: (id: number) => void; onIgnorar: () => void; onCriar: () => void;
}) {
  const [escolhido, setEscolhido] = useState('');
  return (
    <div className="dia-item critico" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <b>{fmtData(linha.data)}</b> · {linha.descricao} · <span style={{ color: linha.tipo === 'debito' ? 'var(--risk)' : 'var(--ok)', fontWeight: 600 }}>{linha.tipo === 'debito' ? '−' : '+'} {fmtBRL(Number(linha.valor))}</span>
        </div>
        <button className="mini danger" disabled={ocupado} onClick={onIgnorar}>ignorar</button>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={escolhido} onChange={e => setEscolhido(e.target.value)} style={{ minWidth: 260 }}>
          <option value="">— escolher lançamento em aberto —</option>
          {abertos.map(a => (
            <option key={a.id} value={a.id}>
              {a.descricao} · {nomeObra(a.obra_id)} · {fmtData(a.vencimento)} · {fmtBRL(Number(a.valor))}
            </option>
          ))}
        </select>
        <button className="mini" disabled={ocupado || !escolhido} onClick={() => onConfirmar(Number(escolhido))}>✓ confirmar</button>
        <span className="hint">ou</span>
        <button className="mini" disabled={ocupado} onClick={onCriar}>+ criar lançamento a partir desta linha</button>
      </div>
    </div>
  );
}
