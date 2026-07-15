'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtData } from '@/lib/contrato';
import Anexos from './Anexos';

export default function DiarioClient({ registrosIniciais, obraId }: { registrosIniciais: any[]; obraId: number }) {
  const [regs, setRegs] = useState(registrosIniciais);
  const hoje = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ data: hoje, clima: 'Bom / Bom', efetivo: '', responsavel: '', atividades: '', ocorrencias: '' });
  const supabase = supabaseBrowser();

  async function registrar() {
    if (!form.data || !form.atividades.trim()) { alert('Informe ao menos a data e as atividades.'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('diario').insert({
      data: form.data, clima: form.clima, efetivo: Number(form.efetivo) || 0,
      responsavel: form.responsavel || null, atividades: form.atividades.trim(),
      ocorrencias: form.ocorrencias.trim() || null, criado_por: user?.id, obra_id: obraId,
    }).select().single();
    if (error) { alert(error.message); return; }
    setRegs(r => [data, ...r].sort((a, b) => b.data.localeCompare(a.data)));
    setForm({ ...form, atividades: '', ocorrencias: '', efetivo: '' });
  }

  return (
    <>
      <div className="panel">
        <div className="hd"><h3>Novo registro — RDO</h3><span className="hint">Registros são imutáveis (integridade probatória — Cl. 3.4 e 4.3.1)</span></div>
        <div className="bd"><div className="form-grid">
          <div className="fg"><label>Data</label><input type="date" value={form.data} onChange={e=>setForm({...form,data:e.target.value})} /></div>
          <div className="fg"><label>Clima manhã / tarde</label>
            <select value={form.clima} onChange={e=>setForm({...form,clima:e.target.value})}>
              {['Bom / Bom','Bom / Chuvoso','Chuvoso / Bom','Chuvoso / Chuvoso','Impraticável'].map(c=><option key={c}>{c}</option>)}
            </select></div>
          <div className="fg"><label>Efetivo em campo</label><input type="number" min={0} value={form.efetivo} onChange={e=>setForm({...form,efetivo:e.target.value})} /></div>
          <div className="fg"><label>Responsável pelo registro</label><input value={form.responsavel} onChange={e=>setForm({...form,responsavel:e.target.value})} /></div>
          <div className="fg full"><label>Atividades executadas</label><textarea rows={3} value={form.atividades} onChange={e=>setForm({...form,atividades:e.target.value})} /></div>
          <div className="fg full"><label>Ocorrências / impedimentos (Cl. 2.5 — dever de alerta imediato por escrito)</label><textarea rows={3} value={form.ocorrencias} onChange={e=>setForm({...form,ocorrencias:e.target.value})} /></div>
          <div className="fg full" style={{flexDirection:'row',justifyContent:'flex-end'}}><button className="btn" onClick={registrar}>Registrar no diário</button></div>
        </div></div>
      </div>

      {regs.map(d => (
        <div key={d.id} className="panel">
          <div className="hd">
            <h3 style={{fontFamily:'var(--mono)',textTransform:'none'}}>RDO · {fmtData(d.data)}</h3>
            <span className="hint">Clima: {d.clima} · Efetivo: {d.efetivo ?? 0} pessoas · Registro: {d.responsavel ?? '—'}</span>
          </div>
          <div className="bd">
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div className="fg"><label>Atividades executadas</label><p style={{fontSize:13,whiteSpace:'pre-wrap'}}>{d.atividades}</p></div>
              <div className="fg"><label>Ocorrências / impedimentos</label><p style={{fontSize:13,whiteSpace:'pre-wrap'}}>{d.ocorrencias ?? 'Sem ocorrências.'}</p></div>
            </div>
            <div className="fg"><label>Relatório fotográfico (Cl. 3.4)</label>
              <Anexos entidade="diario" entidadeId={String(d.id)} obraId={obraId} compacto /></div>
          </div>
        </div>
      ))}
      {regs.length === 0 && <p className="hint">Nenhum registro. O primeiro RDO deve acompanhar a mobilização do canteiro.</p>}
    </>
  );
}
