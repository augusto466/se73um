'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

const ROTULO: Record<string, string> = {
  desconectado: 'Desconectado', aguardando_qr: 'Leia o QR', conectando: 'Conectando',
  conectado: 'Conectado', banido: 'BANIDO', erro: 'Erro',
};
const COR: Record<string, string> = {
  conectado: 'var(--ok)', aguardando_qr: 'var(--warn)', conectando: 'var(--warn)',
  banido: 'var(--brand)', erro: 'var(--brand)', desconectado: 'var(--gray)',
};

const ICONE: Record<string, string> = {
  audio: '🎤', imagem: '📷', video: '🎬', documento: '📎',
};

/** Quantas mensagens a thread carrega por vez. Conversa de fornecedor tem
 *  milhares — puxar tudo trava o navegador e ninguém rola até lá. */
const PAGINA = 40;

function quando(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  if (mesmoDia) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const ano = d.getFullYear() === hoje.getFullYear();
  return d.toLocaleDateString('pt-BR', ano ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function diaCheio(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Mídia vive em bucket privado: a URL é assinada sob demanda e expira. */
function Midia({ path, tipo }: { path: string; tipo: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/whatsapp/midia?path=${encodeURIComponent(path)}`)
      .then(r => r.json())
      .then(j => { if (vivo) j.url ? setUrl(j.url) : setErro(true); })
      .catch(() => vivo && setErro(true));
    return () => { vivo = false; };
  }, [path]);

  if (erro) return <span className="hint">[anexo indisponível]</span>;
  if (!url) return <span className="hint">carregando…</span>;

  if (tipo === 'imagem') {
    return <img src={url} alt="" style={{ maxWidth: 260, borderRadius: 8, display: 'block', cursor: 'pointer' }}
      onClick={() => window.open(url, '_blank')} />;
  }
  if (tipo === 'audio') {
    return <audio controls src={url} style={{ height: 34, maxWidth: 240 }} />;
  }
  if (tipo === 'video') {
    return <video controls src={url} style={{ maxWidth: 260, borderRadius: 8, display: 'block' }} />;
  }
  return <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>Abrir anexo</a>;
}

function Bolha({ m }: { m: any }) {
  const minha = m.direcao === 'saida';
  return (
    <div style={{ display: 'flex', justifyContent: minha ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
      <div style={{
        maxWidth: '76%', padding: '7px 10px', borderRadius: 10,
        background: minha ? 'var(--brand-soft)' : 'var(--surface-2)',
        borderTopRightRadius: minha ? 2 : 10,
        borderTopLeftRadius: minha ? 10 : 2,
      }}>
        {m.jid?.endsWith('@g.us') && !minha && m.autor_nome && (
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand)', marginBottom: 2 }}>{m.autor_nome}</div>
        )}

        {m.midia_path && <div style={{ marginBottom: m.texto || m.transcricao ? 6 : 0 }}>
          <Midia path={m.midia_path} tipo={m.tipo} />
        </div>}

        {!m.midia_path && m.tipo !== 'texto' && (
          <div className="hint" style={{ marginBottom: 4 }}>
            {ICONE[m.tipo] ?? ''} {m.do_historico ? 'anexo não baixado (histórico)' : 'anexo indisponível'}
          </div>
        )}

        {m.texto && <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.texto}</div>}

        {m.transcricao && (
          <div style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid var(--line)' }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>{m.transcricao}</div>
            {/* Transcrição é aproximação: nome próprio e sotaque de canteiro
                saem errados. Marcar evita que vire citação no lugar do áudio. */}
            <div className="hint" style={{ fontSize: 10.5, marginTop: 3 }}>transcrito automaticamente — pode conter erros</div>
          </div>
        )}

        {m.transcricao_erro && <div className="hint" style={{ fontSize: 10.5, marginTop: 3, color: 'var(--warn)' }}>falha ao transcrever</div>}

        <div className="hint" style={{ fontSize: 10.5, marginTop: 3, textAlign: 'right' }}>
          {quando(m.enviada_em ?? m.criado_em)}
        </div>
      </div>
    </div>
  );
}

export default function WhatsappClient({ instancia: inicial, contatos: contatosIniciais, colaboradores }:
  { instancia: any; contatos: any[]; colaboradores: any[] }) {
  const [inst, setInst] = useState(inicial);
  const [contatos, setContatos] = useState(contatosIniciais);
  const [ativo, setAtivo] = useState<any>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [temMais, setTemMais] = useState(true);
  const [rascunho, setRascunho] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [leu, setLeu] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const supabase = supabaseBrowser();

  // ---------- polling do status (QR muda a cada ~55s)
  useEffect(() => {
    if (!inst?.id) return;
    const t = setInterval(async () => {
      const { data } = await supabase.from('wa_instancias').select('*').eq('id', inst.id).maybeSingle();
      if (data) setInst(data);
    }, ['aguardando_qr', 'conectando'].includes(inst?.status) ? 3000 : 15000);
    return () => clearInterval(t);
  }, [inst?.id, inst?.status, supabase]);

  // ---------- realtime: mensagem nova entra na thread e reordena a lista
  useEffect(() => {
    if (inst?.status !== 'conectado') return;
    const canal = supabase.channel('wa-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_mensagens' }, (p: any) => {
        const m = p.new;
        if (m.do_historico) return;   // sync não deve pipocar na tela
        if (ativo && m.jid === ativo.jid) setMsgs(l => [...l, m]);
        setContatos(l => {
          const i = l.findIndex(c => c.jid === m.jid);
          if (i < 0) return l;
          const c = {
            ...l[i],
            ultima_em: m.enviada_em ?? m.criado_em,
            ultima_previa: m.texto ?? m.transcricao ?? `${ICONE[m.tipo] ?? ''} ${m.tipo}`,
            nao_lidas: ativo?.jid === m.jid ? 0 : (l[i].nao_lidas ?? 0) + (m.direcao === 'entrada' ? 1 : 0),
          };
          return [c, ...l.filter((_, j) => j !== i)];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [supabase, inst?.status, ativo?.jid]);

  // ---------- abre a conversa
  const abrir = useCallback(async (c: any) => {
    setAtivo(c); setMsgs([]); setTemMais(true); setCarregando(true);
    const { data } = await supabase.from('wa_mensagens').select('*')
      .eq('jid', c.jid)
      .order('enviada_em', { ascending: false, nullsFirst: false })
      .limit(PAGINA);
    setMsgs((data ?? []).reverse());
    setTemMais((data?.length ?? 0) === PAGINA);
    setCarregando(false);

    if (c.nao_lidas > 0) {
      await supabase.from('wa_contatos').update({ nao_lidas: 0 }).eq('id', c.id);
      setContatos(l => l.map(x => x.id === c.id ? { ...x, nao_lidas: 0 } : x));
    }
  }, [supabase]);

  // ---------- rola para o fim ao abrir
  useEffect(() => { fim.current?.scrollIntoView(); }, [ativo?.jid, carregando]);

  async function carregaAntigas() {
    if (!ativo || !msgs.length || carregando) return;
    setCarregando(true);
    const maisVelha = msgs[0];
    const { data } = await supabase.from('wa_mensagens').select('*')
      .eq('jid', ativo.jid)
      .lt('enviada_em', maisVelha.enviada_em ?? maisVelha.criado_em)
      .order('enviada_em', { ascending: false, nullsFirst: false })
      .limit(PAGINA);
    setMsgs(l => [...(data ?? []).reverse(), ...l]);
    setTemMais((data?.length ?? 0) === PAGINA);
    setCarregando(false);
  }

  async function enviar() {
    const t = rascunho.trim();
    if (!t || !ativo || enviando) return;
    setEnviando(true);
    try {
      const r = await fetch('/api/whatsapp/enviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ para_jid: ativo.jid, texto: t, instancia_id: inst.id }),
      });
      const j = await r.json();
      if (j.erro) { alert(j.erro); setEnviando(false); return; }
      setRascunho('');
      // A mensagem só existe de fato quando o serviço envia — o realtime a
      // traz. Fingir que já foi seria mentir sobre o que o WhatsApp recebeu.
    } catch (e: any) { alert('Falha: ' + e.message); }
    setEnviando(false);
  }

  async function acao(a: string, extra: any = {}) {
    setOcupado(true);
    try {
      const r = await fetch('/api/whatsapp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: a, instancia_id: inst?.id, ...extra }),
      });
      const j = await r.json();
      if (j.erro) { alert(j.erro); setOcupado(false); return; }
      if (j.instancia) setInst(j.instancia);
      if (j.aviso) alert(j.aviso);
      const { data } = await supabase.from('wa_instancias').select('*').eq('id', j.instancia?.id ?? inst?.id).maybeSingle();
      if (data) setInst(data);
    } catch (e: any) { alert('Falha: ' + e.message); }
    setOcupado(false);
  }

  async function ligarContato(id: number, colaborador_id: string) {
    const r = await fetch('/api/whatsapp', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contato_id: id, colaborador_id: colaborador_id || null }),
    });
    const j = await r.json();
    if (j.erro) { alert(j.erro); return; }
    setContatos(l => l.map(c => c.id === id ? { ...c, colaborador_id: colaborador_id ? Number(colaborador_id) : null } : c));
  }

  // ---------- sem instância
  if (!inst) {
    return (
      <>
        <section className="cock-hero">
          <div className="saud">WhatsApp</div>
          <div className="resumo">Ligue a comunicação do dia a dia ao sistema. Leia o aviso antes.</div>
        </section>
        <div className="panel">
          <div className="bd">
            <p className="hint" style={{ marginBottom: 12 }}>Nenhuma instância criada.</p>
            <button className="btn" disabled={ocupado} onClick={() => acao('criar')}>Criar instância</button>
          </div>
        </div>
      </>
    );
  }

  // ---------- aceite de risco
  if (!inst.risco_aceito) {
    return (
      <>
        <section className="cock-hero">
          <div className="saud">Antes de conectar</div>
          <div className="resumo">Leia com atenção. Isto não é formalidade.</div>
        </section>
        <div className="panel" style={{ borderLeft: '3px solid var(--brand)' }}>
          <div className="hd"><h3>O risco</h3></div>
          <div className="bd" style={{ fontSize: 13.5, lineHeight: 1.7 }}>
            <p style={{ marginBottom: 12 }}>
              Conectar o WhatsApp por QR usa uma biblioteca <b>não-oficial</b>. Isso <b>viola os Termos de
              Serviço da Meta</b>.
            </p>
            <p style={{ marginBottom: 12 }}>
              <b>O número pode ser banido</b> — sem aviso, sem prazo, e sem recurso prático além do formulário
              de contestação deles, que costuma não responder.
            </p>
            <p style={{ marginBottom: 12 }}>
              Se este número é o que a equipe usa para tudo, o dano de um banimento vai muito além do sistema:
              some o histórico, os grupos, os contatos.
            </p>
            <p style={{ marginBottom: 16 }}>
              Não existe forma de eliminar esse risco. O que dá para fazer — e o serviço faz — é reduzir:
              cadência lenta e irregular, sem disparo em massa.
            </p>
            <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 8, marginBottom: 14 }}>
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={leu} onChange={e => setLeu(e.target.checked)} style={{ marginTop: 3 }} />
                <span>Li e entendi. Aceito o risco de o número ser banido e assumo essa decisão.</span>
              </label>
            </div>
            <button className="btn" disabled={!leu || ocupado} onClick={() => acao('aceitar_risco')}>
              Aceitar e prosseguir
            </button>
            <p className="hint" style={{ marginTop: 10 }}>
              O aceite fica registrado com a data, o usuário e o IP.
            </p>
          </div>
        </div>
      </>
    );
  }

  // ---------- não conectado: mantém a tela de conexão
  if (inst.status !== 'conectado') {
    return (
      <>
        <section className="cock-hero">
          <div className="saud">WhatsApp</div>
          <div className="resumo">
            {inst.status === 'banido'
              ? <>O número foi <b>banido</b>. Era o risco que você aceitou.</>
              : 'Leia o QR com o celular que tem o número da obra.'}
          </div>
          <div className="cock-strip">
            <div className="it"><div className="n" style={{ fontSize: 15, color: COR[inst.status] }}>{ROTULO[inst.status]}</div><div className="l">Status</div></div>
            <div className="it"><div className="n">{contatos.length}</div><div className="l">Conversas</div></div>
          </div>
        </section>

        <div className="panel">
          <div className="hd">
            <h3>Conexão</h3>
            {inst.status !== 'banido' && (
              <button className="btn" disabled={ocupado} onClick={() => acao('conectar')}>
                {ocupado ? '…' : 'Conectar'}
              </button>
            )}
          </div>
          <div className="bd">
            {inst.status === 'aguardando_qr' && inst.qr_code && (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ background: '#fff', padding: 12, borderRadius: 10, display: 'inline-block' }}>
                  <img src={inst.qr_code} alt="QR" style={{ width: 260, height: 260, display: 'block' }} />
                </div>
                <p className="hint" style={{ marginTop: 12, maxWidth: 380, margin: '12px auto 0' }}>
                  WhatsApp → <b>Dispositivos conectados</b> → <b>Conectar dispositivo</b>. O código expira em cerca
                  de um minuto e se renova sozinho.
                </p>
              </div>
            )}
            {inst.status === 'conectando' && <p className="hint">Conectando…</p>}
            {inst.status === 'banido' && (
              <div style={{ padding: 12, background: 'var(--brand-soft)', borderRadius: 8, borderLeft: '3px solid var(--brand)' }}>
                <b style={{ fontSize: 13 }}>O número foi banido pela Meta.</b>
                <p className="hint" style={{ marginTop: 6 }}>
                  Não há recurso automático. O caminho é o formulário de contestação da Meta, e a taxa de resposta
                  é baixa. Para voltar a usar o sistema, será preciso outro número.
                </p>
              </div>
            )}
            {inst.status === 'desconectado' && <p className="hint">Clique em Conectar para gerar o QR.</p>}
            {inst.ultimo_erro && <p className="hint" style={{ marginTop: 8, color: 'var(--brand)' }}>{inst.ultimo_erro}</p>}
          </div>
        </div>
      </>
    );
  }

  // ---------- inbox
  const filtrados = busca.trim()
    ? contatos.filter(c => (c.nome_wa ?? '').toLowerCase().includes(busca.toLowerCase()) || c.numero?.includes(busca))
    : contatos;

  const semSinal = inst.visto_em && Date.now() - new Date(inst.visto_em).getTime() > 120000;

  return (
    <>
      <section className="cock-hero" style={{ paddingBottom: 14 }}>
        <div className="saud">WhatsApp</div>
        <div className="resumo">
          Conectado no número <b>{inst.numero}</b>.
          {semSinal && <b style={{ color: 'var(--brand)' }}> Sem sinal do serviço há mais de 2 min.</b>}
        </div>
      </section>

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', height: 'calc(100vh - 210px)', minHeight: 460 }}>

          {/* ---------- lista de conversas ---------- */}
          <div style={{
            width: 300, flexShrink: 0, borderRight: '1px solid var(--line)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: 10, borderBottom: '1px solid var(--line)' }}>
              <input
                placeholder="Buscar conversa"
                value={busca} onChange={e => setBusca(e.target.value)}
                style={{ width: '100%', padding: '6px 9px', fontSize: 12.5 }}
              />
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filtrados.map(c => (
                <div key={c.id} onClick={() => abrir(c)}
                  style={{
                    padding: '9px 11px', borderBottom: '1px solid var(--line)', cursor: 'pointer',
                    background: ativo?.id === c.id ? 'var(--surface-2)' : 'transparent',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'baseline' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.nome_wa ?? c.numero}
                    </div>
                    <div className="hint" style={{ fontSize: 10.5, flexShrink: 0 }}>{quando(c.ultima_em)}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center', marginTop: 2 }}>
                    <div className="hint" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.eh_grupo && '👥 '}{c.ultima_previa ?? '—'}
                    </div>
                    {c.nao_lidas > 0 && (
                      <span style={{
                        background: 'var(--brand)', color: '#fff', fontSize: 10, fontWeight: 700,
                        borderRadius: 9, padding: '1px 6px', flexShrink: 0,
                      }}>{c.nao_lidas}</span>
                    )}
                  </div>
                </div>
              ))}
              {!filtrados.length && <p className="hint" style={{ padding: 14 }}>Nenhuma conversa.</p>}
            </div>
          </div>

          {/* ---------- thread ---------- */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {!ativo ? (
              <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
                <p className="hint">Escolha uma conversa.</p>
              </div>
            ) : (
              <>
                <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{ativo.nome_wa ?? ativo.numero}</div>
                    <div className="hint" style={{ fontSize: 11 }}>
                      {ativo.eh_grupo ? 'grupo' : ativo.numero}
                    </div>
                  </div>
                  {!ativo.eh_grupo && (
                    <select value={ativo.colaborador_id ?? ''}
                      onChange={e => { ligarContato(ativo.id, e.target.value); setAtivo({ ...ativo, colaborador_id: e.target.value ? Number(e.target.value) : null }); }}
                      style={{ padding: '3px 6px', fontSize: 11.5, flexShrink: 0 }}>
                      <option value="">— não ligado —</option>
                      {colaboradores.map(k => <option key={k.id} value={k.id}>{k.nome}</option>)}
                    </select>
                  )}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
                  {temMais && (
                    <div style={{ textAlign: 'center', marginBottom: 10 }}>
                      <button className="mini" disabled={carregando} onClick={carregaAntigas}>
                        {carregando ? '…' : 'Carregar anteriores'}
                      </button>
                    </div>
                  )}
                  {msgs.map((m, i) => {
                    const dia = diaCheio(m.enviada_em ?? m.criado_em);
                    const diaAnt = i > 0 ? diaCheio(msgs[i - 1].enviada_em ?? msgs[i - 1].criado_em) : null;
                    return (
                      <div key={m.id}>
                        {dia !== diaAnt && (
                          <div style={{ textAlign: 'center', margin: '10px 0 8px' }}>
                            <span className="hint" style={{ fontSize: 10.5, background: 'var(--surface-2)', padding: '2px 9px', borderRadius: 8 }}>{dia}</span>
                          </div>
                        )}
                        <Bolha m={m} />
                      </div>
                    );
                  })}
                  <div ref={fim} />
                </div>

                <div style={{ padding: 10, borderTop: '1px solid var(--line)', display: 'flex', gap: 7, alignItems: 'flex-end' }}>
                  <textarea
                    value={rascunho} onChange={e => setRascunho(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                    placeholder="Escreva. Enter envia, Shift+Enter quebra linha."
                    rows={1}
                    style={{ flex: 1, padding: '7px 10px', fontSize: 12.5, resize: 'none', maxHeight: 90, minHeight: 34 }}
                  />
                  <button className="btn" disabled={enviando || !rascunho.trim()} onClick={enviar}>
                    {enviando ? '…' : 'Enviar'}
                  </button>
                </div>
                <div className="hint" style={{ padding: '0 12px 8px', fontSize: 10.5 }}>
                  O envio é lento de propósito — leva alguns segundos e sai pela fila.
                  Mensagem de WhatsApp é <b>informação, nunca ordem</b>: o advisor lê e propõe, quem confirma é você.
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}