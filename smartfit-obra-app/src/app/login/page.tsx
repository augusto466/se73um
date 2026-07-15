'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Logo } from '@/components/Marca';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(''); setCarregando(true);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) { setErro('E-mail ou senha não conferem. Os acessos são criados pelo administrador do contrato.'); return; }
    window.location.href = '/meu-dia';
  }

  return (
    <div className="login-wrap">
      <div className="login-art">
        <div className="in">
          <Logo size={34} />
          <h2 style={{ marginTop: 28 }}>Sua obra inteira em <em>um lugar</em>.</h2>
          <p>Medições, compras, caixa e qualidade conectados — do canteiro à decisão, com trilha de tudo que foi aprovado.</p>
          <div className="pills">
            <span className="pill">Conexão</span>
            <span className="pill">Inteligência</span>
            <span className="pill">Fluxo</span>
            <span className="pill">Estrutura</span>
            <span className="pill">Evolução</span>
          </div>
        </div>
      </div>

      <div className="login-form">
        <form className="login-card" onSubmit={entrar}>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 21, fontWeight: 700, letterSpacing: '-.4px' }}>Entrar</h1>
          <p className="hint" style={{ marginBottom: 22 }}>Gestão de obras · acesso restrito às partes do contrato</p>

          <div className="fg" style={{ marginBottom: 12 }}>
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="fg" style={{ marginBottom: 16 }}>
            <label htmlFor="senha">Senha</label>
            <input id="senha" type="password" value={senha} onChange={e => setSenha(e.target.value)} required autoComplete="current-password" />
          </div>

          {erro && <div className="alert risk" role="alert">{erro}</div>}

          <button className="btn" style={{ width: '100%', padding: 11 }} disabled={carregando}>
            {carregando ? 'Entrando…' : 'Entrar'}
          </button>

          <p className="hint" style={{ marginTop: 18, textAlign: 'center' }}>
            Sem acesso? Solicite ao administrador do contrato.
          </p>
        </form>
      </div>
    </div>
  );
}
