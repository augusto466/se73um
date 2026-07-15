'use client';
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { HexMark } from './Marca';

type Acao = { id: string; tool: string; rotulo: string; input: any; detalhe?: any; status: 'pendente' | 'executada' | 'descartada' | 'erro' };
type Msg = { role: 'user' | 'assistant'; content: string; acoes?: Acao[] };
type AnexoLocal = { tipo: 'pdf' | 'imagem' | 'texto'; nome: string; media_type?: string; dados: string };

const SUGESTOES = [
  'Onde estou perdendo dinheiro agora?',
  'O que eu deveria decidir hoje, na ordem?',
  'Tem algo que eu não estou vendo?',
  'Meu caixa aguenta os próximos 3 meses?',
  'O que o acervo diz sobre o piso industrial?',
];

const TAM_MAX_ANEXO = 2.5 * 1024 * 1024;

export default function Advisor() {
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [txt, setTxt] = useState('');
  const [pensando, setPensando] = useState(false);
  const [statusVivo, setStatusVivo] = useState('');
  const [conversaId, setConversaId] = useState<number | null>(null);
  const [verHist, setVerHist] = useState(false);
  const [historico, setHistorico] = useState<any[]>([]);
  const [anexos, setAnexos] = useState<AnexoLocal[]>([]);
  const fim = useRef<HTMLDivElement>(null);
  const supabase = supabaseBrowser();

  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, pensando, statusVivo]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setAberto(a => !a); }
      if (e.key === 'Escape') setAberto(false);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  function novaConversa() {
    setMsgs([]); setConversaId(null); setAnexos([]); setVerHist(false);
  }

  async function carregarHistorico() {
    const { data } = await supabase.from('advisor_conversas')
      .select('id, titulo, atualizado_em').order('atualizado_em', { ascending: false }).limit(25);
    setHistorico(data ?? []);
    setVerHist(true);
  }

  async function abrirConversa(id: number) {
    const { data } = await supabase.from('advisor_mensagens')
      .select('role, content, acoes').eq('conversa_id', id).order('id');
    setMsgs((data ?? []).map((m: any) => ({
      role: m.role, content: m.content,
      acoes: (m.acoes ?? []).map((a: any) => ({ ...a, status: a.status === 'pendente' ? 'descartada' : a.status })),
    })));
    setConversaId(id); setVerHist(false);
  }

  async function apagarConversa(id: number) {
    if (!confirm('Apagar esta conversa?')) return;
    await supabase.from('advisor_conversas').delete().eq('id', id);
    setHistorico(h => h.filter(c => c.id !== id));
    if (id === conversaId) novaConversa();
  }

  async function escolherAnexos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 3 - anexos.length);
    for (const f of files) {
      if (f.size > TAM_MAX_ANEXO) { alert(`"${f.name}" passa de 2,5 MB — envie um arquivo menor.`); continue; }
      const ext = f.name.toLowerCase().split('.').pop() ?? '';
      if (ext === 'pdf' || f.type === 'application/pdf') {
        setAnexos(a => [...a, { tipo: 'pdf', nome: f.name, dados: '' }]);
        lerBase64(f).then(d => setAnexos(a => a.map(x => x.nome === f.name && !x.dados ? { ...x, dados: d } : x)));
      } else if (f.type.startsWith('image/')) {
        setAnexos(a => [...a, { tipo: 'imagem', nome: f.name, media_type: f.type, dados: '' }]);
        lerBase64(f).then(d => setAnexos(a => a.map(x => x.nome === f.name && !x.dados ? { ...x, dados: d } : x)));
      } else if (['txt', 'csv', 'md', 'log'].includes(ext)) {
        const texto = await f.text();
        setAnexos(a => [...a, { tipo: 'texto', nome: f.name, dados: texto }]);
      } else {
        alert(`"${f.name}": formato não suportado no chat. Use PDF, imagem, CSV ou TXT.`);
      }
    }
    e.target.value = '';
  }

  function lerBase64(f: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1] ?? '');
      r.onerror = () => rej(new Error('Falha ao ler o arquivo.'));
      r.readAsDataURL(f);
    });
  }

  async function confirmarAcao(idxMsg: number, acao: Acao) {
    const marcar = (status: Acao['status']) =>
      setMsgs(ms => ms.map((m, i) => i !== idxMsg ? m : {
        ...m, acoes: (m.acoes ?? []).map(a => a.id === acao.id ? { ...a, status } : a),
      }));
    try {
      const r = await fetch('/api/advisor/acao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: acao.tool, input: acao.input, conversa_id: conversaId }),
      });
      const j = await r.json();
      if (j.erro) { marcar('erro'); alert(j.erro); return; }
      marcar('executada');
      setMsgs(ms => [...ms, { role: 'assistant', content: `✓ ${j.resultado}` }]);
    } catch { marcar('erro'); alert('Falha ao executar. Tente de novo.'); }
  }

  async function enviar(pergunta?: string) {
    const q = (pergunta ?? txt).trim();
    if (!q || pensando) return;
    if (anexos.some(a => !a.dados)) { alert('Aguarde o carregamento dos anexos.'); return; }

    const enviados = anexos;
    const rotuloAnexos = enviados.length ? ` 📎 ${enviados.map(a => a.nome).join(', ')}` : '';
    const novas: Msg[] = [...msgs, { role: 'user', content: q + rotuloAnexos }];
    setMsgs(novas); setTxt(''); setAnexos([]); setPensando(true); setStatusVivo('');

    let texto = '';
    const acoes: Acao[] = [];
    const idxResposta = novas.length;

    const atualizar = () =>
      setMsgs([...novas, { role: 'assistant', content: texto, acoes: acoes.length ? [...acoes] : undefined }]);

    try {
      const r = await fetch('/api/advisor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversa_id: conversaId,
          mensagens: [...msgs.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: q }],
          anexos: enviados,
        }),
      });

      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        setMsgs([...novas, { role: 'assistant', content: `⚠ ${j.erro ?? 'Não consegui responder agora.'}` }]);
        setPensando(false); return;
      }

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const linhas = buf.split('\n');
        buf = linhas.pop() ?? '';
        for (const linha of linhas) {
          if (!linha.trim()) continue;
          let ev: any; try { ev = JSON.parse(linha); } catch { continue; }
          if (ev.t === 'meta' && ev.conversa_id) setConversaId(ev.conversa_id);
          else if (ev.t === 'txt') { texto += ev.v; setStatusVivo(''); atualizar(); }
          else if (ev.t === 'busca') setStatusVivo(`buscando no acervo: "${ev.v}"`);
          else if (ev.t === 'acao') { acoes.push({ ...ev.v }); atualizar(); }
          else if (ev.t === 'erro') { texto += (texto ? '\n\n' : '') + `⚠ ${ev.v}`; atualizar(); }
        }
      }
      if (!texto && !acoes.length) setMsgs([...novas, { role: 'assistant', content: '⚠ Não consegui responder agora. Tente de novo.' }]);
    } catch {
      setMsgs([...novas, { role: 'assistant', content: '⚠ Não consegui responder agora. Tente de novo.' }]);
    }
    setStatusVivo(''); setPensando(false);
    void idxResposta;
  }

  return (
    <>
      {!aberto && (
        <button className="adv-fab" onClick={() => setAberto(true)} aria-label="Abrir advisor">
          <HexMark size={20} cor="#fff" />
          <span>Advisor</span>
          <kbd>Ctrl K</kbd>
        </button>
      )}

      {aberto && (
        <aside className="adv" role="dialog" aria-label="Advisor">
          <header className="adv-hd">
            <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
              <HexMark size={20} />
              <div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13 }}>Advisor</div>
                <div style={{ fontSize: 10, color: 'var(--gray)' }}>lê seus dados e o acervo em tempo real</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <button className="mini" title="Conversas anteriores" onClick={() => verHist ? setVerHist(false) : carregarHistorico()}>{verHist ? 'voltar' : 'histórico'}</button>
              {(msgs.length > 0 || conversaId) && <button className="mini" onClick={novaConversa}>+ nova</button>}
              <button className="mini" onClick={() => setAberto(false)}>✕</button>
            </div>
          </header>

          <div className="adv-bd">
            {verHist && (
              <div>
                <p className="hint" style={{ marginBottom: 10 }}>Suas conversas ficam salvas — retome de onde parou.</p>
                {!historico.length && <p style={{ fontSize: 13 }}>Nenhuma conversa salva ainda.</p>}
                {historico.map(c => (
                  <div key={c.id} className="adv-hist">
                    <button className="adv-hist-t" onClick={() => abrirConversa(c.id)}>
                      <span>{c.titulo}</span>
                      <span className="hint">{new Date(c.atualizado_em).toLocaleDateString('pt-BR')}</span>
                    </button>
                    <button className="mini" onClick={() => apagarConversa(c.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {!verHist && msgs.length === 0 && (
              <div className="adv-vazio">
                <p style={{ fontSize: 13, marginBottom: 4 }}>Pergunte sobre a operação. Eu leio as obras, medições, compras, caixa, contrato e o acervo antes de responder — e posso criar tarefas, rotinas e registrar decisões, sempre com a sua confirmação.</p>
                <p className="hint" style={{ marginBottom: 14 }}>Não invento número: se não tiver base, eu digo.</p>
                {SUGESTOES.map(s => (
                  <button key={s} className="adv-sug" onClick={() => enviar(s)}>{s}</button>
                ))}
              </div>
            )}

            {!verHist && msgs.map((m, i) => (
              <div key={i} className={`adv-msg ${m.role}`}>
                {m.role === 'assistant' && <div className="adv-av"><HexMark size={13} /></div>}
                <div style={{ maxWidth: '88%' }}>
                  {m.content && <div className="adv-txt">{m.content}</div>}
                  {(m.acoes ?? []).map(a => (
                    <div key={a.id} className={`adv-acao ${a.status}`}>
                      <div className="adv-acao-r">{a.rotulo}</div>

                      {a.detalhe?.tipo === 'pedido' && (
                        <div className="adv-ped">
                          <div className="adv-ped-t">{a.detalhe.titulo}</div>
                          <div className="hint" style={{ marginBottom: 7 }}>
                            {a.detalhe.evento_id ? `evento ${a.detalhe.evento_id}` : 'sem evento vinculado'}
                            {a.detalhe.necessidade ? ` · necessidade em obra ${new Date(a.detalhe.necessidade + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                          </div>
                          {(a.detalhe.cotacoes ?? []).map((c: any, k: number) => (
                            <div key={k} className={`adv-cot ${c.vencedora ? 'venc' : ''}`}>
                              <div>
                                <b>{c.fornecedor}</b>{c.vencedora && <span className="st st-ok" style={{ marginLeft: 6 }}>ESCOLHIDA</span>}
                                <div className="hint">{c.prazo ?? 'prazo ?'} · {c.condicoes ?? 'pagamento ?'}</div>
                              </div>
                              <b>{(c.valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</b>
                            </div>
                          ))}
                          {a.detalhe.orcado && (
                            <div className="hint" style={{ marginTop: 7 }}>
                              Orçado para {a.detalhe.orcado.etapa}: {(a.detalhe.orcado.valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                              {a.detalhe.valor > a.detalhe.orcado.valor
                                ? ` · esta compra passa o orçado em ${(a.detalhe.valor - a.detalhe.orcado.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}`
                                : ` · consumo de ${((a.detalhe.valor / a.detalhe.orcado.valor) * 100).toFixed(0)}%`}
                            </div>
                          )}
                        </div>
                      )}
                      {a.status === 'pendente' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn adv-acao-ok" onClick={() => confirmarAcao(i, a)}>Confirmar</button>
                          <button className="mini" onClick={() =>
                            setMsgs(ms => ms.map((x, j) => j !== i ? x : { ...x, acoes: (x.acoes ?? []).map(y => y.id === a.id ? { ...y, status: 'descartada' } : y) }))
                          }>Descartar</button>
                        </div>
                      )}
                      {a.status === 'executada' && <span className="hint" style={{ color: 'var(--ok, #2e9e5b)' }}>✓ executada</span>}
                      {a.status === 'descartada' && <span className="hint">descartada</span>}
                      {a.status === 'erro' && <span className="hint" style={{ color: 'var(--brand)' }}>falhou — tente pela tela correspondente</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {!verHist && pensando && (
              <div className="adv-msg assistant">
                <div className="adv-av"><HexMark size={13} /></div>
                <div className="adv-txt adv-pensando">{statusVivo || 'lendo seus dados'}<span>.</span><span>.</span><span>.</span></div>
              </div>
            )}
            <div ref={fim} />
          </div>

          {!verHist && (
            <form className="adv-ft" onSubmit={e => { e.preventDefault(); enviar(); }}>
              <div style={{ flex: 1 }}>
                {anexos.length > 0 && (
                  <div className="adv-anexos">
                    {anexos.map(a => (
                      <span key={a.nome} className="adv-chip">
                        📎 {a.nome}{!a.dados && '…'}
                        <button type="button" onClick={() => setAnexos(x => x.filter(y => y.nome !== a.nome))}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
                <textarea
                  value={txt} onChange={e => setTxt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                  placeholder="Pergunte qualquer coisa sobre a operação…" rows={2} disabled={pensando} />
              </div>
              <label className="mini adv-clip" title="Anexar PDF, imagem, CSV ou TXT (até 2,5 MB)">
                📎<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.csv,.txt,.md" style={{ display: 'none' }} onChange={escolherAnexos} disabled={pensando || anexos.length >= 3} />
              </label>
              <button className="btn" disabled={pensando || !txt.trim()}>↑</button>
            </form>
          )}
        </aside>
      )}
    </>
  );
}
