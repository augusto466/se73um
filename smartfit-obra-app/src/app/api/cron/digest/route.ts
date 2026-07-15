import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { enviar, emailDigest } from '@/lib/email';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const semanaAtras = new Date(Date.now() - 7 * 86400000).toISOString();
  const hoje = new Date().toISOString().slice(0, 10);

  const { data: obras } = await admin.from('obras').select('*').eq('status', 'ativa');
  const { data: perfis } = await admin.from('profiles').select('id, email, papel').eq('notificar', true);
  const resultados: any[] = [];

  for (const obra of obras ?? []) {
    const [{ data: eventos }, { data: tarefas }, { data: rdos }, { data: pedidos }, { data: vinculos }] = await Promise.all([
      admin.from('eventos').select('*').eq('obra_id', obra.id),
      admin.from('tarefas').select('id, prazo, coluna').eq('obra_id', obra.id),
      admin.from('diario').select('id').eq('obra_id', obra.id).gte('criado_em', semanaAtras),
      admin.from('pedidos_materiais').select('id, titulo, status').eq('obra_id', obra.id),
      admin.from('obra_usuarios').select('usuario_id').eq('obra_id', obra.id),
    ]);

    const evs = eventos ?? [];
    const medidos = evs.filter(e => ['aprovado', 'glosado'].includes(e.status));
    const medidoBruto = medidos.reduce((s, e) => s + Number(e.valor_bruto) - Number(e.valor_glosa || 0), 0);
    const ret = Number(obra.retencao_pct);
    const retido = medidoBruto * ret;
    const meses = (obra.meses ?? []) as any[];
    const planAcum = meses.filter(m => m.id <= obra.mes_atual).reduce((s, m) => s + Number(m.plan), 0);

    const html = emailDigest(obra, {
      pctExec: obra.valor_global ? medidoBruto / Number(obra.valor_global) * 100 : 0,
      medidoBruto, liberado: medidoBruto - retido, retido,
      desvio: medidoBruto - planAcum,
      diasEntrega: obra.entrega_final
        ? Math.ceil((new Date(obra.entrega_final + 'T12:00:00').getTime() - Date.now()) / 86400000) : 0,
      aprovadosSemana: medidos.filter(e => e.atualizado_em >= semanaAtras)
        .map(e => `${e.id} — ${e.etapa} (${Number(e.valor_bruto).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`),
      emValidacao: evs.filter(e => e.status === 'validacao').map(e => `${e.id} — ${e.etapa}`),
      tarefasAtrasadas: (tarefas ?? []).filter(t => t.prazo && t.prazo < hoje && t.coluna < 3).length,
      rdosSemana: (rdos ?? []).length,
      pedidosAguardando: (pedidos ?? []).filter(p => p.status === 'enviado')
        .map(p => `PM-${String(p.id).padStart(3, '0')} — ${p.titulo}`),
    });

    const ids = (vinculos ?? []).map(v => v.usuario_id);
    const destinos = (perfis ?? [])
      .filter(p => p.papel === 'admin' || ids.includes(p.id))
      .map(p => p.email).filter(Boolean) as string[];

    try {
      const r = await enviar(destinos, `[${obra.codigo}] Boletim semanal de avanço — ${obra.nome}`, html);
      resultados.push({ obra: obra.codigo, ...r });
    } catch (e: any) {
      resultados.push({ obra: obra.codigo, erro: e.message });
    }
  }

  return NextResponse.json({ ok: true, obras: resultados });
}
