import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/server';
import { composicao, UF_PADRAO } from '@/lib/sinapi';

export const maxDuration = 300;

/**
 * Webhook do Orçamentador: dispara quando a Caixa publica tabela nova
 * (por volta do dia 11). É o que troca "lembrar de importar" por
 * "o sistema avisa e você aprova".
 *
 * O payload vem assinado com HMAC-SHA256. Sem validar a assinatura, qualquer
 * um poderia disparar sincronização no seu sistema — então a validação não é
 * opcional.
 *
 * Registre o webhook em Base de Preços; o segredo vai em ORCAMENTADOR_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const corpo = await req.text();
  const assinatura = req.headers.get('x-webhook-signature');
  const segredo = process.env.ORCAMENTADOR_WEBHOOK_SECRET;

  if (!segredo) {
    return NextResponse.json({ erro: 'ORCAMENTADOR_WEBHOOK_SECRET não configurado.' }, { status: 503 });
  }
  if (!assinatura) return NextResponse.json({ erro: 'Assinatura ausente.' }, { status: 403 });

  const esperada = createHmac('sha256', segredo).update(corpo).digest('hex');
  const a = Buffer.from(esperada), b = Buffer.from(assinatura);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ erro: 'Assinatura inválida.' }, { status: 403 });
  }

  let ev: any;
  try { ev = JSON.parse(corpo); } catch { return NextResponse.json({ erro: 'Payload inválido.' }, { status: 400 }); }

  const admin = supabaseAdmin();

  // eventos que não são atualização de tabela: registra e sai
  if (ev.event !== 'sinapi.update') {
    if (ev.event === 'usuario.limite_api') {
      console.warn(`[sinapi] cota em ${ev.percentual}% (${ev.utilizado}/${ev.limite})`);
    }
    return NextResponse.json({ ok: true, ignorado: ev.event });
  }

  // ---- tabela nova: busca os preços dos códigos em uso e enfileira o que mudou
  const referencia = ev.referencia ?? new Date().toISOString().slice(0, 10);
  const base_id = 'sinapi_go';

  try {
    const { data: base } = await admin.from('bases_preco').select('api_uf').eq('id', base_id).maybeSingle();
    const uf = base?.api_uf ?? UF_PADRAO;

    const { data: usados } = await admin.from('modelo_itens')
      .select('codigo, indice').not('codigo', 'is', null).like('base_id', 'sinapi%');
    const codigos = Array.from(new Set((usados ?? []).map((i: any) => String(i.codigo))));
    const indices = new Map((usados ?? []).map((i: any) => [String(i.codigo), Number(i.indice)]));

    const { data: atuais } = await admin.from('composicoes').select('codigo, custo_unitario').eq('base_id', base_id);
    const antes = new Map((atuais ?? []).map((c: any) => [c.codigo, Number(c.custo_unitario)]));

    const pend: any[] = [];
    const ups: any[] = [];
    const vars: number[] = [];
    let consultados = 0;

    for (const cod of codigos) {
      try {
        const c = await composicao(cod, uf, referencia);
        if (!c?.preco) continue;
        consultados++;
        ups.push({
          base_id, codigo: cod, descricao: c.nome || cod, unidade: c.unidade,
          tipo: 'composicao', custo_unitario: c.preco, atualizado_em: new Date().toISOString(),
        });
        const ant = antes.get(cod);
        if (ant !== undefined && Math.abs(c.preco - ant) > 0.01) {
          const v = ant > 0 ? Math.round((c.preco / ant - 1) * 1000) / 10 : 0;
          vars.push(v);
          const idx = indices.get(cod) ?? 0;
          pend.push({
            base_id, referencia, codigo: cod, descricao: c.nome, unidade: c.unidade,
            preco_atual: ant, preco_novo: c.preco, variacao_pct: v,
            usado_em_modelo: idx > 0, impacto_m2: Math.round((c.preco - ant) * idx * 100) / 100,
          });
        }
      } catch (e: any) {
        if (String(e.message).includes('Limite')) break;
      }
    }

    for (let i = 0; i < ups.length; i += 500) {
      await admin.from('composicoes').upsert(ups.slice(i, i + 500), { onConflict: 'base_id,codigo' });
    }
    if (pend.length) {
      await admin.from('sinapi_pendencias').upsert(pend, { onConflict: 'base_id,referencia,codigo' });
    }

    const varMedia = vars.length ? Math.round(vars.reduce((s, v) => s + v, 0) / vars.length * 100) / 100 : null;

    await admin.from('bases_preco').update({
      referencia, sincronizado_em: new Date().toISOString(),
    }).eq('id', base_id);

    await admin.from('sinapi_sincronizacoes').insert({
      base_id, referencia, origem: 'webhook',
      codigos_consultados: consultados, codigos_alterados: pend.length, variacao_media_pct: varMedia,
    });

    // o briefing de amanhã avisa: virou pendência, não notificação perdida
    console.log(`[sinapi:webhook] ref ${referencia}: ${consultados} consultados, ${pend.length} alterados, média ${varMedia}%`);

    return NextResponse.json({ ok: true, referencia, consultados, alterados: pend.length });
  } catch (e: any) {
    await admin.from('sinapi_sincronizacoes').insert({
      base_id, referencia, origem: 'webhook', erro: String(e.message).slice(0, 300),
    });
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }
}

/** GET para o Orçamentador validar que a URL existe. */
export async function GET() {
  return NextResponse.json({ ok: true, servico: 'webhook sinapi se73um' });
}
