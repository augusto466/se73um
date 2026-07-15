'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtData } from '@/lib/contrato';

const TIPO_INFO: Record<string, { rotulo: string; cor: string; href: string }> = {
  tarefa:     { rotulo: 'TAREFA',     cor: 'st-exec',  href: '/tarefas' },
  rotina:     { rotulo: 'ROTINA',     cor: 'st-valid', href: '/rotinas' },
  medicao:    { rotulo: 'MEDIÇÃO',    cor: 'st-valid', href: '/cronograma' },
  pedido:     { rotulo: 'COMPRA',     cor: 'st-valid', href: '/materiais' },
  financeiro: { rotulo: 'FINANCEIRO', cor: 'st-pend',  href: '/financeiro' },
  documento:  { rotulo: 'DOCUMENTO',  cor: 'st-risk',  href: '/documentos' },
};

export default function MeuDiaClient({ itens, obras, perfil, briefing }: { itens: any[]; obras: any[]; perfil: any; briefing?: any }) {
  const [lista, setLista] = useState(itens);
  const [ocupado, setOcupado] = useState(false);
  const [verAdiante, setVerAdiante] = useState(false);
  const [briefAberto, setBriefAberto] = useState(briefing ? !briefing.lido : false);
  const supabase = supabaseBrowser();
  const hoje = new Date().toISOString().slice(0, 10);
  const em7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const obraCod = (id: number | null) => id ? (obras.find(o => o.id === id)?.codigo ?? '—') : 'Empresa';

  const grupos = useMemo(() => ({
    atrasado: lista.filter(i => i.vencimento && i.vencimento < hoje),
    hoje: lista.filter(i => i.vencimento === hoje),
    semana: lista.filter(i => i.vencimento && i.vencimento > hoje && i.vencimento <= em7),
    depois: lista.filter(i => !i.vencimento || i.vencimento > em7),
  }), [lista, hoje, em7]);

  const decisoes = lista.filter(i => ['medicao', 'pedido'].includes(i.tipo));

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

  const Bloco = ({ titulo, itens, destaque, colapsavel, aberto, onToggle }:
    { titulo: string; itens: any[]; destaque?: string; colapsavel?: boolean; aberto?: boolean; onToggle?: () => void }) => {
    if (!itens.length) return null;
    return (
      <div className="panel">
        <div className="hd" style={colapsavel ? { cursor: 'pointer' } : undefined} onClick={colapsavel ? onToggle : undefined}>
          <h3 style={destaque ? { color: destaque } : undefined}>{titulo} · {itens.length}</h3>
          {colapsavel && <button className="mini">{aberto ? 'ocultar ▲' : 'mostrar ▼'}</button>}
        </div>
        {(!colapsavel || aberto) && <div className="bd" style={{ padding: 0 }}>
          {itens.sort((a, b) => (a.vencimento ?? '9').localeCompare(b.vencimento ?? '9')).map((i, k) => {
            const info = TIPO_INFO[i.tipo];
            const atrasado = i.vencimento && i.vencimento < hoje;
            return (
              <div key={`${i.tipo}-${i.id}-${k}`} className="dia-item">
                <span className={`stamp ${info.cor}`} style={{ minWidth: 92, justifyContent: 'center' }}>{info.rotulo}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{i.titulo}</div>
                  <div className="hint">
                    {obraCod(i.obra_id)} · {i.situacao}
                    {i.responsavel_txt ? ` · ${i.responsavel_txt}` : ''}
                    {i.vencimento ? ` · ${atrasado ? '⚠ venceu em ' : ''}${fmtData(i.vencimento)}` : ''}
                  </div>
                </div>
                {i.prioridade === 'alta' && <span className="stamp st-risk" style={{ fontSize: 9.5 }}>ALTA</span>}
                {i.tipo === 'rotina'
                  ? <button className="mini" disabled={ocupado} onClick={() => concluirRotina(i)}>✓ concluir</button>
                  : i.tipo === 'tarefa'
                  ? <>
                      <button className="mini" disabled={ocupado} onClick={() => concluirTarefa(i)}>✓ concluir</button>
                      <Link href={info.href} className="mini" style={{ textDecoration: 'none' }}>abrir →</Link>
                    </>
                  : <Link href={info.href} className="mini" style={{ textDecoration: 'none' }}>abrir →</Link>}
              </div>
            );
          })}
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

      <div>
        <Bloco titulo="⚠ Atrasado" itens={grupos.atrasado} destaque="var(--risk)" />
        <Bloco titulo="Hoje" itens={grupos.hoje} />
        <Bloco titulo="Próximos 7 dias" itens={grupos.semana} />
        <Bloco titulo="Adiante (próximos 30 dias)" itens={grupos.depois} colapsavel aberto={verAdiante} onToggle={() => setVerAdiante(v => !v)} />
        {lista.length === 0 && (
          <div className="panel"><div className="bd">
            <p className="hint">Nenhuma pendência. Ou está tudo em dia, ou falta cadastrar rotinas (aba Rotinas).</p>
          </div></div>
        )}
      </div>
    </>
  );
}
