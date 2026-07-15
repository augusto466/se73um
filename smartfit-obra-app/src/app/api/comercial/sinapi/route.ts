import { NextResponse } from 'next/server';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import { composicao, comparar, ultimaAtualizacao, consumo, UF_PADRAO, REGIME, SemChave } from '@/lib/sinapi';

export const maxDuration = 300;

/**
 * GET ?acao=status              → referência disponível e consumo da chave
 * GET ?acao=comparar&uf=MT,GO   → compara os códigos do modelo entre estados
 *
 * POST { base_id?, referencia? } → sincroniza: busca os preços dos códigos que
 *   o modelo usa e enfileira as diferenças para aprovação. Não aplica nada.
 */
export async function GET(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const url = new URL(req.url);
  const acao = url.searchParams.get('acao') ?? 'status';

  try {
    if (acao === 'status') {
      const [atual, uso] = await Promise.all([
        ultimaAtualizacao().catch(() => null),
        consumo().catch(() => null),
      ]);
      return NextResponse.json({ ok: true, atualizacao: atual, consumo: uso, uf: UF_PADRAO, regime: REGIME });
    }

    if (acao === 'comparar') {
      // Responde a pergunta que importa: quanto o custo muda trocando de estado?
      const ufs = (url.searchParams.get('uf') ?? 'MT,GO').split(',').map(s => s.trim().toUpperCase());
      const modeloId = Number(url.searchParams.get('modelo'));
      if (!modeloId) return NextResponse.json({ erro: 'Informe o modelo.' }, { status: 400 });

      const { data: itens } = await supa.from('modelo_itens')
        .select('id, etapa, descricao, codigo, base_id, custo_unitario, indice')
        .eq('modelo_id', modeloId)
        .like('base_id', 'sinapi%')
        .not('codigo', 'is', null);
      if (!itens?.length) {
        return NextResponse.json({ ok: true, itens: [], aviso: 'O modelo não tem itens com código SINAPI.' });
      }

      const linhas: any[] = [];
      const erros: string[] = [];
      // sequencial de propósito: rajada de requisição queima a cota horária
      for (const it of itens) {
        try {
          const c = await comparar(it.codigo!, ufs, 'composicao');
          const precos: Record<string, number> = {};
          c.precos.forEach((p: any) => { precos[p.estado] = p.preco; });
          const [a, b] = ufs;
          if (!precos[a] || !precos[b]) { erros.push(`${it.codigo}: sem preço em ${!precos[a] ? a : b}`); continue; }
          linhas.push({
            item_id: it.id, etapa: it.etapa, descricao: it.descricao, codigo: it.codigo,
            precos, custo_modelo: Number(it.custo_unitario), indice: Number(it.indice),
            variacao_pct: Math.round((precos[b] / precos[a] - 1) * 1000) / 10,
            impacto_m2: Math.round((precos[b] - precos[a]) * Number(it.indice) * 100) / 100,
          });
        } catch (e: any) {
          erros.push(`${it.codigo}: ${e.message}`);
          if (String(e.message).includes('Limite')) break;   // cota estourada: para
        }
      }
      linhas.sort((a, b) => Math.abs(b.impacto_m2) - Math.abs(a.impacto_m2));

      return NextResponse.json({
        ok: true, ufs, itens: linhas,
        impacto_total_m2: Math.round(linhas.reduce((s, l) => s + l.impacto_m2, 0) * 100) / 100,
        consultados: linhas.length, total: itens.length,
        erros: erros.length ? erros.slice(0, 10) : null,
      });
    }

    return NextResponse.json({ erro: 'Ação desconhecida.' }, { status: 400 });
  } catch (e: any) {
    if (e instanceof SemChave) return NextResponse.json({ erro: e.message }, { status: 503 });
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }
}

