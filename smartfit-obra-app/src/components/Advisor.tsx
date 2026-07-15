'use client';
import { useEffect, useRef, useState } from 'react';
import { HexMark } from './Marca';

type Msg = { role: 'user' | 'assistant'; content: string };

const SUGESTOES = [
  'Onde estou perdendo dinheiro agora?',
  'O que eu deveria decidir hoje, na ordem?',
  'Tem algo que eu não estou vendo?',
  'Meu caixa aguenta os próximos 3 meses?',
  'Qual o maior risco contratual aberto?',
];

export default function Advisor() {
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [txt, setTxt] = useState('');
  const [pensando, setPensando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, pensando]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setAberto(a => !a); }
      if (e.key === 'Escape') setAberto(false);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  async function enviar(pergunta?: string) {
    const q = (pergunta ?? txt).trim();
    if (!q || pensando) return;
    const novas: Msg[] = [...msgs, { role: 'user', content: q }];
    setMsgs(novas); setTxt(''); setPensando(true);
    try {
      const r = await fetch('/api/advisor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagens: novas }),
      });
      const j = await r.json();
      setMsgs([...novas, { role: 'assistant', content: j.erro ? `⚠ ${j.erro}` : j.resposta }]);
    } catch (e: any) {
      setMsgs([...novas, { role: 'assistant', content: '⚠ Não consegui responder agora. Tente de novo.' }]);
    }
    setPensando(false);
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
                <div style={{ fontSize: 10, color: 'var(--gray)' }}>lê seus dados em tempo real</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {msgs.length > 0 && <button className="mini" onClick={() => setMsgs([])}>limpar</button>}
              <button className="mini" onClick={() => setAberto(false)}>✕</button>
            </div>
          </header>

          <div className="adv-bd">
            {msgs.length === 0 && (
              <div className="adv-vazio">
                <p style={{ fontSize: 13, marginBottom: 4 }}>Pergunte sobre a operação. Eu leio as obras, medições, compras, caixa e contrato antes de responder.</p>
                <p className="hint" style={{ marginBottom: 14 }}>Não invento número: se não tiver base, eu digo.</p>
                {SUGESTOES.map(s => (
                  <button key={s} className="adv-sug" onClick={() => enviar(s)}>{s}</button>
                ))}
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} className={`adv-msg ${m.role}`}>
                {m.role === 'assistant' && <div className="adv-av"><HexMark size={13} /></div>}
                <div className="adv-txt">{m.content}</div>
              </div>
            ))}

            {pensando && (
              <div className="adv-msg assistant">
                <div className="adv-av"><HexMark size={13} /></div>
                <div className="adv-txt adv-pensando">lendo seus dados<span>.</span><span>.</span><span>.</span></div>
              </div>
            )}
            <div ref={fim} />
          </div>

          <form className="adv-ft" onSubmit={e => { e.preventDefault(); enviar(); }}>
            <textarea
              value={txt} onChange={e => setTxt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
              placeholder="Pergunte qualquer coisa sobre a operação…" rows={2} disabled={pensando} />
            <button className="btn" disabled={pensando || !txt.trim()}>↑</button>
          </form>
        </aside>
      )}
    </>
  );
}
