'use client';
import { useEffect, useState } from 'react';
import { fmtData } from '@/lib/contrato';

/**
 * Envio da proposta ao cliente.
 *
 * O sistema prepara o rascunho; você lê e clica. E-mail a cliente não tem
 * CTRL+Z — por isso nada sai sem passar pelos seus olhos.
 */
export default function EnviarProposta({ propostaId, onFechar }: { propostaId: number; onFechar: () => void }) {
  const [d, setD] = useState<any>(null);
  const [f, setF] = useState({ para: '', copia: '', assunto: '', corpo: '' });
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/comercial/enviar?proposta=${propostaId}`);
      const j = await r.json();
      if (j.erro) { alert(j.erro); onFechar(); return; }
      setD(j);
      setF({ para: j.para ?? '', copia: '', assunto: j.assunto, corpo: j.corpo });
    })();
  }, [propostaId, onFechar]);

  async function enviar() {
    if (!f.para.trim()) { alert('Informe o destinatário.'); return; }
    if (!confirm(`Enviar a proposta para ${f.para}?\n\nE-mail a cliente não tem desfazer — confira o destinatário e o texto.`)) return;
    setOcupado(true);
    try {
      const r = await fetch('/api/comercial/enviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposta_id: propostaId, ...f }),
      });
      const j = await r.json();
      if (j.erro) { alert(j.erro); setOcupado(false); return; }
      alert('Proposta enviada. A oportunidade avançou para "proposta" no funil.');
      location.reload();
    } catch (e: any) { alert('Falha: ' + e.message); }
    setOcupado(false);
  }

  if (!d) return <p className="hint" style={{ padding: 12 }}>carregando…</p>;

  return (
    <div style={{ border: '1px solid var(--line-strong)', borderLeft: '3px solid var(--brand)', borderRadius: 8, padding: 14, marginBottom: 14, background: 'var(--surface-2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <b style={{ fontSize: 13 }}>Enviar {d.proposta.versao} ao cliente</b>
        <span className="hint">o sistema prepara; você confere e envia</span>
      </div>

      {d.aviso && <p style={{ fontSize: 12.5, marginBottom: 10, paddingLeft: 10, borderLeft: '2px solid var(--brand)' }}>{d.aviso}</p>}

      {d.envios.length > 0 && (
        <div style={{ marginBottom: 10, padding: 8, background: 'var(--surface)', borderRadius: 6 }}>
          <span className="hint">Já enviada {d.envios.length}×:</span>
          {d.envios.slice(0, 3).map((e: any, i: number) => (
            <div key={i} className="hint" style={{ marginTop: 2 }}>
              · {fmtData(String(e.enviado_em).slice(0, 10))} para {e.para} {e.status === 'falhou' && <span style={{ color: 'var(--brand)' }}>(falhou)</span>}
            </div>
          ))}
        </div>
      )}

      <div className="form-grid" style={{ marginBottom: 10 }}>
        <div className="fg"><label>Para</label>
          <input value={f.para} onChange={e => setF({ ...f, para: e.target.value })} placeholder="cliente@empresa.com.br" /></div>
        <div className="fg"><label>Cópia (opcional)</label>
          <input value={f.copia} onChange={e => setF({ ...f, copia: e.target.value })} /></div>
        <div className="fg full"><label>Assunto</label>
          <input value={f.assunto} onChange={e => setF({ ...f, assunto: e.target.value })} /></div>
      </div>
      <div className="fg" style={{ marginBottom: 10 }}>
        <label>Mensagem</label>
        <textarea value={f.corpo} onChange={e => setF({ ...f, corpo: e.target.value })} rows={12} style={{ fontSize: 13, lineHeight: 1.6 }} />
      </div>

      <p className="hint" style={{ marginBottom: 10 }}>
        A proposta vai como link (abre pronta para imprimir ou salvar em PDF). Ao enviar, a oportunidade avança para
        &quot;proposta&quot; no funil e a versão fica marcada como enviada.
      </p>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" disabled={ocupado || !f.para.trim()} onClick={enviar}>
          {ocupado ? 'enviando…' : 'Enviar'}
        </button>
        <a className="mini" href={`/api/comercial/pdf?proposta=${propostaId}`} target="_blank" rel="noreferrer">ver a proposta antes</a>
        <button className="mini" onClick={onFechar}>cancelar</button>
      </div>
    </div>
  );
}
