import { cookies } from 'next/headers';
import { supabaseServer } from './supabase/server';
import { redirect } from 'next/navigation';

export const COOKIE_OBRA = 'obra_ativa';

export type Obra = {
  id: number; codigo: string; nome: string; cliente: string | null;
  contratada: string | null; local: string | null; valor_global: number;
  retencao_pct: number; assinatura: string | null; entrega_final: string | null;
  kickoff: number; mes_atual: number; meses: { id: number; ref: string; plan: number }[];
  status: string;
};

/** Obras visíveis para o usuário atual (RLS já filtra). */
export async function listarObras() {
  const supabase = supabaseServer();
  const { data } = await supabase.from('obras').select('*').order('codigo');
  return (data ?? []) as Obra[];
}

/** Obra ativa: a do cookie, se acessível; senão a primeira disponível. */
export async function obraAtiva(): Promise<Obra | null> {
  const supabase = supabaseServer();
  const id = cookies().get(COOKIE_OBRA)?.value;
  if (id) {
    const { data } = await supabase.from('obras').select('*').eq('id', Number(id)).maybeSingle();
    if (data) return data as Obra;
  }
  const { data } = await supabase.from('obras').select('*').order('codigo').limit(1).maybeSingle();
  return (data as Obra) ?? null;
}

/** Usar nas páginas do painel: garante uma obra ativa ou manda escolher. */
export async function exigirObra(): Promise<Obra> {
  const o = await obraAtiva();
  if (!o) redirect('/obras');
  return o;
}

export async function perfilAtual() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data;
}
