'use client';
import { useState } from 'react';

export default function EquipeClient({ perfisIniciais, obras, vinculosIniciais }:
  { perfisIniciais: any[]; obras: any[]; vinculosIniciais: any[] }) {
  const [perfis, setPerfis] = useState(perfisIniciais);
  const [vinculos, setVinculos] = useState(vinculosIniciais);
  const [form, setForm] = useState({ nome: '', email: '', papel: 'contratada', empresa: '' });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [ed, setEd] = useState({ nome: '', papel: '', empresa: '', funcao: '' });

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

  function abrirEdicao(p: any) {
    setEditando(p.id);
    setEd({ nome: p.nome ?? '', papel: p.papel ?? 'contratada', empresa: p.empresa ?? '', funcao: p.funcao ?? '' });
  }

  async function salvarEdicao(p: any) {
    setOcupado(true);
    const r = await fetch('/api/admin/usuario', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'editar', usuarioId: p.id, nome: ed.nome, papel: ed.papel, empresa: ed.empresa, funcao: ed.funcao || null }),
    });
    const j = await r.json();
    setOcupado(false);
    if (!r.ok) { alert(j.erro ?? 'Falha ao salvar.'); return; }
    setPerfis(ps => ps.map(x => x.id === p.id ? { ...x, nome: ed.nome, papel: ed.papel, empresa: ed.empresa, funcao: ed.funcao || null } : x));
    setEditando(null);
  }

  async function alternarAtivo(p: any) {
    const desativar = p.ativo !== false;
    if (desativar && !confirm(`Desativar ${p.nome ?? p.email}? Ele perde o acesso, mas o registro e o histórico permanecem.`)) return;
    setOcupado(true);
    const r = await fetch('/api/admin/usuario', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: desativar ? 'desativar' : 'reativar', usuarioId: p.id }),
    });
    const j = await r.json();
    setOcupado(false);
    if (!r.ok) { alert(j.erro ?? 'Falha ao atualizar.'); return; }
    setPerfis(ps => ps.map(x => x.id === p.id ? { ...x, ativo: !desativar } : x));
  }

  const PAPEIS = [
    ['cliente', 'Cliente'],
    ['contratante', 'Contratante'],
    ['contratada', 'Contratada'],
    ['admin', 'Administrador'],
  ];

  const FUNCOES = [
    ['', 'Padrão (pelo papel)'],
    ['campo', 'Campo'],
    ['escritorio', 'Escritório'],
    ['gestao', 'Gestão'],
  ];
  const funcaoLabel = (f: string | null) => FUNCOES.find(([v]) => v === (f ?? ''))?.[1] ?? f;

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
                <option value="cliente">Cliente (só acompanha a obra, não vê custos)</option>
                <option value="contratante">Contratante (gestão, vê financeiro)</option>
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
                <th>Usuário</th><th>Empresa</th><th>Papel</th><th>Função</th><th>Ações</th>
                {obras.map(o => <th key={o.id} className="num" title={o.nome}>{o.codigo}</th>)}
              </tr>
            </thead>
            <tbody>
              {perfis.map(p => {
                const inativo = p.ativo === false;
                const emEdicao = editando === p.id;
                return (
                  <tr key={p.id} style={inativo ? { opacity: 0.55 } : undefined}>
                    <td>
                      {emEdicao
                        ? <input value={ed.nome} onChange={e => setEd({ ...ed, nome: e.target.value })} placeholder="Nome" style={{ width: '100%' }} />
                        : <><b>{p.nome ?? '—'}</b>{inativo && <span className="stamp st-risk" style={{ marginLeft: 6 }}>Inativo</span>}</>}
                      <div className="hint" style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{p.email}</div>
                    </td>
                    <td>
                      {emEdicao
                        ? <input value={ed.empresa} onChange={e => setEd({ ...ed, empresa: e.target.value })} placeholder="Empresa" style={{ width: '100%' }} />
                        : (p.empresa ?? '—')}
                    </td>
                    <td>
                      {emEdicao
                        ? <select value={ed.papel} onChange={e => setEd({ ...ed, papel: e.target.value })}>
                            {PAPEIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        : <span className="role-badge">{p.papel}</span>}
                    </td>
                    <td>
                      {emEdicao
                        ? <select value={ed.funcao} onChange={e => setEd({ ...ed, funcao: e.target.value })}>
                            {FUNCOES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        : <span className="hint">{funcaoLabel(p.funcao)}</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {emEdicao
                        ? <>
                            <button className="mini" disabled={ocupado} onClick={() => salvarEdicao(p)}>salvar</button>{' '}
                            <button className="mini" onClick={() => setEditando(null)}>cancelar</button>
                          </>
                        : <>
                            <button className="mini" onClick={() => abrirEdicao(p)}>editar</button>{' '}
                            <button className={`mini ${inativo ? '' : 'danger'}`} disabled={ocupado} onClick={() => alternarAtivo(p)}>
                              {inativo ? 'reativar' : 'desativar'}
                            </button>
                          </>}
                    </td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
