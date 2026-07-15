import { supabaseServer } from '@/lib/supabase/server';
import { listarObras, obraAtiva } from '@/lib/obra';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import Advisor from '@/components/Advisor';

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from('profiles').select('*').eq('id', user!.id).single();
  const papel = perfil?.papel ?? 'contratada';
  const gestor = papel === 'admin' || papel === 'contratante';

  const [obras, ativa] = await Promise.all([listarObras(), obraAtiva()]);
  const hoje = new Date().toISOString().slice(0, 10);
  const em7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  // contadores para os selos da sidebar
  const [meuDia, medicoes, pedidos, financeiro, documentos] = await Promise.all([
    supabase.from('meu_dia').select('*', { count: 'exact', head: true }).lte('vencimento', hoje),
    supabase.from('eventos').select('*', { count: 'exact', head: true }).eq('status', 'validacao'),
    supabase.from('pedidos_materiais').select('*', { count: 'exact', head: true }).eq('status', 'enviado'),
    gestor
      ? supabase.from('lancamentos').select('*', { count: 'exact', head: true }).in('status', ['previsto', 'confirmado']).lte('vencimento', em7)
      : Promise.resolve({ count: 0 }),
    supabase.from('documentos').select('*', { count: 'exact', head: true }).lt('validade', hoje),
  ]);

  const badges = {
    meuDia: meuDia.count ?? 0,
    medicoes: medicoes.count ?? 0,
    pedidos: pedidos.count ?? 0,
    financeiro: financeiro.count ?? 0,
    documentos: documentos.count ?? 0,
  };

  return (
    <div className="app">
      <Sidebar papel={papel} perfil={perfil} obras={obras} obraAtiva={ativa?.id ?? null} badges={badges} />
      <div className="main">
        <Topbar obra={ativa} />
        <div className="content">{children}</div>
      </div>
      <Advisor />
    </div>
  );
}
