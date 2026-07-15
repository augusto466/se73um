'use client';
import { useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

const VINCULOS: Record<string, string> = {
  proprio: 'Próprio', terceirizado: 'Terceirizado', fornecedor: 'Fornecedor', autonomo: 'Autônomo',
};

export default function ColaboradoresClient({ iniciais, centros, obras, papel }:
  { iniciais: any[]; centros: any[]; obras: any[]; papel: string }) {
  const [lista, setLista] = useState(iniciais);
  const [novo, setNovo] = useState(false);
  const [busca, setBusca] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [f, setF] = useState({ nome: '', funcao: '', vinculo: 'proprio', empresa: '', centro_id: 'cc_operacoes', email: '', telefone: '', obra_id: '' });
  const supabase = supabaseBrowser();
  const podeEditar = ['admin', 'contratante', 'contratada'].includes(papel);

  const filtrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter(c => `${c.nome} ${c.funcao ?? ''} ${c.empresa ?? ''}`.toLowerCase().includes(t));
  }, [lista, busca]);

  const porCentro = useMemo(() => {
    const m: Record<string, any[]> = {};
    filtrada.forEach(c => { (m[c.centro_id ?? 'sem'] ??= []).push(c); });
    return m;
  }, [filtrada]);

  async function criar() {
    if (!f.nome.trim()) { alert('Informe o nome.'); return; }
    setOcupado(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('colaboradores').insert({
        nome: f.nome.trim(), funcao: f.funcao.trim() || null, vinculo: f.vinculo,
        empresa: f.empresa.trim() || null, centro_id: f.centro_id || null,
        email: f.email.trim() || null, telefone: f.telefone.trim() || null,
        criado_por: user?.id,
      }).select().single();
      if (error) throw new Error(error.message);
      if (f.obra_id) await supabase.from('colaborador_obras').insert({ colaborador_id: data.id, obra_id: Number(f.obra_id) });
      setLista(l => [...l, data].sort((a, b) => a.nome.localeCompare(b.nome)));
      setF({ ...f, nome: '', funcao: '', empresa: '', email: '', telefone: '' });
      setNovo(false);
    } catch (e: any) { alert(e.message); }
    setOcupado(false);
  }

  async function desativar(c: any) {
    if (!confirm(`Desativar ${c.nome}? Ele deixa de aparecer para atribuição, mas o histórico é mantido.`)) return;
    const { error } = await supabase.from('colaboradores').update({ ativo: false }).eq('id', c.id);
    if (error) { alert(error.message); return; }
    setLista(l => l.filter(x => x.id !== c.id));
  }

  return (
    <>
      <section className="cock-hero">
        <div className="saud">Equipe de campo</div>
        <div className="resumo">
          Quem executa trabalho não precisa de login. Cadastre aqui e o advisor passa a atribuir tarefas por nome.
        </div>
      </section>

      <div className="panel">
        <div className="hd">
          <h3>Colaboradores · {lista.length}</h3>
          <div style={{ display: 'flex', gap: 7 }}>
            <input placeholder="buscar…" value={busca} onChange={e => setBusca(e.target.value)}
              style={{ padding: '5px 9px', fontSize: 12, width: 150 }} />
            {podeEditar && <button className="btn" onClick={() => setNovo(n => !n)}>{novo ? 'Fechar' : '+ Nova pessoa'}</button>}
          </div>
        </div>

        {novo && podeEditar && (
          <div className="bd" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="grid2">
              <div><label className="lb">Nome</label>
                <input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Cleiton Souza" /></div>
              <div><label className="lb">Função</label>
                <input value={f.funcao} onChange={e => setF({ ...f, funcao: e.target.value })} placeholder="Ex.: Engenheiro civil" /></div>
              <div><label className="lb">Vínculo</label>
                <select value={f.vinculo} onChange={e => setF({ ...f, vinculo: e.target.value })}>
                  {Object.entries(VINCULOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
              <div><label className="lb">Empresa</label>
                <input value={f.empresa} onChange={e => setF({ ...f, empresa: e.target.value })} placeholder="deixe vazio se for da casa" /></div>
              <div><label className="lb">Centro de custo</label>
                <select value={f.centro_id} onChange={e => setF({ ...f, centro_id: e.target.value })}>
                  {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select></div>
              <div><label className="lb">Obra (opcional)</label>
                <select value={f.obra_id} onChange={e => setF({ ...f, obra_id: e.target.value })}>
                  <option value="">— nenhuma —</option>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.codigo}</option>)}
                </select></div>
              <div><label className="lb">E-mail</label>
                <input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
              <div><label className="lb">Telefone</label>
                <input value={f.telefone} onChange={e => setF({ ...f, telefone: e.target.value })} /></div>
            </div>
            <button className="btn" style={{ marginTop: 10 }} disabled={ocupado || !f.nome.trim()} onClick={criar}>
              {ocupado ? 'salvando…' : 'Cadastrar'}
            </button>
          </div>
        )}

        <div className="bd">
          {!filtrada.length && <p className="hint">{busca ? 'Ninguém com esse termo.' : 'Nenhum colaborador cadastrado. Comece pelas pessoas que você mais aciona.'}</p>}
          {Object.entries(porCentro).map(([cid, pessoas]) => (
            <div key={cid} style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 11, letterSpacing: '.04em', color: 'var(--gray)', marginBottom: 6, textTransform: 'uppercase' }}>
                {centros.find(c => c.id === cid)?.nome ?? 'Sem centro de custo'}
              </h4>
              <table className="tab">
                <thead><tr><th>Nome</th><th>Função</th><th>Vínculo</th><th>Contato</th><th></th></tr></thead>
                <tbody>
                  {pessoas.map(c => (
                    <tr key={c.id}>
                      <td><b>{c.nome}</b></td>
                      <td>{c.funcao ?? '—'}</td>
                      <td><span className="hint">{VINCULOS[c.vinculo]}{c.empresa ? ` · ${c.empresa}` : ''}</span></td>
                      <td><span className="hint">{c.telefone ?? c.email ?? '—'}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        {podeEditar && <button className="mini" onClick={() => desativar(c)}>✕</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
