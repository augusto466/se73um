'use client';
import { useState } from 'react';

export default function EquipeClient({ perfisIniciais, obras, vinculosIniciais }:
  { perfisIniciais: any[]; obras: any[]; vinculosIniciais: any[] }) {
  const [perfis, setPerfis] = useState(perfisIniciais);
  const [vinculos, setVinculos] = useState(vinculosIniciais);
  const [form, setForm] = useState({ nome: '', email: '', papel: 'contratada', empresa: '' });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const temVinculo = (obraId: number, usuarioId: string) =>
    vinculos.some(v => v.obra_id === obraId && v.usuario_id === usuarioId);

  async function convidar() {
    if (!form.email) { setMsg({ ok: false, texto: 'Informe o e-mail do usuário.' }); return; }
    setOcupado(true); setMsg(null);
    const r = await fetch('/api/admin/convidar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    const j = await r.json();
    setOcupado(false);
    if (!r.ok) { setMsg({ ok: false, texto: j.erro ?? 'Falha ao criar o acesso.' }); return; }
    setMsg({ ok: true, texto: `Acesso criado. Senha temporária de ${form.email}: ${j.senha} — copie agora e envie por canal seguro (não será exibida novamente). Depois vincule o usuário às obras na tabela abaixo.` });
    setPerfis(p => [...p, j.perfil]);
    setForm({ nome: '', email: '', papel: 'contratada', empresa: '' });
  }

  async function alternarVinculo(obraId: number, usuarioId: string, vincular: boolean) {
    const r = await fetch('/api/admin/vinculos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ obraId, usuarioId, vincular }),
    });
    if (!r.ok) { alert('Falha ao atualizar o vínculo.'); return; }
    setVinculos(vs => vincular
      ? [...vs, { obra_id: obraId, usuario_id: usuarioId }]
      : vs.filter(v => !(v.obra_id === obraId && v.usuario_id === usuarioId)));
  }

  return (
    <>
      <div className="panel">
        <div className="hd"><h3>Criar acesso de usuário</h3><span className="hint">O papel é global: Contratante aprova medições e pedidos; Contratada executa e submete</span></div>
        <div className="bd">
          <div className="form-grid">
            <div className="fg"><label>Nome</label><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Eng. residente" /></div>
            <div className="fg"><label>E-mail</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div className="fg"><label>Empresa</label><input value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })} placeholder="Ex.: Modo Modular LTDA" /></div>
            <div className="fg"><label>Papel</label>
              <select value={form.papel} onChange={e => setForm({ ...form, papel: e.target.value })}>
                <option value="contratante">Contratante (cliente da obra)</option>
                <option value="contratada">Contratada (construtora)</option>
                <option value="admin">Administrador (vê todas as obras)</option>
              </select></div>
            <div className="fg full" style={{ flexDirection: 'row', justifyContent: 'flex-end' }}><button className="btn" onClick={convidar} disabled={ocupado}>{ocupado ? 'Criando…' : 'Criar acesso'}</button></div>
          </div>
          {msg && <div className={`alert ${msg.ok ? 'info' : 'risk'}`} style={{ marginTop: 12 }}>{msg.texto}</div>}
        </div>
      </div>

      <div className="panel">
        <div className="hd">
          <h3>Vínculo de usuários às obras</h3>
          <span className="hint">Marque as obras que cada usuário pode acessar. Administradores veem todas automaticamente.</span>
        </div>
        <div className="bd tblwrap">
          <table>
            <thead>
              <tr>
                <th>Usuário</th><th>Empresa</th><th>Papel</th>
                {obras.map(o => <th key={o.id} className="num" title={o.nome}>{o.codigo}</th>)}
              </tr>
            </thead>
            <tbody>
              {perfis.map(p => (
                <tr key={p.id}>
                  <td><b>{p.nome ?? '—'}</b><div className="hint" style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{p.email}</div></td>
                  <td>{p.empresa ?? '—'}</td>
                  <td><span className="role-badge">{p.papel}</span></td>
                  {obras.map(o => (
                    <td key={o.id} style={{ textAlign: 'center' }}>
                      {p.papel === 'admin'
                        ? <span className="hint" title="Administradores acessam todas as obras">todas</span>
                        : <input type="checkbox" checked={temVinculo(o.id, p.id)}
                            onChange={e => alternarVinculo(o.id, p.id, e.target.checked)}
                            style={{ accentColor: 'var(--ok)', width: 16, height: 16 }} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
