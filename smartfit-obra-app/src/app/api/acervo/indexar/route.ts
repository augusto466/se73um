import { NextResponse } from 'next/server';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';

export const maxDuration = 300;

const TABELAS: Record<string, { tabela: string; titulo: (r: any) => string }> = {
  projeto: { tabela: 'projetos', titulo: r => `${r.codigo ? r.codigo + ' ' : ''}${r.titulo} (${r.revisao})` },
  documento: { tabela: 'documentos', titulo: r => r.titulo },
  anexo: { tabela: 'anexos', titulo: r => r.descricao || r.arquivo_nome },
};

async function extrairTexto(admin: any, path: string, nome: string): Promise<string | null> {
  const ext = (nome || path).toLowerCase().split('.').pop() ?? '';
  const { data, error } = await admin.storage.from('arquivos').download(path);
  if (error || !data) return null;

  if (ext === 'pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const buf = new Uint8Array(await data.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    return String(text ?? '').trim() || null;
  }
  if (['txt', 'csv', 'md', 'log'].includes(ext)) {
    return (await data.text()).trim() || null;
  }
  return null; // outros formatos: sem extração por enquanto
}

async function indexarRegistro(admin: any, origem: string, registro: any) {
  if (!registro?.arquivo_path) return { pulado: 'sem arquivo' };
  const texto = await extrairTexto(admin, registro.arquivo_path, registro.arquivo_nome ?? '');
  if (!texto) return { pulado: 'formato sem extração ou PDF sem camada de texto' };
  const { error } = await admin.from('arquivo_textos').upsert({
    origem, origem_id: registro.id,
    obra_id: registro.obra_id ?? null,
    titulo: TABELAS[origem].titulo(registro),
    texto: texto.slice(0, 500000),
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'origem,origem_id' });
  if (error) return { erro: error.message };
  return { ok: true, caracteres: texto.length };
}

/**
 * POST { origem: 'projeto'|'documento'|'anexo', id }  → indexa um arquivo (chamado após o upload)
 * POST { tudo: true }                                  → reindexação em lote (admin), 15 por chamada
 */
export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const admin = supabaseAdmin();
  const corpo = await req.json();

  // ---- lote (admin): pega o que ainda não está indexado
  if (corpo.tudo) {
    const { data: perfil } = await supa.from('profiles').select('papel').eq('id', user.id).single();
    if (perfil?.papel !== 'admin') return NextResponse.json({ erro: 'Somente admin.' }, { status: 403 });

    const { data: indexados } = await admin.from('arquivo_textos').select('origem, origem_id');
    const jaTem = new Set((indexados ?? []).map((i: any) => `${i.origem}:${i.origem_id}`));

    const fila: { origem: string; registro: any }[] = [];
    for (const origem of Object.keys(TABELAS)) {
      const { data } = await admin.from(TABELAS[origem].tabela).select('*').not('arquivo_path', 'is', null);
      (data ?? []).forEach((r: any) => { if (!jaTem.has(`${origem}:${r.id}`)) fila.push({ origem, registro: r }); });
    }

    const lote = fila.slice(0, 15);
    const resultados: any[] = [];
    for (const item of lote) {
      const res = await indexarRegistro(admin, item.origem, item.registro);
      resultados.push({ origem: item.origem, id: item.registro.id, ...res });
    }
    return NextResponse.json({ processados: lote.length, restantes: fila.length - lote.length, resultados });
  }

  // ---- indexação de um arquivo (pós-upload)
  const { origem, id } = corpo;
  if (!TABELAS[origem] || !id) return NextResponse.json({ erro: 'Parâmetros inválidos.' }, { status: 400 });

  // o registro precisa ser visível ao usuário (RLS na leitura)
  const { data: registro } = await supa.from(TABELAS[origem].tabela).select('*').eq('id', id).single();
  if (!registro) return NextResponse.json({ erro: 'Registro não encontrado ou sem acesso.' }, { status: 404 });

  const res = await indexarRegistro(admin, origem, registro);
  return NextResponse.json(res);
}
