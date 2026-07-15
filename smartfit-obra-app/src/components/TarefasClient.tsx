'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtData } from '@/lib/contrato';

const COLS = ['A fazer', 'Em execução', 'Em validação', 'Concluído'];

export default function TarefasClient({ tarefasIniciais, eventos, obraId, centros, metricas }:
  { tarefasIniciais: any[]; eventos: any[]; obraId: number; centros: any[]; metricas: any[] }) {
  const [tarefas, setTarefas] = useState(tarefasIniciais);
  const [filtro, setFiltro] = useState('');
  const [form, setForm] = useState({ descricao: '', evento_id: '', responsavel: '', prioridade: 'media', prazo: '', centro_id: 'cc_operacoes', semObra: false });
  const supabase = supabaseBrowser();
  const hoje = new Date().toISOString().slice(0, 10);

  async function adicionar() {
    if (!form.descricao.trim()) { alert('Descreva a tarefa.'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!form.centro_id) { alert('Escolha o centro de custo.'); return; }
    const { data, error } = await supabase.from('tarefas').insert({
      descricao: form.descricao.trim(), evento_id: form.semObra ? null : (form.evento_id || null),
      responsavel: form.responsavel || null, prioridade: form.prioridade,
      prazo: form.prazo || null, coluna: 0, criado_por: user?.id,
      obra_id: form.semObra ? null : obraId,
      centro_id: form.centro_id,
    }).select().single();
    if (error) { alert(error.message); return; }
    setTarefas(t => [data, ...t]);
    setForm({ ...form, descricao: '', evento_id: '', responsavel: '', prazo: '' });
  }

  async function mover(t: any, dir: number) {
    const coluna = Math.min(3, Math.max(0, t.coluna + dir));
    const { error } = await supabase.from('tarefas').update({ coluna }).eq('id', t.id);
    if (!error) setTarefas(ts => ts.map(x => x.id === t.id ? { ...x, coluna } : x));
  }

  async function excluir(t: any) {
    if (!confirm('Excluir esta tarefa?')) return;
    const { error } = await supabase.from('tarefas').delete().eq('id', t.id);
    if (error) { alert('Sem permissão (apenas o criador ou o contratante).'); return; }
    setTarefas(ts => ts.filter(x => x.id !== t.id));
  }

  const vis = filtro ? tarefas.filter(t => t.centro_id === filtro) : tarefas;
  const nomeCentro = (id: string) => centros.find(c => c.id === id)?.nome ?? '—';

  return (
    <>
      <div className="panel">
        <div className="hd"><h3>Nova tarefa</h3><span className="hint">Vincule a um evento de medição para rastreabilidade</span></div>
        <div className="bd"><div className="form-grid">
          <div className="fg full" style={{gridColumn:'span 2'}}><label>Descrição</label>
            <input value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})} placeholder="Ex.: Protocolar projeto de incêndio no Corpo de Bombeiros" /></div>
          <div className="fg"><label>Evento vinculado</label>
            <select value={form.evento_id} onChange={e=>setForm({...form,evento_id:e.target.value})}>
              <option value="">— sem vínculo —</option>
              {eventos.map(e => <option key={e.id} value={e.id}>{e.id} · {e.etapa}</option>)}
            </select></div>
          <div className="fg"><label>Responsável</label><input value={form.responsavel} onChange={e=>setForm({...form,responsavel:e.target.value})} /></div>
          <div className="fg"><label>Prioridade</label>
            <select value={form.prioridade} onChange={e=>setForm({...form,prioridade:e.target.value})}>
              <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
            </select></div>
          <div className="fg"><label>Prazo</label><input type="date" value={form.prazo} onChange={e=>setForm({...form,prazo:e.target.value})} /></div>
          <div className="fg"><label>Centro de custo</label>
            <select value={form.centro_id} onChange={e=>setForm({...form,centro_id:e.target.value})}>
              {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select></div>
          <div className="fg"><label>Escopo</label>
            <select value={form.semObra ? 'empresa' : 'obra'} onChange={e=>setForm({...form,semObra:e.target.value==='empresa'})}>
              <option value="obra">Esta obra</option>
              <option value="empresa">Empresa · sem obra</option>
            </select></div>
          <div className="fg" style={{justifyContent:'flex-end'}}><button className="btn" onClick={adicionar}>Adicionar tarefa</button></div>
        </div></div>
      </div>

      {metricas.filter((m:any)=>m.total>0).length > 0 && (
        <div className="panel">
          <div className="hd">
            <h3>Por centro de custo</h3>
            <span className="hint">clique para filtrar o quadro</span>
          </div>
          <div className="bd">
            <div className="cc-grid">
              {metricas.filter((m:any)=>m.total>0).map((m:any) => (
                <button key={m.centro_id}
                  className={`cc-card ${filtro===m.centro_id?'on':''} ${m.atrasadas>0?'risco':''}`}
                  onClick={()=>setFiltro(f=>f===m.centro_id?'':m.centro_id)}>
                  <div className="cc-n">{m.centro_nome}</div>
                  <div className="cc-nums">
                    <span><b>{m.abertas}</b> abertas</span>
                    {m.atrasadas > 0 && <span className="cc-atr"><b>{m.atrasadas}</b> atrasadas</span>}
                    <span className="hint">{m.concluidas} concluídas</span>
                  </div>
                  {m.pct_atraso != null && m.abertas > 0 && (
                    <div className="cc-bar"><div style={{width:`${Math.min(100, m.pct_atraso)}%`}} /></div>
                  )}
                </button>
              ))}
            </div>
            {filtro && <p className="hint" style={{marginTop:8}}>
              Filtrando por {centros.find(c=>c.id===filtro)?.nome}. <button className="mini" onClick={()=>setFiltro('')}>limpar</button>
            </p>}
          </div>
        </div>
      )}

      <div className="kanban">
        {COLS.map((c, ci) => (
          <div key={ci} className="kcol">
            <div className="khd"><b>{c}</b><span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--gray)'}}>{vis.filter(t=>t.coluna===ci).length}</span></div>
            <div className="kbd">
              {vis.filter(t => t.coluna === ci).map(t => {
                const atras = t.prazo && t.prazo < hoje && t.coluna < 3;
                return (
                  <div key={t.id} className={`card prio-${t.prioridade}`}>
                    <div className="t">{t.descricao}</div>
                    <div className="m">
                      <span>{t.obra_id ? (t.evento_id ?? '—') : 'EMPRESA'}</span>
                      <span>{t.responsavel ?? ''}</span>
                      <span className="cc-tag">{nomeCentro(t.centro_id)}</span>
                      <span style={{color: atras ? 'var(--risk)' : undefined}}>{t.prazo ? `⏱ ${fmtData(t.prazo)}${atras ? ' · ATRASADA' : ''}` : ''}</span>
                    </div>
                    <div className="acts">
                      {ci > 0 && <button className="mini" onClick={()=>mover(t,-1)}>← {COLS[ci-1]}</button>}
                      {ci < 3 && <button className="mini" onClick={()=>mover(t,1)}>{COLS[ci+1]} →</button>}
                      <button className="mini danger" onClick={()=>excluir(t)}>Excluir</button>
                    </div>
                  </div>
                );
              })}
              {vis.filter(t=>t.coluna===ci).length === 0 && <span className="hint">Sem tarefas.</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
