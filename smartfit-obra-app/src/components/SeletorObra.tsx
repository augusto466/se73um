'use client';
import { useState } from 'react';

export default function SeletorObra({ obras, ativaId }: { obras: any[]; ativaId: number | null }) {
  const [ocupado, setOcupado] = useState(false);
  if (!obras.length) return null;

  async function trocar(id: string) {
    if (id === 'portfolio') { window.location.href = '/obras'; return; }
    setOcupado(true);
    await fetch('/api/obra-ativa', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ obraId: Number(id) }),
    });
    window.location.reload();
  }

  return (
    <select
      aria-label="Obra ativa"
      value={ativaId ?? ''}
      disabled={ocupado}
      onChange={e => trocar(e.target.value)}
      style={{
        background: '#1E252C', color: '#EDEFF1', border: '1px solid #49535D',
        borderRadius: 4, padding: '7px 9px', fontSize: 12.5, maxWidth: 260,
      }}>
      {obras.map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nome}</option>)}
      <option value="portfolio">— ver todas as obras —</option>
    </select>
  );
}
