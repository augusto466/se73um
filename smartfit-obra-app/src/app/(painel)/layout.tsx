import { supabaseServer } from '@/lib/supabase/server';
import { listarObras, obraAtiva } from '@/lib/obra';
import NavTabs from '@/components/NavTabs';
import SairBtn from '@/components/SairBtn';
import SeletorObra from '@/components/SeletorObra';

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from('profiles').select('*').eq('id', user!.id).single();
  const papel = perfil?.papel ?? 'contratada';
  const papelLabel = papel === 'admin' ? 'Administrador' : papel === 'contratante' ? 'Contratante' : 'Contratada';

  const [obras, ativa] = await Promise.all([listarObras(), obraAtiva()]);

  return (
    <>
      <header className="carimbo">
        <div className="in">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 44, height: 44, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, borderRadius: 4, flex: 'none' }}>TK</div>
            <div>
              <h1>{ativa ? ativa.nome : 'Painel de Acompanhamento de Obras'}</h1>
              <div className="sub">
                {ativa
                  ? `Contrato ${ativa.codigo}${ativa.local ? ' · ' + ativa.local : ''}${ativa.entrega_final ? ' · Entrega: ' + new Date(ativa.entrega_final + 'T12:00:00').toLocaleDateString('pt-BR') : ''}`
                  : 'Selecione uma obra para começar'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <SeletorObra obras={obras} ativaId={ativa?.id ?? null} />
            <span className="role-badge">{papelLabel}</span>
            <span style={{ fontSize: 12, color: '#B9C2CA' }}>{perfil?.nome ?? user?.email}</span>
            <SairBtn />
          </div>
        </div>
      </header>
      <NavTabs papel={papel} />
      <main>{children}</main>
    </>
  );
}
