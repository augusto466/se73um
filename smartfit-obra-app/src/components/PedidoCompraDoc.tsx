'use client';

const fmt = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (iso?: string | null) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

export default function PedidoCompraDoc({ pedido, obra, cotacao, empresa, evento, logoUrl }:
  { pedido: any; obra: any; cotacao: any; empresa: any; evento: any; logoUrl: string | null }) {

  const itens = Array.isArray(pedido?.itens) ? pedido.itens : [];
  const cor = empresa?.cor_marca || '#FD1843';
  const numero = `PC-${String(pedido.id).padStart(4, '0')}`;
  const hoje = new Date().toLocaleDateString('pt-BR');

  const emissorNome = empresa?.nome_fantasia || empresa?.razao_social || 'Modo Modular';

  // Link publico do pedido, para o fornecedor abrir sem login.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const linkPublico = pedido.pc_token ? `${origin}/pc/${pedido.id}?token=${pedido.pc_token}` : '';

  // mailto pre-preenchido: sai do e-mail do cliente (Invest), com o link do
  // pedido no corpo. O fornecedor abre o link e ve/imprime o pedido.
  function enviarAoFornecedor() {
    const para = cotacao?.email ?? '';
    const assunto = `Pedido de Compra ${numero} — ${obra?.fat_razao_social ?? obra?.cliente ?? ''}`;
    const corpo = [
      `Prezados,`,
      ``,
      `Segue nosso pedido de compra ${numero}, referente ao material abaixo, para a obra ${obra?.codigo ?? ''}.`,
      ``,
      `Fornecedor: ${cotacao?.fornecedor ?? ''}`,
      `Valor total: ${fmt(cotacao?.valor_total)}`,
      obra?.entrega_endereco ? `Entrega: ${obra.entrega_endereco}` : '',
      ``,
      `O pedido completo, com itens e dados de faturamento, pode ser acessado neste link:`,
      linkPublico,
      ``,
      `A nota fiscal deve ser emitida em nome de ${obra?.fat_razao_social ?? obra?.cliente ?? ''}, CNPJ ${obra?.fat_cnpj ?? ''}.`,
      ``,
      `Atenciosamente,`,
      obra?.fat_razao_social ?? obra?.cliente ?? '',
    ].filter(l => l !== undefined).join('\n');

    const url = `mailto:${encodeURIComponent(para)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
    window.location.href = url;
  }

  const semEmailFornecedor = !cotacao?.email;

  return (
    <>
      {/* Barra de acoes — some na impressao */}
      <div className="pc-actions" style={{
        position: 'sticky', top: 0, display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center',
        padding: '12px 16px', background: 'var(--surface-1, #111)', borderBottom: '1px solid #333', zIndex: 10,
      }}>
        {semEmailFornecedor && (
          <span style={{ color: '#c88', fontSize: 12, marginRight: 'auto' }}>
            O fornecedor não tem e-mail cadastrado — adicione na cotação para habilitar o envio.
          </span>
        )}
        <button className="btn" onClick={() => window.print()}>Imprimir / Salvar PDF</button>
        <button className="btn" onClick={enviarAoFornecedor} disabled={semEmailFornecedor}
          style={{ background: cor, borderColor: cor }}>
          Enviar ao fornecedor
        </button>
      </div>

      <div className="pc-doc">
        <header className="pc-head">
          <div className="pc-emissor">
            {logoUrl
              ? <img src={logoUrl} alt={emissorNome} className="pc-logo" />
              : <div className="pc-logo-txt" style={{ color: cor }}>{emissorNome}</div>}
            <div className="pc-emissor-dados">
              {empresa?.razao_social && <div><b>{empresa.razao_social}</b></div>}
              {empresa?.cnpj && <div>CNPJ {empresa.cnpj}</div>}
              {empresa?.endereco && <div>{empresa.endereco}{empresa.cidade ? `, ${empresa.cidade}` : ''}{empresa.uf ? `-${empresa.uf}` : ''}{empresa.cep ? ` · CEP ${empresa.cep}` : ''}</div>}
              {(empresa?.telefone || empresa?.email) && <div>{empresa.telefone ?? ''}{empresa.telefone && empresa.email ? ' · ' : ''}{empresa.email ?? ''}</div>}
            </div>
          </div>
          <div className="pc-titulo">
            <div className="pc-doc-tipo" style={{ borderColor: cor, color: cor }}>PEDIDO DE COMPRA</div>
            <div className="pc-num">{numero}</div>
            <div className="pc-data">Emitido em {hoje}</div>
          </div>
        </header>

        <section className="pc-bloco">
          <h4 style={{ color: cor }}>Fornecedor</h4>
          <div className="pc-grid2">
            <div><span>Razão social</span><b>{cotacao?.fornecedor ?? '—'}</b></div>
            <div><span>CNPJ</span><b>{cotacao?.cnpj ?? '—'}</b></div>
            <div><span>E-mail</span><b>{cotacao?.email ?? '—'}</b></div>
            <div><span>Prazo de entrega</span><b>{cotacao?.prazo_entrega ?? '—'}</b></div>
          </div>
        </section>

        <section className="pc-bloco pc-2col">
          <div>
            <h4 style={{ color: cor }}>Faturar para</h4>
            <div className="pc-endereco">
              <b>{obra?.fat_razao_social ?? obra?.cliente ?? '—'}</b>
              {obra?.fat_cnpj && <div>CNPJ {obra.fat_cnpj}</div>}
              {obra?.fat_ie && <div>IE {obra.fat_ie}</div>}
              {obra?.fat_endereco && <div>{obra.fat_endereco}</div>}
            </div>
          </div>
          <div>
            <h4 style={{ color: cor }}>Entregar em</h4>
            <div className="pc-endereco">
              {obra?.entrega_endereco
                ? <div>{obra.entrega_endereco}</div>
                : <div>{obra?.local ?? '—'}</div>}
              {obra?.entrega_contato && <div>Contato: {obra.entrega_contato}</div>}
              <div style={{ marginTop: 4 }}>Obra: {obra?.codigo} — {obra?.nome}</div>
              {evento?.etapa && <div>Etapa: {evento.etapa}</div>}
            </div>
          </div>
        </section>

        <section className="pc-bloco">
          <h4 style={{ color: cor }}>Itens</h4>
          <table className="pc-tabela">
            <thead>
              <tr><th style={{ width: 40 }}>#</th><th>Descrição</th><th style={{ width: 90, textAlign: 'right' }}>Qtd</th><th style={{ width: 70 }}>Unid.</th></tr>
            </thead>
            <tbody>
              {itens.map((it: any, i: number) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{it.descricao ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{it.qtd ?? ''}</td>
                  <td>{it.unidade ?? ''}</td>
                </tr>
              ))}
              {!itens.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#888' }}>Sem itens.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="pc-bloco pc-total">
          <div className="pc-cond">
            {cotacao?.condicoes_pagamento && <div><span>Condições de pagamento:</span> {cotacao.condicoes_pagamento}</div>}
            {cotacao?.frete && <div><span>Frete:</span> {cotacao.frete}</div>}
            {pedido?.necessidade && <div><span>Necessário até:</span> {fmtData(pedido.necessidade)}</div>}
          </div>
          <div className="pc-valor">
            <span>Valor total</span>
            <b style={{ color: cor }}>{fmt(cotacao?.valor_total)}</b>
          </div>
        </section>

        <footer className="pc-rodape">
          <p>Este pedido de compra refere-se a material de faturamento direto do contrato {obra?.codigo}.
             A nota fiscal deve ser emitida em nome de {obra?.fat_razao_social ?? obra?.cliente}, CNPJ {obra?.fat_cnpj ?? '—'}.</p>
        </footer>
      </div>

      <style>{`
        .pc-doc { max-width: 800px; margin: 0 auto; padding: 32px; background: #fff; color: #1a1a1a; font-size: 13px; line-height: 1.5; }
        .pc-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${cor}; padding-bottom: 16px; margin-bottom: 20px; gap: 20px; }
        .pc-logo { max-height: 56px; max-width: 200px; object-fit: contain; }
        .pc-logo-txt { font-size: 22px; font-weight: 800; }
        .pc-emissor-dados { margin-top: 8px; font-size: 11px; color: #444; }
        .pc-emissor-dados > div { margin-bottom: 1px; }
        .pc-titulo { text-align: right; white-space: nowrap; }
        .pc-doc-tipo { border: 1.5px solid; border-radius: 4px; padding: 4px 10px; font-weight: 700; font-size: 12px; display: inline-block; }
        .pc-num { font-size: 20px; font-weight: 800; margin-top: 8px; }
        .pc-data { font-size: 11px; color: #666; }
        .pc-bloco { margin-bottom: 20px; }
        .pc-bloco h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px; }
        .pc-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
        .pc-grid2 > div span, .pc-endereco span { display: block; font-size: 10px; color: #888; text-transform: uppercase; }
        .pc-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .pc-endereco { font-size: 12px; }
        .pc-endereco > div { margin-bottom: 1px; }
        .pc-tabela { width: 100%; border-collapse: collapse; }
        .pc-tabela th { text-align: left; font-size: 10px; text-transform: uppercase; color: #666; border-bottom: 1.5px solid #ccc; padding: 6px 8px; }
        .pc-tabela td { padding: 7px 8px; border-bottom: 1px solid #eee; }
        .pc-total { display: flex; justify-content: space-between; align-items: flex-end; border-top: 2px solid #ccc; padding-top: 12px; }
        .pc-cond { font-size: 11px; color: #444; }
        .pc-cond span { color: #888; }
        .pc-valor { text-align: right; }
        .pc-valor span { display: block; font-size: 10px; text-transform: uppercase; color: #888; }
        .pc-valor b { font-size: 22px; }
        .pc-rodape { margin-top: 28px; padding-top: 12px; border-top: 1px solid #eee; font-size: 10.5px; color: #777; }

        @media print {
          .pc-actions { display: none !important; }
          .pc-doc { padding: 0; max-width: none; box-shadow: none; }
          @page { margin: 1.5cm; }
        }
      `}</style>
    </>
  );
}
