import { supabaseServer } from '@/lib/supabase/server';
import { CONTRATO } from '@/lib/contrato';
import NavTabs from '@/components/NavTabs';
import SairBtn from '@/components/SairBtn';

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from('profiles').select('*').eq('id', user!.id).single();
  const papel = perfil?.papel ?? 'contratada';
  const papelLabel = papel === 'admin' ? 'Administrador' : papel === 'contratante' ? 'Contratante · Invest Market' : 'Contratada · Modo Modular';

  return (
    <>
      <header className="carimbo">
        <div className="in">
          <div style={{display:'flex',gap:12,alignItems:'center'}}>
            <div style={{width:44,height:44,background:'var(--accent)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,borderRadius:4}}>TK</div>
            <div>
              <h1>Painel de Acompanhamento — Obra Turn Key Smart Fit</h1>
              <div className="sub">Contrato {CONTRATO.codigo} · Av. Cesar Lattes, 2180 — Goiânia/GO · Entrega: 10/05/2027</div>
            </div>
          </div>
          <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
            <span className="role-badge">{papelLabel}</span>
            <span style={{fontSize:12,color:'#B9C2CA'}}>{perfil?.nome ?? user?.email}</span>
            <SairBtn />
          </div>
        </div>
      </header>
      <NavTabs papel={papel} />
      <main>{children}</main>
    </>
  );
}
