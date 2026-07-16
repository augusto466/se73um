import { supabaseServer } from './supabase/server';

/**
 * A empresa do usuário logado.
 *
 * O sistema é multiempresa: cada cliente é um tenant. O RLS já isola no banco,
 * mas os documentos precisam da identidade — logo, cores, contato.
 */
export type Empresa = {
  id: number;
  slug: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  logo_path: string | null;
  cor_marca: string;
  email: string | null;
  telefone: string | null;
  site: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  email_remetente: string | null;
  dominio_verificado: boolean;
  plano: string;
};

export async function empresaAtual(): Promise<Empresa | null> {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supa.from('profiles').select('empresa_id').eq('id', user.id).single();
  if (!perfil?.empresa_id) return null;
  const { data } = await supa.from('empresas').select('*').eq('id', perfil.empresa_id).maybeSingle();
  return (data as Empresa) ?? null;
}

/** URL pública do logo, para usar nos documentos. */
export function urlLogo(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/arquivos/${path}` : null;
}

/** Nome de exibição: fantasia se houver, senão razão social. */
export const nomeEmpresa = (e: Empresa | null) =>
  e ? (e.nome_fantasia || e.razao_social) : 'Se73um';
