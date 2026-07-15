'use client';
import { useState } from 'react';
import { OBRA_STATUS, fmtBRL, fmtPct, fmtData, diasAte } from '@/lib/contrato';

export default function PortfolioClient({ itens, modelos, papel }:
  { itens: any[]; modelos: any[]; papel: string }) {
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState({
    modeloId: modelos[0]?.id ? String(modelos[0].id) : '', copiarValores: 'nao',
    codigo: '', nome: '', cliente: '', contratada: 'Modo Modular LTDA',
    local: '', valor_global: '', assinatura: '', entrega_final: '',
  });
  const [mostrar, setMostrar] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const ehAdmin = papel === 'admin';

  const totalCarteira = itens.reduce((s, o) => s + Number(o.valor_global || 0), 0);
  const totalMedido = itens.reduce((s, o) => s + Number(o.medido || 0), 0);
  const pendencias = itens.reduce((s, o) => s + Number(o.em_validacao || 0) + Number(o.pedidos_aguardando || 0), 0);

  async function abrir(id: number) {
    setOcupado(true);
    await fetch('/api/obra-ativa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ obraId: id }) });
    window.location.href = '/visao';
  }

  async function criar() {
    if (!form.codigo.trim() || !form.nome.trim()) { setMsg({ ok: false, texto: 'Informe código e nome da obra.' }); return; }
    setOcupado(true); setMsg(null);
    const body: any = {
      codigo: form.codigo, nome: form.nome, cliente: form.cliente, contratada: form.contratada,
      local: form.local, valor_global: Number(String(form.valor_global).replace(/\./g, '').replace(',', '.')) || 0,
      assinatura: form.assinatura || null, entrega_final: form.entrega_final || null,
    };
    if (form.modeloId) { body.modeloId = Number(form.modeloId); body.copiarValores = form.copiarValores === 'sim'; }
    const r = await fetch('/api/admin/obras', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    setOcupado(false);
    if (!r.ok) { setMsg({ ok: false, texto: j.erro ?? 'Falha ao criar a obra.' }); return; }
    setMsg({ ok: true, texto: 'Obra criada. Abrindo o painel dela…' });
    setTimeout(() => abrir(j.obraId), 700);
  }

  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="kpi blu"><div className="lbl">Obras na carteira</div><div className="val">{itens.length}</div><div className="foot">{itens.filter(o => o.status === 'ativa').length} ativa(s)</div></div>
        <div className="kpi acc"><div className="lbl">Valor total contratado</div><div className="val">{fmtBRL(totalCarteira)}</div></div>
        <div className="kpi okk"><div className="lbl">Medido acumulado</div><div className="val">{fmtBRL(totalMedido)}</div><div className="foot">{totalCarteira ? fmtPct(totalMedido / totalCarteira * 100) : '—'} da carteira</div></div>
        <div className="kpi wrn"><div className="lbl">Pendências de decisão</div><div className="val">{pendencias}</div><div className="foot">medições + pedidos aguardando</div></div>
      </div>

      <h2 className="sec">Portfólio de obras {ehAdmin && <span className="hint" style={{ textTransform: 'none', letterSpacing: 0 }}>· visão consolidada do administrador</span>}</h2>

      {ehAdmin && (
        <div className="panel">
          <div className="hd">
            <h3>Nova obra</h3>
            <button className="btn" onClick={() => setMostrar(m => !m)}>{mostrar ? 'Fechar' : '+ Criar obra / duplicar modelo'}</button>
          </div>
          {mostrar && (
            <div className="bd">
              <div className="form-grid">
                <div className="fg"><label>Modelo base</label>
                  <select value={form.modeloId} onChange={e => setForm({ ...form, modeloId: e.target.value })}>
                    <option value="">— obra em branco —</option>
                    {modelos.map(m => <option key={m.id} value={m.id}>{m.codigo} · {m.nome}</option>)}
                  </select></div>
                <div className="fg"><label>Valores dos eventos</label>
                  <select value={form.copiarValores} onChange={e => setForm({ ...form, copiarValores: e.target.value })} disabled={!form.modeloId}>
                    <option value="nao">Iniciar zerados (preencher depois)</option>
                    <option value="sim">Copiar valores do modelo</option>
                  </select></div>
                <div className="fg"><label>Código do contrato</label><input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} placeholder="Ex.: TK-329/2026" /></div>
                <div className="fg"><label>Nome da obra</label><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: BTS Smart Fit — Anápolis" /></div>
                <div className="fg"><label>Cliente (contratante)</label><input value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })} /></div>
                <div className="fg"><label>Contratada</label><input value={form.contratada} onChange={e => setForm({ ...form, contratada: e.target.value })} /></div>
                <div className="fg" style={{ gridColumn: 'span 2' }}><label>Local da obra</label><input value={form.local} onChange={e => setForm({ ...form, local: e.target.value })} /></div>
                <div className="fg"><label>Valor global (R$)</label><input value={form.valor_global} onChange={e => setForm({ ...form, valor_global: e.target.value })} placeholder="0,00" /></div>
                <div className="fg"><label>Assinatura</label><input type="date" value={form.assinatura} onChange={e => setForm({ ...form, assinatura: e.target.value })} /></div>
                <div className="fg"><label>Entrega final</label><input type="date" value={form.entrega_final} onChange={e => setForm({ ...form, entrega_final: e.target.value })} /></div>
                <div className="fg" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={criar} disabled={ocupado}>{ocupado ? 'Criando…' : 'Criar obra'}</button></div>
              </div>
              <p className="hint" style={{ marginTop: 8 }}>Duplicar um modelo copia a estrutura dos eventos de medição e o checklist (zerados). Diário, tarefas e pedidos começam vazios.</p>
              {msg && <div className={`alert ${msg.ok ? 'info' : 'risk'}`} style={{ marginTop: 10 }}>{msg.texto}</div>}
            </div>
          )}
        </div>
      )}

      <div className="obras-grid">
        {itens.map(o => {
          const [lbl, cls] = OBRA_STATUS[o.status] ?? ['—', 'st-pend'];
          const dias = diasAte(o.entrega_final);
          const pend = Number(o.em_validacao || 0) + Number(o.pedidos_aguardando || 0);
          return (
            <div key={o.id} className="panel obra-card">
              <div className="hd">
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>{o.codigo}</div>
                  <h3 style={{ textTransform: 'none', fontSize: 14, marginTop: 2 }}>{o.nome}</h3>
                </div>
                <span className={`stamp ${cls}`}><span className="dot" />{lbl}</span>
              </div>
              <div className="bd">
                <div className="hint" style={{ marginBottom: 10 }}>{o.cliente ?? '—'}{o.local ? ` · ${o.local}` : ''}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <div><div className="lbl" style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.8px', fontWeight: 600 }}>Valor global</div><div style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmtBRL(o.valor_global)}</div></div>
                  <div><div className="lbl" style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.8px', fontWeight: 600 }}>Medido</div><div style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmtBRL(o.medido)}</div></div>
                </div>
                <div className="bar" style={{ marginBottom: 4 }}><i className={Number(o.pct) >= 100 ? 'g' : ''} style={{ width: `${Math.min(100, Number(o.pct))}%` }} /></div>
                <div className="hint" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{fmtPct(Number(o.pct))} executado</span>
                  <span>{o.entrega_final ? `entrega ${fmtData(o.entrega_final)} · ${dias} dias` : ''}</span>
                </div>
                {pend > 0 && (
                  <div className="alert warn" style={{ marginTop: 10, marginBottom: 0 }}>
                    <b>{pend} pendência(s) aguardando decisão</b>
                    {Number(o.em_validacao) > 0 ? `${o.em_validacao} medição(ões) em validação. ` : ''}
                    {Number(o.pedidos_aguardando) > 0 ? `${o.pedidos_aguardando} pedido(s) de materiais.` : ''}
                  </div>
                )}
                <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={() => abrir(o.id)} disabled={ocupado}>Abrir painel desta obra →</button>
              </div>
            </div>
          );
        })}
        {itens.length === 0 && <p className="hint">Nenhuma obra vinculada ao seu usuário.</p>}
      </div>
    </>
  );
}
