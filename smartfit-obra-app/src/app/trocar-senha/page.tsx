'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function TrocarSenha() {
  const supabase = supabaseBrowser();
  const [senha, setSenha] = useState('');
  const [conf, setConf] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setErro(null);
    if (senha.length < 8) { setErro('A senha precisa de ao menos 8 caracteres.'); return; }
    if (senha !== conf) { setErro('As senhas não coincidem.'); return; }

    setOcupado(true);
    // 1) troca a senha no Auth
    const { error: e1 } = await supabase.auth.updateUser({ password: senha });
    if (e1) { setErro(e1.message); setOcupado(false); return; }

    // 2) desliga a flag — so depois de a senha nova valer
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ senha_provisoria: false }).eq('id', user.id);
    }

    // 3) recarrega: o middleware ja nao redireciona, e leva a tela certa do papel
    window.location.href = '/';
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="panel" style={{ maxWidth: 420, width: '100%' }}>
        <div className="hd"><h3>Defina sua senha</h3></div>
        <div className="bd">
          <p className="hint" style={{ marginBottom: 16 }}>
            Este é seu primeiro acesso. Crie uma senha pessoal para continuar — a senha provisória
            deixa de valer depois disso.
          </p>

          <div className="fg" style={{ marginBottom: 12 }}>
            <label>Nova senha</label>
            <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
              placeholder="ao menos 8 caracteres" autoFocus />
          </div>
          <div className="fg" style={{ marginBottom: 12 }}>
            <label>Confirme a nova senha</label>
            <input type="password" value={conf} onChange={e => setConf(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') salvar(); }} />
          </div>

          {erro && <div className="alert risk" style={{ marginBottom: 12 }}>{erro}</div>}

          <button className="btn" onClick={salvar} disabled={ocupado} style={{ width: '100%' }}>
            {ocupado ? 'Salvando…' : 'Salvar e entrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
