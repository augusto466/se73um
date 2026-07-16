import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { empresaAtual, nomeEmpresa, urlLogo } from '@/lib/empresa';

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
  const [{ data: perfil }, emp] = await Promise.all([
    supa.from('profiles').select('nome').eq('id', user.id).single(),
    empresaAtual(),
  ]);
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
    nomeEmpresa(emp),
  ].filter(l => l !== '').join('\n');

  const avisos: string[] = [];
  if (!op.contato_email) avisos.push('A oportunidade não tem e-mail de contato — informe abaixo ou cadastre na oportunidade.');
  if (!emp?.email_remetente) avisos.push('A empresa não tem remetente configurado. Vá em Minha Empresa → Envio de e-mail.');
  else if (!emp.dominio_verificado) avisos.push(`O domínio de ${emp.email_remetente} ainda não foi verificado — o envio pelo sistema fica indisponível até lá. Baixe o PDF e envie pelo seu cliente de e-mail.`);

  return NextResponse.json({
    ok: true,
    para: op.contato_email ?? '',
    assunto, corpo,
    remetente: emp?.email_remetente ?? null,
    pode_enviar: !!emp?.email_remetente && !!emp?.dominio_verificado,
    proposta: { versao, preco_total: p.preco_total, status: p.status },
    envios: envios ?? [],
    aviso: avisos.length ? avisos.join(' ') : null,
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
  if (!chave) {
    return NextResponse.json({
      erro: 'Envio não configurado: falta RESEND_API_KEY nas variáveis da Vercel.',
    }, { status: 503 });
  }

  // A proposta sai do e-mail da EMPRESA, não da Se73um. Sem domínio verificado
  // o Resend recusa — e é bom que recuse: enviar em nome de domínio alheio é
  // o que os provedores classificam como spoofing.
  const emp = await empresaAtual();
  if (!emp?.email_remetente) {
    return NextResponse.json({
      erro: 'A empresa não tem remetente configurado. Vá em Minha Empresa → Envio de e-mail.',
    }, { status: 400 });
  }
  if (!emp.dominio_verificado) {
    return NextResponse.json({
      erro: `O domínio de ${emp.email_remetente} não está verificado. Sem isso o provedor recusa o envio. Baixe o PDF e envie pelo seu cliente de e-mail, ou verifique o domínio.`,
    }, { status: 400 });
  }
  const remetente = `${nomeEmpresa(emp)} <${emp.email_remetente}>`;

  const { data: p } = await supa.from('propostas')
    .select('*, oportunidades(*)').eq('id', proposta_id).maybeSingle();
  if (!p) return NextResponse.json({ erro: 'Proposta não encontrada.' }, { status: 404 });

  // o PDF vai como link, não como anexo: gerar PDF binário exigiria headless
  // browser na serverless — o link abre a proposta pronta para imprimir
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const link = `${base}/api/comercial/pdf?proposta=${proposta_id}`;

  const cor = emp.cor_marca || '#FD1843';
  const logo = urlLogo(emp.logo_path);
  const html = `<div style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#0D0D0F;max-width:640px">
${logo ? `<img src="${logo}" alt="${nomeEmpresa(emp)}" style="max-height:40px;max-width:160px;object-fit:contain;margin-bottom:18px">` : ''}
${String(corpo).split('\n').map(l => l.trim() ? `<p style="margin:0 0 10px">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` : '<br>').join('')}
<p style="margin:22px 0"><a href="${link}" style="background:${cor};color:#fff;padding:11px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Abrir a proposta</a></p>
<hr style="border:0;border-top:1px solid #E6E6EA;margin:22px 0">
<p style="font-size:11px;color:#6B6B75;margin:0">${nomeEmpresa(emp)}${emp.telefone ? ` · ${emp.telefone}` : ''}${emp.site ? ` · ${emp.site}` : ''}</p>
<p style="font-size:10px;color:#9A9AA3;margin:6px 0 0">by Se73um Technology</p>
</div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remetente,
        to: [String(para).trim()],
        cc: copia ? [String(copia).trim()] : undefined,
        reply_to: emp.email ?? undefined,
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
