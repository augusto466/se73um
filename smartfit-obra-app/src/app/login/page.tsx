'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(''); setCarregando(true);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) { setErro('E-mail ou senha inválidos. Acessos são criados pelo administrador do contrato.'); return; }
    window.location.href = '/meu-dia';
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={entrar}>
        <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:18}}>
          <div style={{width:44,height:44,background:'var(--accent)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,borderRadius:4}}>TK</div>
          <div>
            <h1 style={{fontSize:16}}>Painel da Obra — Smart Fit</h1>
            <div className="hint">Contrato TK-328/2026 · acesso restrito às partes</div>
          </div>
        </div>
        <div className="fg" style={{marginBottom:10}}>
          <label>E-mail</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div className="fg" style={{marginBottom:14}}>
          <label>Senha</label>
          <input type="password" value={senha} onChange={e=>setSenha(e.target.value)} required autoComplete="current-password" />
        </div>
        {erro && <div className="alert risk" role="alert">{erro}</div>}
        <button className="btn" style={{width:'100%'}} disabled={carregando}>{carregando ? 'Entrando…' : 'Entrar'}</button>
        <p className="hint" style={{marginTop:14,textAlign:'center'}}>Sem acesso? Solicite ao administrador do contrato (aba Equipe).</p>
      </form>
    </div>
  );
}
