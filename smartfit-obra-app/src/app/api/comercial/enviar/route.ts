import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const maxDuration = 60;

/**
 * GET  ?proposta=1 → prepara o rascunho (destinatário, assunto, corpo)
 * POST { proposta_id, para, copia, assunto, corpo } → envia
 *
 * O sistema PREPARA; o usuário lê e clica. E-mail a cliente não tem CTRL+Z —
 * por isso o advisor redige mas nunca envia.
 */
export async function GET(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const id = Number(new URL(req.url).searchParams.get('proposta'));
  if (!id) return NextResponse.json({ erro: 'Informe a proposta.' }, { status: 400 });

  const { data: p } = await supa.from('propostas')
    .select('*, oportunidades(*)').eq('id', id).maybeSingle();
  if (!p) return NextResponse.json({ erro: 'Proposta não encontrada.' }, { status: 404 });

  const op: any = p.oportunidades;
  const { data: perfil } = await supa.from('profiles').select('nome').eq('id', user.id).single();
  const { data: envios } = await supa.from('proposta_envios')
    .select('para, assunto, enviado_em, status').eq('proposta_id', id).order('enviado_em', { ascending: false });

  const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const versao = `R${String(p.versao).padStart(2, '0')}`;
  const validade = new Date(Date.now() + (p.validade_dias ?? 30) * 86400000).toLocaleDateString('pt-BR');

  const assunto = `Proposta ${versao} — ${p.titulo ?? op.titulo}${op.codigo ? ` (${op.codigo})` : ''}`;
  const corpo = [
    `${op.contato_nome ? op.contato_nome + ',' : 'Prezados,'}`,
    '',
    `Segue nossa proposta para ${p.titulo ?? op.titulo}${op.local ? `, em ${op.local}` : ''}.`,
    '',
    `Valor total: ${brl(p.preco_total)}`,
    p.prazo_meses ? `Prazo de execução: ${p.prazo_meses} meses a contar da ordem de serviço e liberação da frente de trabalho.` : '',
    `Validade da proposta: ${p.validade_dias ?? 30} dias (até ${validade}).`,
    '',
    'O documento em anexo traz o escopo considerado, o resumo por etapa e a planilha detalhada.',
    '',
    'Ficamos à disposição para esclarecer qualquer ponto e ajustar o que for necessário.',
    '',
    'Atenciosamente,',
    perfil?.nome ?? '',
    'Se73um Technology · Modo Modular',
  ].filter(l => l !== '').join('\n');

  return NextResponse.json({
    ok: true,
    para: op.contato_email ?? '',
    assunto, corpo,
    proposta: { versao, preco_total: p.preco_total, status: p.status },
    envios: envios ?? [],
    aviso: !op.contato_email ? 'A oportunidade não tem e-mail de contato — informe abaixo ou cadastre na oportunidade.' : null,
  });
}

export async function POST(req: Request) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: perfil } = await supa.from('profiles').select('papel, nome').eq('id', user.id).single();
  if (!['admin', 'contratante'].includes(perfil?.papel ?? '')) {
    return NextResponse.json({ erro: 'Somente admin ou contratante envia proposta.' }, { status: 403 });
  }

  const { proposta_id, para, copia, assunto, corpo } = await req.json();
  if (!proposta_id || !para || !assunto || !corpo) {
    return NextResponse.json({ erro: 'Informe destinatário, assunto e corpo.' }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(para).trim())) {
    return NextResponse.json({ erro: `"${para}" não parece um e-mail válido.` }, { status: 400 });
  }

  const chave = process.env.RESEND_API_KEY;
  const remetente = process.env.RESEND_FROM;
  if (!chave || !remetente) {
    return NextResponse.json({
      erro: 'Envio por e-mail não configurado. Adicione RESEND_API_KEY e RESEND_FROM nas variáveis da Vercel. Enquanto isso, baixe o PDF e envie pelo seu cliente de e-mail.',
    }, { status: 503 });
  }

  const { data: p } = await supa.from('propostas')
    .select('*, oportunidades(*)').eq('id', proposta_id).maybeSingle();
  if (!p) return NextResponse.json({ erro: 'Proposta não encontrada.' }, { status: 404 });

  // o PDF vai como link, não como anexo: gerar PDF binário exigiria headless
  // browser na serverless — o link abre a proposta pronta para imprimir
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const link = `${base}/api/comercial/pdf?proposta=${proposta_id}`;

  const html = `<div style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#0D0D0F;max-width:640px">
${String(corpo).split('\n').map(l => l.trim() ? `<p style="margin:0 0 10px">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` : '<br>').join('')}
<p style="margin:22px 0"><a href="${link}" style="background:#FD1843;color:#fff;padding:11px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Abrir a proposta</a></p>
<hr style="border:0;border-top:1px solid #E6E6EA;margin:22px 0">
<p style="font-size:11px;color:#6B6B75;margin:0">Se73um Technology · Modo Modular</p>
</div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remetente,
        to: [String(para).trim()],
        cc: copia ? [String(copia).trim()] : undefined,
        reply_to: undefined,
        subject: assunto,
        html,
      }),
    });
    const j = await r.json();

    if (!r.ok) {
      await supa.from('proposta_envios').insert({
        proposta_id, para, copia: copia || null, assunto, corpo,
        status: 'falhou', erro: JSON.stringify(j).slice(0, 300), enviado_por: user.id,
      });
      return NextResponse.json({ erro: `O Resend recusou: ${j.message ?? r.status}` }, { status: 502 });
    }

    await supa.from('proposta_envios').insert({
      proposta_id, para, copia: copia || null, assunto, corpo,
      provedor_id: j.id, status: 'enviado', enviado_por: user.id,
    });

    // o funil anda sozinho: proposta enviada é o estágio "proposta"
    await supa.from('propostas').update({
      status: 'enviada', enviada_em: new Date().toISOString().slice(0, 10),
    }).eq('id', proposta_id).eq('status', 'rascunho');

    await supa.from('oportunidades').update({
      estagio: 'proposta', probabilidade: 60, atualizado_em: new Date().toISOString(),
    }).eq('id', (p.oportunidades as any).id).in('estagio', ['contato', 'premissas', 'orcamento']);

    return NextResponse.json({ ok: true, id: j.id, link });
  } catch (e: any) {
    return NextResponse.json({ erro: 'Falha no envio: ' + e.message }, { status: 500 });
  }
}
