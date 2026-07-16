'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { subirArquivo } from '@/lib/arquivos';

/**
 * Perfil da empresa — o que aparece nos documentos.
 *
 * O sistema é multiempresa: cada cliente manda a proposta com a própria marca
 * e do próprio e-mail. O rodapé "by Se73um Technology" é fixo.
 */
export default function EmpresaClient({ empresa, podeEditar, urlLogoAtual }:
  { empresa: any; podeEditar: boolean; urlLogoAtual: string | null }) {
  const [f, setF] = useState<any>({ ...empresa });
  const [ocupado, setOcupado] = useState(false);
  const [logoUrl, setLogoUrl] = useState(urlLogoAtual);
  const supabase = supabaseBrowser();

  async function salvar() {
    setOcupado(true);
    try {
      const r = await fetch('/api/empresa', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(f),
      });
      const j = await r.json();
      if (j.erro) { alert(j.erro); setOcupado(false); return; }
      alert('Perfil atualizado.');
      location.reload();
    } catch (e: any) { alert('Falha: ' + e.message); }
    setOcupado(false);
  }

  async function subirLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('O logo precisa ter menos de 2 MB.'); return; }
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) { alert('Use PNG, JPG, SVG ou WebP.'); return; }
    setOcupado(true);
    try {
      const up = await subirArquivo(file, `empresas/${empresa.id}`);
      setF({ ...f, logo_path: up.path });
      const { data } = supabase.storage.from('arquivos').getPublicUrl(up.path);
      setLogoUrl(data.publicUrl);
    } catch (er: any) { alert('Falha no upload: ' + er.message); }
    setOcupado(false);
  }

  const dominio = f.email_remetente?.split('@')[1];

  return (
    <>
      <section className="cock-hero">
        <div className="saud">{f.nome_fantasia || f.razao_social}</div>
        <div className="resumo">
          É esta identidade que aparece nas propostas e nos documentos que você envia ao cliente.
        </div>
      </section>

      <div className="panel">
        <div className="hd"><h3>Identidade</h3></div>
        <div className="bd">
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{ width: 140, flexShrink: 0 }}>
              <label className="lb" style={{ display: 'block', marginBottom: 6 }}>Logo</label>
              <div style={{
                width: 140, height: 140, border: '1px dashed var(--line-strong)', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--surface-2)', overflow: 'hidden', marginBottom: 6,
              }}>
                {logoUrl
                  ? <img src={logoUrl} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  : <span className="hint" style={{ textAlign: 'center', padding: 10 }}>sem logo</span>}
              </div>
              {podeEditar && (
                <label className="mini" style={{ cursor: 'pointer', display: 'block', textAlign: 'center' }}>
                  {logoUrl ? 'trocar' : 'enviar'}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    style={{ display: 'none' }} onChange={subirLogo} disabled={ocupado} />
                </label>
              )}
              <p className="hint" style={{ marginTop: 4, fontSize: 10 }}>PNG ou SVG, fundo transparente, até 2 MB.</p>
            </div>

            <div style={{ flex: 1 }}>
              <div className="form-grid">
                <div className="fg full"><label>Razão social</label>
                  <input value={f.razao_social ?? ''} disabled={!podeEditar}
                    onChange={e => setF({ ...f, razao_social: e.target.value })} /></div>
                <div className="fg"><label>Nome fantasia</label>
                  <input value={f.nome_fantasia ?? ''} disabled={!podeEditar}
                    onChange={e => setF({ ...f, nome_fantasia: e.target.value })} /></div>
                <div className="fg"><label>CNPJ</label>
                  <input value={f.cnpj ?? ''} disabled={!podeEditar}
                    onChange={e => setF({ ...f, cnpj: e.target.value })} /></div>
                <div className="fg"><label>Cor da marca</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="color" value={f.cor_marca ?? '#FD1843'} disabled={!podeEditar}
                      onChange={e => setF({ ...f, cor_marca: e.target.value })}
                      style={{ width: 44, padding: 2, height: 36 }} />
                    <input value={f.cor_marca ?? ''} disabled={!podeEditar}
                      onChange={e => setF({ ...f, cor_marca: e.target.value })} placeholder="#FD1843" />
                  </div></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="hd"><h3>Contato e endereço</h3><span className="hint">vai no cabeçalho da proposta</span></div>
        <div className="bd">
          <div className="form-grid">
            <div className="fg"><label>E-mail</label>
              <input value={f.email ?? ''} disabled={!podeEditar} onChange={e => setF({ ...f, email: e.target.value })} /></div>
            <div className="fg"><label>Telefone</label>
              <input value={f.telefone ?? ''} disabled={!podeEditar} onChange={e => setF({ ...f, telefone: e.target.value })} /></div>
            <div className="fg"><label>Site</label>
              <input value={f.site ?? ''} disabled={!podeEditar} onChange={e => setF({ ...f, site: e.target.value })} /></div>
            <div className="fg full"><label>Endereço</label>
              <input value={f.endereco ?? ''} disabled={!podeEditar} onChange={e => setF({ ...f, endereco: e.target.value })} /></div>
            <div className="fg"><label>Cidade</label>
              <input value={f.cidade ?? ''} disabled={!podeEditar} onChange={e => setF({ ...f, cidade: e.target.value })} /></div>
            <div className="fg"><label>UF</label>
              <input value={f.uf ?? ''} maxLength={2} disabled={!podeEditar} onChange={e => setF({ ...f, uf: e.target.value.toUpperCase() })} /></div>
            <div className="fg"><label>CEP</label>
              <input value={f.cep ?? ''} disabled={!podeEditar} onChange={e => setF({ ...f, cep: e.target.value })} /></div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="hd"><h3>Envio de e-mail</h3></div>
        <div className="bd">
          <p className="hint" style={{ marginBottom: 10 }}>
            A proposta sai do <b>seu</b> e-mail, não do nosso. Para isso, o domínio precisa ser verificado —
            é o que impede que qualquer um mande e-mail se passando por você.
          </p>
          <div className="form-grid">
            <div className="fg full"><label>E-mail remetente</label>
              <input value={f.email_remetente ?? ''} disabled={!podeEditar}
                onChange={e => setF({ ...f, email_remetente: e.target.value })}
                placeholder="comercial@suaempresa.com.br" /></div>
          </div>
          {dominio && (
            <div style={{
              marginTop: 10, padding: 10, borderRadius: 6,
              background: f.dominio_verificado ? 'var(--surface-2)' : 'var(--brand-soft)',
              borderLeft: `3px solid ${f.dominio_verificado ? 'var(--ok)' : 'var(--brand)'}`,
            }}>
              <b style={{ fontSize: 12.5 }}>
                {f.dominio_verificado ? `✓ ${dominio} verificado` : `${dominio} ainda não verificado`}
              </b>
              {!f.dominio_verificado && (
                <p className="hint" style={{ marginTop: 4 }}>
                  Enquanto não verificar, o envio pelo sistema fica indisponível — baixe o PDF e envie pelo seu
                  cliente de e-mail. A verificação exige cadastrar registros DNS (SPF e DKIM) no seu domínio.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {podeEditar && (
        <button className="btn" disabled={ocupado} onClick={salvar} style={{ marginBottom: 16 }}>
          {ocupado ? 'salvando…' : 'Salvar perfil'}
        </button>
      )}

      <p className="hint" style={{ textAlign: 'center', paddingBottom: 20 }}>
        Os documentos saem com a sua marca e o rodapé <b>by Se73um Technology</b>.
      </p>
    </>
  );
}
