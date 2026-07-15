import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { montarContexto } from '@/lib/contexto';
import { MODELO, ESFORCO, cacheBreakpoint, logUso } from '@/lib/ia';

export const maxDuration = 300;

const SISTEMA_BRIEFING = `Você é o advisor da Se73um. Todo dia de manhã você escreve um briefing curto para um usuário do sistema de gestão de obras — sem que ele pergunte nada.

Você recebe DOIS retratos da operação: o de HOJE e o de ONTEM (quando existir). Compare-os e escreva o briefing.

REGRAS:
- Máximo de 10 linhas. É leitura de café, não relatório.
- Estrutura: (1) O QUE MUDOU desde ontem, se algo mudou; (2) O QUE VENCE OU TRAVA hoje; (3) ONDE OLHAR primeiro, com o porquê em números.
- Se nada mudou e nada vence, diga isso em 2 linhas e aponte a única coisa que mais merece atenção.
- Fale com números reais dos retratos. Nada de generalidade.
- Respeite o perfil: para "contratada", nunca mencione valores financeiros de caixa, margem ou lançamentos.
- Respeite as decisões já tomadas listadas no retrato.
- Tom direto, respeitoso, português do Brasil. Sem markdown pesado, sem saudação, sem assinatura.`;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ erro: 'ANTHROPIC_API_KEY ausente.' }, { status: 503 });
  }

  const admin = supabaseAdmin();
  const hoje = new Date().toISOString().slice(0, 10);

  const { data: perfis } = await admin.from('profiles').select('id, nome, papel');
  const { data: todosVinculos } = await admin.from('obra_usuarios').select('usuario_id, obra_id');

  const resultados: any[] = [];

  for (const p of (perfis ?? []).slice(0, 15)) {
    try {
      const obras = (todosVinculos ?? []).filter(v => v.usuario_id === p.id).map(v => v.obra_id);
      if (p.papel !== 'admin' && !obras.length) {
        resultados.push({ usuario: p.nome, pulado: 'sem obras vinculadas' });
        continue;
      }

      // já gerou hoje? não gasta chamada à toa (o cron pode reexecutar)
      const { data: existente } = await admin.from('advisor_briefings')
        .select('id').eq('usuario_id', p.id).eq('data', hoje).maybeSingle();
      if (existente) { resultados.push({ usuario: p.nome, pulado: 'já gerado hoje' }); continue; }

      const retratoHoje = await montarContexto(p.papel, obras, p.id);
      const { data: anterior } = await admin.from('advisor_briefings')
        .select('retrato, data').eq('usuario_id', p.id).lt('data', hoje)
        .order('data', { ascending: false }).limit(1).maybeSingle();

      const prompt = anterior?.retrato
        ? `RETRATO DE ONTEM (${anterior.data}):\n${anterior.retrato}\n\n========================\n\nRETRATO DE HOJE (${hoje}):\n${retratoHoje}\n\nEscreva o briefing de hoje para ${p.nome} (perfil ${p.papel}).`
        : `RETRATO DE HOJE (${hoje}) — primeiro briefing, sem comparativo:\n${retratoHoje}\n\nEscreva o briefing de hoje para ${p.nome} (perfil ${p.papel}).`;

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODELO,
          max_tokens: 800,
          effort: ESFORCO,
          // o cron roda vários usuários em sequência: o system fica cacheado entre eles
          system: [{ type: 'text', text: SISTEMA_BRIEFING, cache_control: cacheBreakpoint }],
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!r.ok) { resultados.push({ usuario: p.nome, erro: `API ${r.status}` }); continue; }

      const data = await r.json();
      logUso('briefing', data.usage);
      const conteudo = (data.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim();
      if (!conteudo) { resultados.push({ usuario: p.nome, erro: 'resposta vazia' }); continue; }

      await admin.from('advisor_briefings').upsert(
        { usuario_id: p.id, data: hoje, conteudo, retrato: retratoHoje },
        { onConflict: 'usuario_id,data' }
      );
      resultados.push({ usuario: p.nome, ok: true });
    } catch (e: any) {
      resultados.push({ usuario: p.nome, erro: e.message });
    }
  }

  return NextResponse.json({ data: hoje, resultados });
}
