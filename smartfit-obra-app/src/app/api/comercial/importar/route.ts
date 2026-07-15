import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const maxDuration = 300;

/**
 * Importa uma base de preços a partir de CSV.
 *
 * A Caixa publica o SINAPI em planilha mensal por estado — não há API oficial.
 * Então o caminho é: baixar a planilha, salvar as colunas relevantes como CSV,
 * e subir aqui. Colunas esperadas (nesta ordem, com cabeçalho):
 *   codigo;descricao;unidade;custo
 *
 * O separador pode ser ; ou , e o decimal aceita vírgula (padrão brasileiro).
 *
 * POST { base_id, csv, arquivo? }
 */
export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: perfil } = await supa.from('profiles').select('papel').eq('id', user.id).single();
  if (!['admin', 'contratante'].includes(perfil?.papel ?? '')) {
    return NextResponse.json({ erro: 'Somente admin ou contratante importa base.' }, { status: 403 });
  }

  const { base_id, csv, arquivo, referencia } = await req.json();
  if (!base_id || !csv) return NextResponse.json({ erro: 'Informe a base e o conteúdo do CSV.' }, { status: 400 });

  const { data: base } = await supa.from('bases_preco').select('id, nome').eq('id', base_id).maybeSingle();
  if (!base) return NextResponse.json({ erro: 'Base não encontrada.' }, { status: 404 });

  // ---- parse
  const linhas = String(csv).split(/\r?\n/).filter(l => l.trim());
  if (linhas.length < 2) return NextResponse.json({ erro: 'O CSV precisa de cabeçalho e ao menos uma linha.' }, { status: 400 });

  const sep = (linhas[0].match(/;/g) ?? []).length >= (linhas[0].match(/,/g) ?? []).length ? ';' : ',';
  const cab = linhas[0].toLowerCase().split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
  const iCod = cab.findIndex(c => c.includes('cod'));
  const iDesc = cab.findIndex(c => c.includes('desc'));
  const iUn = cab.findIndex(c => c.includes('unid') || c === 'un');
  const iCusto = cab.findIndex(c => c.includes('custo') || c.includes('preco') || c.includes('preço') || c.includes('valor'));

  if (iCod < 0 || iCusto < 0) {
    return NextResponse.json({
      erro: `Não achei as colunas obrigatórias. O cabeçalho precisa ter "codigo" e "custo". Encontrei: ${cab.join(', ')}`,
    }, { status: 400 });
  }

  const registros: any[] = [];
  const erros: string[] = [];
  for (let n = 1; n < linhas.length; n++) {
    const cols = linhas[n].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
    const codigo = cols[iCod];
    if (!codigo) continue;

    // decimal brasileiro: 1.234,56 → 1234.56
    const bruto = (cols[iCusto] ?? '').replace(/[R$\s]/g, '');
    const custo = Number(bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto);
    if (!isFinite(custo) || custo <= 0) {
      if (erros.length < 5) erros.push(`Linha ${n + 1} (${codigo}): custo inválido "${cols[iCusto]}"`);
      continue;
    }
    registros.push({
      base_id, codigo,
      descricao: iDesc >= 0 ? (cols[iDesc] || codigo) : codigo,
      unidade: iUn >= 0 ? cols[iUn] : null,
      tipo: 'composicao',
      custo_unitario: custo,
      atualizado_em: new Date().toISOString(),
    });
  }

  if (!registros.length) {
    return NextResponse.json({ erro: `Nenhuma linha válida. ${erros.join(' · ')}` }, { status: 400 });
  }

  // ---- mede a variação antes de gravar: é o que interessa saber
  const { data: atuais } = await supa.from('composicoes')
    .select('codigo, custo_unitario').eq('base_id', base_id);
  const antes = new Map((atuais ?? []).map((c: any) => [c.codigo, Number(c.custo_unitario)]));

  let novas = 0, atualizadas = 0;
  const variacoes: number[] = [];
  for (const r of registros) {
    const ant = antes.get(r.codigo);
    if (ant === undefined) novas++;
    else {
      atualizadas++;
      if (ant > 0) variacoes.push((r.custo_unitario / ant - 1) * 100);
    }
  }
  const varMedia = variacoes.length
    ? Math.round(variacoes.reduce((s, v) => s + v, 0) / variacoes.length * 100) / 100 : null;

  // ---- grava em lotes
  for (let i = 0; i < registros.length; i += 500) {
    const { error } = await supa.from('composicoes')
      .upsert(registros.slice(i, i + 500), { onConflict: 'base_id,codigo' });
    if (error) return NextResponse.json({ erro: `Falha ao gravar: ${error.message}` }, { status: 400 });
  }

  if (referencia) {
    await supa.from('bases_preco').update({ referencia }).eq('id', base_id);
  }

  const { data: imp } = await supa.from('importacoes_base').insert({
    base_id, arquivo: arquivo ?? null,
    linhas_lidas: registros.length, linhas_novas: novas, linhas_atualizadas: atualizadas,
    variacao_media_pct: varMedia, criado_por: user.id,
  }).select('id').single();

  return NextResponse.json({
    ok: true, importacao: imp,
    lidas: registros.length, novas, atualizadas,
    variacao_media_pct: varMedia,
    erros: erros.length ? erros : null,
    aviso: varMedia !== null && Math.abs(varMedia) > 15
      ? `Variação média de ${varMedia}% frente à base anterior. Confira se a referência está certa antes de orçar com ela.`
      : null,
    proximo: 'Os custos das composições mudaram, mas os modelos não. Vá em Base de preços → "Aplicar aos modelos" para propagar.',
  });
}
