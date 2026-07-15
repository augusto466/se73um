'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { subirArquivo, baixarArquivo, apagarArquivo, fmtTamanho } from '@/lib/arquivos';

export default function Anexos({ entidade, entidadeId, obraId, compacto }:
  { entidade: string; entidadeId: string; obraId: number | null; compacto?: boolean }) {
  const [lista, setLista] = useState<any[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const supabase = supabaseBrowser();

  useEffect(() => {
    supabase.from('anexos').select('*').eq('entidade', entidade).eq('entidade_id', entidadeId)
      .then(({ data }) => setLista(data ?? []));
  }, [entidade, entidadeId]);

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setOcupado(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      for (const f of files) {
        const up = await subirArquivo(f, `${entidade}/${entidadeId}`);
        const { data, error } = await supabase.from('anexos').insert({
          obra_id: obraId, entidade, entidade_id: entidadeId,
          arquivo_path: up.path, arquivo_nome: up.nome, arquivo_tamanho: up.tamanho,
          criado_por: user?.id,
        }).select().single();
        if (error) throw new Error(error.message);
        setLista(l => [...l, data]);
      }
    } catch (err: any) { alert(err.message); }
    setOcupado(false);
    e.target.value = '';
  }

  async function remover(a: any) {
    if (!confirm(`Remover "${a.arquivo_nome}"?`)) return;
    const { error } = await supabase.from('anexos').delete().eq('id', a.id);
    if (error) { alert('Sem permissão para remover.'); return; }
    await apagarArquivo(a.arquivo_path);
    setLista(l => l.filter(x => x.id !== a.id));
  }

  return (
    <div className={compacto ? '' : 'anexos-box'}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: lista.length ? 8 : 0 }}>
        <label className="mini" style={{ display: 'inline-block' }}>
          {ocupado ? 'enviando…' : '📎 anexar arquivo'}
          <input type="file" multiple disabled={ocupado} onChange={subir} style={{ display: 'none' }} />
        </label>
        {lista.length > 0 && <span className="hint">{lista.length} anexo(s)</span>}
      </div>
      {lista.map(a => (
        <div key={a.id} className="anexo-item">
          <span style={{ flex: 1, fontSize: 12.5 }}>{a.arquivo_nome}</span>
          <span className="hint" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{fmtTamanho(a.arquivo_tamanho)}</span>
          <button className="mini" onClick={() => baixarArquivo(a.arquivo_path)}>abrir</button>
          <button className="mini danger" onClick={() => remover(a)}>×</button>
        </div>
      ))}
    </div>
  );
}
