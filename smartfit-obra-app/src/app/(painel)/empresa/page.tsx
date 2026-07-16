import EmpresaClient from '@/components/EmpresaClient';
import { supabaseServer } from '@/lib/supabase/server';
import { empresaAtual, urlLogo } from '@/lib/empresa';
import { perfilAtual } from '@/lib/obra';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function Empresa() {
  const [emp, perfil] = await Promise.all([empresaAtual(), perfilAtual()]);
  if (!emp) notFound();
  const pode = perfil?.papel === 'admin' || !!(perfil as any)?.superadmin;
  return <EmpresaClient empresa={emp} podeEditar={pode} urlLogoAtual={urlLogo(emp.logo_path)} />;
}
