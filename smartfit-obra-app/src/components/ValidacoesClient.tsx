'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtData } from '@/lib/contrato';

export default function ValidacoesClient({ itensIniciais, papel, obraId }: { itensIniciais: any[]; papel: string; obraId: number }) {
  const [itens, setItens] = useState(itensIniciais);
  const supabase = supabaseBrowser();
  const podeMarcar = papel === 'contratante' || papel === 'admin';
  const hoje = new Date().toISOString().slice(0, 10);
  const conformes = itens.filter(i => i.concluido).length;

  async function marcar(item: any, val: boolean) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('checklist')
      .update({ concluido: val, atualizado_por: user?.id, atualizado_em: new Date().toISOString() })
      .eq('id', item.id).eq('obra_id', obraId);
    if (error) { alert('Validação exclusiva do perfil Contratante.'); return; }
    await supabase.from('auditoria').insert({ usuario: user?.id, acao: val ? 'conforme' : 'reaberto', entidade: 'checklist', entidade_id: item.id, detalhe: { titulo: item.titulo }, obra_id: obraId });
    setItens(is => is.map(x => x.id === item.id ? { ...x, concluido: val } : x));
  }

  return (
    <div className="panel">
      <div className="hd">
        <h3>Obrigações e entregas contratuais — checklist de conformidade</h3>
        <span className="hint">{conformes} de {itens.length} conformes{podeMarcar ? '' : ' · validação exclusiva do Contratante'}</span>
      </div>
      <div className="bd">
        {itens.map(c => {
          const venc = c.prazo && c.prazo < hoje && !c.concluido;
          return (
            <div key={c.id} className="check-item">
              <input type="checkbox" checked={c.concluido} disabled={!podeMarcar}
                onChange={e => marcar(c, e.target.checked)}
                style={{accentColor:'var(--ok)',width:16,height:16,marginTop:2}} />
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:13, ...(c.concluido ? {color:'var(--muted)',textDecoration:'line-through'} : {})}}>{c.titulo}</div>
                <div className="hint">{c.detalhe}</div>
                <div style={{display:'flex',gap:10,marginTop:5,alignItems:'center',flexWrap:'wrap'}}>
                  <span className="clause">{c.clausula}</span>
                  <span style={{fontFamily:'var(--mono)',fontSize:11,color: venc ? 'var(--risk)' : 'var(--steel)'}}>
                    {c.prazo ? `Prazo: ${fmtData(c.prazo)}${venc ? ' · VENCIDO' : ''}` : 'Obrigação contínua'}
                  </span>
                  <span className="hint">Resp.: {c.responsavel}</span>
                </div>
              </div>
              {c.concluido
                ? <span className="stamp st-ok"><span className="dot" />CONFORME</span>
                : venc
                  ? <span className="stamp st-risk"><span className="dot" />NÃO CONFORME</span>
                  : <span className="stamp st-valid"><span className="dot" />EM ABERTO</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