/** Sincroniza: busca preços novos e enfileira as diferenças. Não aplica. */
export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: perfil } = await supa.from('profiles').select('papel').eq('id', user.id).single();
  if (!['admin', 'contratante'].includes(perfil?.papel ?? '')) {
    return NextResponse.json({ erro: 'Somente admin ou contratante sincroniza.' }, { status: 403 });
  }

  const { base_id = 'sinapi_go', referencia } = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();

  try {
    const { data: base } = await supa.from('bases_preco').select('*').eq('id', base_id).maybeSingle();
    if (!base) return NextResponse.json({ erro: 'Base não encontrada.' }, { status: 404 });
    const uf = base.api_uf ?? UF_PADRAO;

    // só os códigos que os modelos de fato usam — não os 15 mil da tabela
    const { data: usados } = await supa.from('modelo_itens')
      .select('codigo, base_id, custo_unitario, indice').not('codigo', 'is', null).like('base_id', 'sinapi%');
    const codigos = Array.from(new Set((usados ?? []).map((i: any) => String(i.codigo))));
    if (!codigos.length) return NextResponse.json({ erro: 'Nenhum código SINAPI em uso pelos modelos.' }, { status: 400 });

    const { data: atuais } = await supa.from('composicoes')
      .select('codigo, custo_unitario').eq('base_id', base_id);
    const antes = new Map((atuais ?? []).map((c: any) => [c.codigo, Number(c.custo_unitario)]));
    const indices = new Map((usados ?? []).map((i: any) => [String(i.codigo), Number(i.indice)]));

    const ref = referencia ?? null;
    const pendencias: any[] = [];
    const upserts: any[] = [];
    const variacoes: number[] = [];
    const erros: string[] = [];
    let consultados = 0;

    for (const cod of codigos) {
      try {
        const c = await composicao(cod, uf, ref);
        if (!c || !c.preco) { erros.push(`${cod}: sem preço em ${uf}`); continue; }
        consultados++;

        upserts.push({
          base_id, codigo: cod, descricao: c.nome || cod, unidade: c.unidade,
          tipo: 'composicao', custo_unitario: c.preco, atualizado_em: new Date().toISOString(),
        });

        const ant = antes.get(cod);
        if (ant !== undefined && Math.abs(c.preco - ant) > 0.01) {
          const varPct = ant > 0 ? Math.round((c.preco / ant - 1) * 1000) / 10 : 0;
          variacoes.push(varPct);
          const idx = indices.get(cod) ?? 0;
          pendencias.push({
            base_id, referencia: (c.data_referencia ?? new Date().toISOString()).slice(0, 10),
            codigo: cod, descricao: c.nome, unidade: c.unidade,
            preco_atual: ant, preco_novo: c.preco, variacao_pct: varPct,
            usado_em_modelo: idx > 0,
            impacto_m2: Math.round((c.preco - ant) * idx * 100) / 100,
          });
        }
      } catch (e: any) {
        erros.push(`${cod}: ${e.message}`);
        if (String(e.message).includes('Limite')) break;
      }
    }

    // grava as composições (a base espelha o SINAPI) e enfileira o que mudou
    for (let i = 0; i < upserts.length; i += 500) {
      await admin.from('composicoes').upsert(upserts.slice(i, i + 500), { onConflict: 'base_id,codigo' });
    }
    if (pendencias.length) {
      await admin.from('sinapi_pendencias').upsert(pendencias, { onConflict: 'base_id,referencia,codigo' });
    }

    const varMedia = variacoes.length
      ? Math.round(variacoes.reduce((s, v) => s + v, 0) / variacoes.length * 100) / 100 : null;

    await admin.from('bases_preco').update({
      sincronizado_em: new Date().toISOString(),
      referencia: pendencias[0]?.referencia ?? base.referencia,
    }).eq('id', base_id);

    await admin.from('sinapi_sincronizacoes').insert({
      base_id, referencia: pendencias[0]?.referencia ?? null, origem: 'manual',
      codigos_consultados: consultados, codigos_alterados: pendencias.length,
      variacao_media_pct: varMedia, erro: erros.length ? erros.slice(0, 3).join(' · ') : null,
    });

    return NextResponse.json({
      ok: true, uf, regime: REGIME,
      consultados, alterados: pendencias.length,
      variacao_media_pct: varMedia,
      erros: erros.length ? erros.slice(0, 10) : null,
      proximo: pendencias.length
        ? `${pendencias.length} preço(s) mudaram. Revise e aprove em Base de Preços — nada foi aplicado aos modelos.`
        : 'Nenhum preço mudou desde a última sincronização.',
    });
  } catch (e: any) {
    if (e instanceof SemChave) return NextResponse.json({ erro: e.message }, { status: 503 });
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }
}
