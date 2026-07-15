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

export default function MeuDiaClient({ itens, obras, perfil }: { itens: any[]; obras: any[]; perfil: any }) {
  const [lista, setLista] = useState(itens);
  const [ocupado, setOcupado] = useState(false);
  const [verAdiante, setVerAdiante] = useState(false);
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

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>{saudacao}, {perfil?.nome?.split(' ')[0] ?? ''}</h2>
        <p className="hint">
          {grupos.atrasado.length > 0
            ? `${grupos.atrasado.length} item(ns) atrasado(s) · ${grupos.hoje.length} para hoje`
            : grupos.hoje.length > 0 ? `${grupos.hoje.length} item(ns) para hoje. Nada atrasado. 👌`
            : 'Nada atrasado nem vencendo hoje. Bom dia de trabalho. 🎉'}
        </p>
      </div>

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className={`kpi ${grupos.atrasado.length ? 'acc' : 'okk'}`}><div className="lbl">Atrasados</div><div className="val">{grupos.atrasado.length}</div></div>
        <div className="kpi blu"><div className="lbl">Para hoje</div><div className="val">{grupos.hoje.length}</div></div>
        <div className="kpi wrn"><div className="lbl">Esperando sua decisão</div><div className="val">{decisoes.length}</div><div className="foot">medições e compras</div></div>
        <div className="kpi"><div className="lbl">Próximos 7 dias</div><div className="val">{grupos.semana.length}</div></div>
      </div>

      <div style={{ marginTop: 14 }}>
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
