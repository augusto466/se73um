import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { enviar, emailDigest } from '@/lib/email';
import { CONTRATO, MESES } from '@/lib/contrato';

export async function GET(req: Request) {
  // proteção: só o cron da Vercel (ou chamada manual com o segredo)
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const semanaAtras = new Date(Date.now() - 7 * 86400000).toISOString();
  const hoje = new Date().toISOString().slice(0, 10);

  const [{ data: eventos }, { data: perfis }, { data: tarefas }, { data: rdos }, { data: pedidos }] = await Promise.all([
    admin.from('eventos').select('*'),
    admin.from('profiles').select('email').eq('notificar', true),
    admin.from('tarefas').select('id, prazo, coluna'),
    admin.from('diario').select('id').gte('criado_em', semanaAtras),
    admin.from('pedidos_materiais').select('id, titulo, status'),
  ]);

  const evs = eventos ?? [];
  const medidos = evs.filter(e => ['aprovado', 'glosado'].includes(e.status));
  const medidoBruto = medidos.reduce((s, e) => s + Number(e.valor_bruto) - Number(e.valor_glosa || 0), 0);
  const retido = medidoBruto * CONTRATO.retencaoPct;
  const mesAtual = 2; // ajuste conforme avanço real da obra
  const planAcum = MESES.filter(m => m.id <= mesAtual).reduce((s, m) => s + m.plan, 0);

  const digest = emailDigest({
    pctExec: medidoBruto / CONTRATO.valorGlobal * 100,
    medidoBruto,
    liberado: medidoBruto - retido,
    retido,
    desvio: medidoBruto - planAcum,
    diasEntrega: Math.ceil((new Date(CONTRATO.entregaFinal + 'T12:00:00').getTime() - Date.now()) / 86400000),
    aprovadosSemana: medidos
      .filter(e => e.atualizado_em >= semanaAtras)
      .map(e => `${e.id} — ${e.etapa} (${Number(e.valor_bruto).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`),
    emValidacao: evs.filter(e => e.status === 'validacao').map(e => `${e.id} — ${e.etapa}`),
    tarefasAtrasadas: (tarefas ?? []).filter(t => t.prazo && t.prazo < hoje && t.coluna < 3).length,
    rdosSemana: (rdos ?? []).length,
    pedidosAguardando: (pedidos ?? [])
      .filter(p => p.status === 'enviado')
      .map(p => `PM-${String(p.id).padStart(3, '0')} — ${p.titulo}`),
  });

  const destinos = (perfis ?? []).map(p => p.email).filter(Boolean);
  try {
    const r = await enviar(destinos, '[Obra Smart Fit] Boletim semanal de avanço — Contrato TK-328/2026', digest);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }
}
