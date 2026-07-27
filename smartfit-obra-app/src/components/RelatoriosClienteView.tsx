'use client';
import { useState } from 'react';

const TIPOS_ROTULO: Record<string, string> = {
  certidao: 'Certidões',
  apolice: 'Apólices de seguro',
  art_rrt: 'ART / RRT',
  licenca: 'Licenças e alvarás',
  contrato: 'Contratos e aditivos',
  nota: 'Notas fiscais',
  outro: 'Outros documentos',
};

const ORDEM = ['art_rrt', 'licenca', 'apolice', 'certidao', 'contrato', 'nota', 'outro'];

const fmtTamanho = (b?: number | null) => {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
};

const fmtData = (iso?: string | null) =>
  iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '';

export default function RelatoriosClienteView({ docs }: { docs: any[] }) {
  const [baixando, setBaixando] = useState<number | null>(null);

  async function baixar(id: number) {
    setBaixando(id);
    try {
      const r = await fetch(`/api/documentos/download-cliente?id=${id}`);
      const j = await r.json();
      if (j.erro) { alert(j.erro); return; }
      window.open(j.url, '_blank');
    } catch (e: any) {
      alert('Falha ao abrir: ' + e.message);
    } finally {
      setBaixando(null);
    }
  }

  // agrupa por tipo, na ordem definida
  const grupos = ORDEM
    .map(tipo => ({ tipo, itens: docs.filter(d => d.tipo === tipo) }))
    .filter(g => g.itens.length > 0);

  // tipos que existam mas nao estejam na ordem conhecida caem em "outros"
  const conhecidos = new Set(ORDEM);
  const extras = docs.filter(d => !conhecidos.has(d.tipo));
  if (extras.length) grupos.push({ tipo: 'outro', itens: extras });

  return (
    <>
      <section className="cock-hero">
        <div className="saud">Relatórios e documentos</div>
        <div className="resumo">Documentos da obra disponibilizados para você.</div>
      </section>

      {!docs.length && (
        <div className="panel"><div className="bd">
          <p className="hint">Nenhum documento disponível para acompanhamento no momento.</p>
        </div></div>
      )}

      {grupos.map(g => (
        <div className="panel" key={g.tipo}>
          <div className="hd"><h3>{TIPOS_ROTULO[g.tipo] ?? 'Documentos'} · {g.itens.length}</h3></div>
          <div className="bd" style={{ padding: 0 }}>
            {g.itens.map(d => (
              <div key={d.id} className="dia-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{d.titulo}</div>
                  <div className="hint">
                    {d.emissor ?? ''}
                    {d.numero ? ` · nº ${d.numero}` : ''}
                    {d.emissao ? ` · ${fmtData(d.emissao)}` : ''}
                    {d.arquivo_tamanho ? ` · ${fmtTamanho(d.arquivo_tamanho)}` : ''}
                  </div>
                </div>
                {d.arquivo_path
                  ? <button className="mini" disabled={baixando === d.id} onClick={() => baixar(d.id)}>
                      {baixando === d.id ? '…' : 'baixar'}
                    </button>
                  : <span className="hint" style={{ fontSize: 11 }}>sem arquivo</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
