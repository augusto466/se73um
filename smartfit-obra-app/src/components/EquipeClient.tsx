'use client';
import { useState } from 'react';

export default function EquipeClient({ perfisIniciais }: { perfisIniciais: any[] }) {
  const [perfis, setPerfis] = useState(perfisIniciais);
  const [form, setForm] = useState({ nome: '', email: '', papel: 'contratada' });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function convidar() {
    if (!form.email) { setMsg({ ok: false, texto: 'Informe o e-mail do usuário.' }); return; }
    setOcupado(true); setMsg(null);
    const r = await fetch('/api/admin/convidar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const j = await r.json();
    setOcupado(false);
    if (!r.ok) { setMsg({ ok: false, texto: j.erro ?? 'Falha ao criar o acesso.' }); return; }
    setMsg({ ok: true, texto: `Acesso criado. Senha temporária de ${form.email}: ${j.senha} — copie agora e envie por canal seguro (não será exibida novamente). Um e-mail de boas-vindas foi enviado.` });
    setPerfis(p => [...p, j.perfil]);
    setForm({ nome: '', email: '', papel: 'contratada' });
  }

  return (
    <>
      <div className="panel">
        <div className="hd"><h3>Criar acesso de usuário</h3><span className="hint">O papel define as permissões: Contratante aprova medições e valida conformidade; Contratada executa e submete</span></div>
        <div className="bd">
          <div className="form-grid">
            <div className="fg"><label>Nome</label><input value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})} placeholder="Ex.: Eng. residente" /></div>
            <div className="fg"><label>E-mail</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} /></div>
            <div className="fg"><label>Papel</label>
              <select value={form.papel} onChange={e=>setForm({...form,papel:e.target.value})}>
                <option value="contratante">Contratante (Invest Market)</option>
                <option value="contratada">Contratada (Modo Modular)</option>
                <option value="admin">Administrador</option>
              </select></div>
            <div className="fg" style={{justifyContent:'flex-end'}}><button className="btn" onClick={convidar} disabled={ocupado}>{ocupado ? 'Criando…' : 'Criar acesso'}</button></div>
          </div>
          {msg && <div className={`alert ${msg.ok ? 'info' : 'risk'}`} style={{marginTop:12}}>{msg.texto}</div>}
        </div>
      </div>

      <div className="panel">
        <div className="hd"><h3>Usuários com acesso ao painel</h3><span className="hint">Todos recebem o boletim semanal e as notificações de medição</span></div>
        <div className="bd tblwrap"><table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Notificações</th><th>Desde</th></tr></thead>
          <tbody>
            {perfis.map(p => (
              <tr key={p.id}>
                <td>{p.nome ?? '—'}</td>
                <td style={{fontFamily:'var(--mono)',fontSize:12}}>{p.email}</td>
                <td><span className="role-badge">{p.papel}</span></td>
                <td>{p.notificar ? '✔ ativas' : '— desativadas'}</td>
                <td className="num">{new Date(p.criado_em).toLocaleDateString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </>
  );
}
