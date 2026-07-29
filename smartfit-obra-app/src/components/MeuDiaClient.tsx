'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Anel, Metricas } from './Visual';
import { fmtData, fmtBRL, fmtPeriodo } from '@/lib/contrato';

const TIPO_INFO: Record<string, { rotulo: string; cor: string; href: string }> = {
  tarefa:     { rotulo: 'TAREFA',     cor: 'st-exec',  href: '/tarefas' },
  rotina:     { rotulo: 'ROTINA',     cor: 'st-valid', href: '/rotinas' },
  medicao:    { rotulo: 'MEDIÇÃO',    cor: 'st-valid', href: '/cronograma' },
  pedido:     { rotulo: 'COMPRA',     cor: 'st-valid', href: '/materiais' },
  financeiro: { rotulo: 'FINANCEIRO', cor: 'st-pend',  href: '/financeiro' },
  documento:  { rotulo: 'DOCUMENTO',  cor: 'st-risk',  href: '/documentos' },
};

export default function MeuDiaClient({ itens, obras, perfil, briefing, pessoas }:
  { itens: any[]; obras: any[]; perfil: any; briefing?: any; pessoas: any[] }) {
  const [lista, setLista] = useState(itens);
  const [ocupado, setOcupado] = useState(false);
  const [verAdiante, setVerAdiante] = useState(false);
  const [briefAberto, setBriefAberto] = useState(briefing ? !briefing.lido : false);
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set());
  const supabase = supabaseBrowser();
  const hoje = new Date().toISOString().slice(0, 10);
  const em7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const obraCod = (id: number | null) => id ? (obras.find(o => o.id === id)?.codigo ?? '—') : 'Empresa';
  const pessoaNome = (id: string | null) => id ? (pessoas.find(p => p.id === id)?.nome ?? '—') : '—';
  const toggleGrupo = (chave: string) => setGruposAbertos(s => {
    const n = new Set(s);
    n.has(chave) ? n.delete(chave) : n.add(chave);
    return n;
  });

  // buckets por data — usados só no resumo do topo, que é uma leitura
  // diferente da lista detalhada (essa é reordenada por criticidade abaixo)
  const grupos = useMemo(() => ({
    atrasado: lista.filter(i => i.vencimento && i.vencimento < hoje),
    hoje: lista.filter(i => i.vencimento === hoje),
    semana: lista.filter(i => i.vencimento && i.vencimento > hoje && i.vencimento <= em7),
    depois: lista.filter(i => !i.vencimento || i.vencimento > em7),
  }), [lista, hoje, em7]);

  const decisoes = lista.filter(i => ['medicao', 'pedido'].includes(i.tipo));

  // ---- lista detalhada: reordenada por criticidade, não só por data.
  // decisão com consequência contratual nunca fica abaixo de rotina.
  const decisao = (i: any) => i.tipo === 'medicao' || i.tipo === 'pedido';
  const vencido = (i: any) => i.vencimento && i.vencimento < hoje;
  const financeiroCritico = (i: any) => i.tipo === 'financeiro' && (vencido(i) || i.vencimento === hoje);
  const tiers = useMemo(() => ({
    decisaoVencida:  lista.filter(i => decisao(i) && vencido(i)),
    decisaoPendente: lista.filter(i => decisao(i) && !vencido(i)),
    financeiro:      lista.filter(financeiroCritico),
    outroVencido:    lista.filter(i => !decisao(i) && i.tipo !== 'financeiro' && vencido(i)),
    hoje:            lista.filter(i => !decisao(i) && i.tipo !== 'financeiro' && i.vencimento === hoje),
    semana:          lista.filter(i => !decisao(i) && !financeiroCritico(i) && i.vencimento && i.vencimento > hoje && i.vencimento <= em7),
    depois:          lista.filter(i => !decisao(i) && !financeiroCritico(i) && (!i.vencimento || i.vencimento > em7)),
  }), [lista, hoje, em7]);

  async function concluirTarefa(item: any) {
    setOcupado(true);
    const { error } = await supabase.from('tarefas').update({ coluna: 3 }).eq('id', Number(item.id));
    setOcupado(false);
    if (error) { alert(error.message); return; }
    setLista(l => l.filter(x => !(x.tipo === 'tarefa' && x.id === item.id)));
  }

  async function concluirRotina(item: any) {
    setOcupado(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('rotina_ocorrencias').update({
      status: 'concluida', concluida_em: new Date().toISOString(), concluida_por: user?.id,
    }).eq('id', Number(item.id));
    setOcupado(false);
    if (error) { alert(error.message); return; }
    setLista(l => l.filter(x => !(x.tipo === 'rotina' && x.id === item.id)));
  }

  async function excluirTarefa(item: any) {
    if (!confirm(`Excluir a tarefa "${item.titulo}"?\n\nIsto apaga de vez. Não dá para desfazer.`)) return;
    setOcupado(true);
    const { error } = await supabase.from('tarefas').delete().eq('id', Number(item.id));
    setOcupado(false);
    if (error) { alert(error.message); return; }
    setLista(l => l.filter(x => !(x.tipo === 'tarefa' && x.id === item.id)));
  }

  async function excluirRotina(item: any) {
    // A ocorrência some, mas a rotina-mãe segue gerando: sem esse aviso, o
    // usuário acha que apagou de vez e vê o item voltar amanhã.
    const ok = confirm(
      `Excluir esta ocorrência de "${item.titulo}"?\n\n` +
      `Atenção: isto remove só a ocorrência de hoje. Como a rotina continua ativa, ` +
      `ela vai gerar a próxima normalmente. Para parar de vez, desative a rotina na aba Rotinas.`
    );
    if (!ok) return;
    setOcupado(true);
    const { error } = await supabase.from('rotina_ocorrencias').delete().eq('id', Number(item.id));
    setOcupado(false);
    if (error) { alert(error.message); return; }
    setLista(l => l.filter(x => !(x.tipo === 'rotina' && x.id === item.id)));
  }

  const LinhaItem = ({ i, critico }: { i: any; critico?: boolean }) => {
    const info = TIPO_INFO[i.tipo];
    const atrasado = i.vencimento && i.vencimento < hoje;
    return (
      <div className={`dia-item ${critico ? 'critico' : ''}`}>
        <span className={`stamp ${info.cor}`} style={{ minWidth: 92, justifyContent: 'center' }}>{info.rotulo}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{i.titulo}</div>
          <div className="hint">
            {obraCod(i.obra_id)} · {i.situacao}
            {i.tipo === 'rotina' && i.responsavel_id ? ` · ${pessoaNome(i.responsavel_id)}` : ''}
            {i.responsavel_txt ? ` · ${i.responsavel_txt}` : ''}
            {i.valor ? ` · ${fmtBRL(Number(i.valor))}` : ''}
            {i.vencimento ? ` · ${atrasado ? '⚠ venceu em ' : ''}${fmtData(i.vencimento)}` : ''}
          </div>
        </div>
        {i.prioridade === 'alta' && <span className="stamp st-risk" style={{ fontSize: 9.5 }}>ALTA</span>}
        {i.tipo === 'rotina'
          ? <>
              <button className="mini" disabled={ocupado} onClick={() => concluirRotina(i)}>✓ concluir</button>
              <button className="mini" disabled={ocupado} onClick={() => excluirRotina(i)} title="excluir ocorrência">✕</button>
            </>
          : i.tipo === 'tarefa'
          ? <>
              <button className="mini" disabled={ocupado} onClick={() => concluirTarefa(i)}>✓ concluir</button>
              <button className="mini" disabled={ocupado} onClick={() => excluirTarefa(i)} title="excluir tarefa">✕</button>
              <Link href={info.href} className="mini" style={{ textDecoration: 'none' }}>abrir →</Link>
            </>
          : <Link href={info.href} className="mini" style={{ textDecoration: 'none' }}>abrir →</Link>}
      </div>
    );
  };

  // ocorrências repetidas da mesma rotina (ex.: RDO todo dia útil) viram uma
  // linha-resumo expansível, em vez de afogar a tela uma por dia
  function agruparRotinas(itens: any[]) {
    const porTitulo = new Map<string, any[]>();
    const saida: any[] = [];
    for (const i of itens) {
      if (i.tipo !== 'rotina') { saida.push(i); continue; }
      const arr = porTitulo.get(i.titulo);
      if (arr) arr.push(i); else porTitulo.set(i.titulo, [i]);
    }
    porTitulo.forEach((ocorrencias, titulo) => {
      if (ocorrencias.length === 1) { saida.push(ocorrencias[0]); return; }
      const datas = ocorrencias.map(o => o.vencimento).filter(Boolean).sort();
      saida.push({
        ehGrupo: true,
        chave: `grupo-${titulo}`,
        titulo,
        obra_id: ocorrencias[0].obra_id,
        prioridade: ocorrencias.some(o => o.prioridade === 'alta') ? 'alta' : ocorrencias[0].prioridade,
        itens: ocorrencias,
        vencimento: datas[0],
        dataMin: datas[0],
        dataMax: datas[datas.length - 1],
        todasVencidas: ocorrencias.every(o => o.vencimento && o.vencimento < hoje),
      });
    });
    return saida.sort((a, b) => (a.vencimento ?? '9').localeCompare(b.vencimento ?? '9'));
  }

  const Bloco = ({ titulo, itens, destaque, colapsavel, aberto, onToggle, forte }:
    { titulo: string; itens: any[]; destaque?: string; colapsavel?: boolean; aberto?: boolean; onToggle?: () => void; forte?: boolean }) => {
    if (!itens.length) return null;
    const linhas = agruparRotinas(itens);
    return (
      <div className="panel">
        <div className="hd" style={colapsavel ? { cursor: 'pointer' } : undefined} onClick={colapsavel ? onToggle : undefined}>
          <h3 style={destaque ? { color: destaque } : undefined}>{titulo} · {itens.length}</h3>
          {colapsavel && <button className="mini">{aberto ? 'ocultar ▲' : 'mostrar ▼'}</button>}
        </div>
        {(!colapsavel || aberto) && <div className="bd" style={{ padding: 0 }}>
          {linhas.map((entry, k) => entry.ehGrupo ? (
            <div key={entry.chave}>
              <div className={`dia-item ${forte ? 'critico' : ''}`} style={{ cursor: 'pointer' }} onClick={() => toggleGrupo(entry.chave)}>
                <span className={`stamp ${TIPO_INFO.rotina.cor}`} style={{ minWidth: 92, justifyContent: 'center' }}>{TIPO_INFO.rotina.rotulo}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {gruposAbertos.has(entry.chave) ? '▾' : '▸'} {entry.titulo} — {entry.itens.length} {entry.todasVencidas ? 'atrasada(s)' : 'pendente(s)'} ({fmtPeriodo(entry.dataMin, entry.dataMax)})
                  </div>
                  <div className="hint">{obraCod(entry.obra_id)}{entry.todasVencidas ? ' · ⚠ vencidas' : ''}</div>
                </div>
                {entry.prioridade === 'alta' && <span className="stamp st-risk" style={{ fontSize: 9.5 }}>ALTA</span>}
              </div>
              {gruposAbertos.has(entry.chave) && entry.itens.map((sub: any) => <LinhaItem key={`${sub.tipo}-${sub.id}`} i={sub} critico={forte} />)}
            </div>
          ) : <LinhaItem key={`${entry.tipo}-${entry.id}-${k}`} i={entry} critico={forte} />)}
        </div>}
      </div>
    );
  };

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiro = (perfil?.nome ?? '').split(' ')[0];

  const resumo = grupos.atrasado.length > 0
    ? <><b>{grupos.atrasado.length} item(ns) atrasado(s)</b> e {grupos.hoje.length} para hoje.</>
    : grupos.hoje.length > 0
    ? <>{grupos.hoje.length} item(ns) para hoje. Nada atrasado.</>
    : <>Nada atrasado nem vencendo hoje. O dia é seu para pensar.</>;

  // percentual do que já saiu do caminho, sobre o que estava previsto para o período
  const totalPeriodo = grupos.atrasado.length + grupos.hoje.length + grupos.semana.length;
  const pctConcluido = totalPeriodo > 0
    ? Math.round((1 - (grupos.atrasado.length + grupos.hoje.length) / totalPeriodo) * 100)
    : 100;

  return (
    <>
      <section className="cock-hero">
        <div className="saud">{saudacao}{primeiro ? `, ${primeiro}` : ''}</div>
        <div className="resumo">{resumo}</div>
        <div className="cock-strip">
          <div className={`it ${grupos.atrasado.length ? 'risco' : ''}`}>
            <div className="n">{grupos.atrasado.length}</div><div className="l">Atrasados</div>
          </div>
          <div className="it"><div className="n">{grupos.hoje.length}</div><div className="l">Para hoje</div></div>
          <div className={`it ${decisoes.length ? 'risco' : ''}`}>
            <div className="n">{decisoes.length}</div><div className="l">Sua decisão</div>
          </div>
          <div className="it"><div className="n">{grupos.semana.length}</div><div className="l">Próx. 7 dias</div></div>
        </div>
      </section>

      {briefing && (
        <div className="panel adv-brief">
          <div className="hd" style={{ cursor: 'pointer' }} onClick={async () => {
            const abrindo = !briefAberto;
            setBriefAberto(abrindo);
            if (abrindo && !briefing.lido) { briefing.lido = true; await supabase.from('advisor_briefings').update({ lido: true }).eq('id', briefing.id); }
          }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="adv-brief-dot" /> Briefing do advisor · {fmtData(briefing.data)}
            </h3>
            <span className="hint">{briefAberto ? 'recolher' : (briefing.lido ? 'abrir' : 'novo · abrir')}</span>
          </div>
          {briefAberto && <div className="bd adv-brief-txt">{briefing.conteudo}</div>}
        </div>
      )}

      <div className="panel">
        <div className="hd"><h3>Seu resumo hoje</h3></div>
        <div className="bd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <Metricas itens={[
                { n: String(grupos.hoje.length + grupos.atrasado.length).padStart(2, '0'), label: 'Pendências', sub: 'para hoje', risco: grupos.atrasado.length > 0 },
                { n: String(decisoes.length).padStart(2, '0'), label: 'Decisões', sub: 'aguardando você', risco: decisoes.length > 0 },
                { n: String(grupos.semana.length).padStart(2, '0'), label: 'Próximos 7 dias', sub: 'atividades' },
              ]} />
            </div>
            <Anel pct={pctConcluido} rotulo="concluído" />
          </div>
        </div>
      </div>

      <div>
        <Bloco titulo="🔴 Decisão vencida" itens={tiers.decisaoVencida} destaque="var(--risk)" forte />
        <Bloco titulo="Decisões e aprovações pendentes" itens={tiers.decisaoPendente} />
        <Bloco titulo="Financeiro vencido ou de hoje" itens={tiers.financeiro} />
        <Bloco titulo="⚠ Atrasado" itens={tiers.outroVencido} destaque="var(--risk)" />
        <Bloco titulo="Hoje" itens={tiers.hoje} />
        <Bloco titulo="Próximos 7 dias" itens={tiers.semana} />
        <Bloco titulo="Adiante (próximos 30 dias)" itens={tiers.depois} colapsavel aberto={verAdiante} onToggle={() => setVerAdiante(v => !v)} />
        {lista.length === 0 && (
          <div className="panel"><div className="bd">
            <p className="hint">Nenhuma pendência. Ou está tudo em dia, ou falta cadastrar rotinas (aba Rotinas).</p>
          </div></div>
        )}
      </div>
    </>
  );
}
