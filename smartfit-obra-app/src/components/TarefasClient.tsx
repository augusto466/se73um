'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtData } from '@/lib/contrato';

const COLS = ['A fazer', 'Em execução', 'Em validação', 'Concluído'];

export default function TarefasClient({ tarefasIniciais, eventos, obraId }: { tarefasIniciais: any[]; eventos: any[]; obraId: number }) {
  const [tarefas, setTarefas] = useState(tarefasIniciais);
  const [form, setForm] = useState({ descricao: '', evento_id: '', responsavel: '', prioridade: 'media', prazo: '' });
  const supabase = supabaseBrowser();
  const hoje = new Date().toISOString().slice(0, 10);

  async function adicionar() {
    if (!form.descricao.trim()) { alert('Descreva a tarefa.'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('tarefas').insert({
      descricao: form.descricao.trim(), evento_id: form.evento_id || null,
      responsavel: form.responsavel || null, prioridade: form.prioridade,
      prazo: form.prazo || null, coluna: 0, criado_por: user?.id, obra_id: obraId,
    }).select().single();
    if (error) { alert(error.message); return; }
    setTarefas(t => [data, ...t]);
    setForm({ descricao: '', evento_id: '', responsavel: '', prioridade: 'media', prazo: '' });
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
          <div className="fg" style={{justifyContent:'flex-end'}}><button className="btn" onClick={adicionar}>Adicionar tarefa</button></div>
        </div></div>
      </div>

      <div className="kanban">
        {COLS.map((c, ci) => (
          <div key={ci} className="kcol">
            <div className="khd"><b>{c}</b><span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--muted)'}}>{tarefas.filter(t=>t.coluna===ci).length}</span></div>
            <div className="kbd">
              {tarefas.filter(t => t.coluna === ci).map(t => {
                const atras = t.prazo && t.prazo < hoje && t.coluna < 3;
                return (
                  <div key={t.id} className={`card prio-${t.prioridade}`}>
                    <div className="t">{t.descricao}</div>
                    <div className="m">
                      <span>{t.evento_id ?? '—'}</span><span>{t.responsavel ?? ''}</span>
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
              {tarefas.filter(t=>t.coluna===ci).length === 0 && <span className="hint">Sem tarefas.</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
