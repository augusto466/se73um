'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtData } from '@/lib/contrato';

const ROTULO: Record<string, string> = {
  desconectado: 'Desconectado', aguardando_qr: 'Leia o QR', conectando: 'Conectando',
  conectado: 'Conectado', banido: 'BANIDO', erro: 'Erro',
};
const COR: Record<string, string> = {
  conectado: 'var(--ok)', aguardando_qr: 'var(--warn)', conectando: 'var(--warn)',
  banido: 'var(--brand)', erro: 'var(--brand)', desconectado: 'var(--gray)',
};

export default function WhatsappClient({ instancia: inicial, contatos: contatosIniciais, colaboradores, mensagens: msgsIniciais }:
  { instancia: any; contatos: any[]; colaboradores: any[]; mensagens: any[] }) {
  const [inst, setInst] = useState(inicial);
  const [contatos, setContatos] = useState(contatosIniciais);
  const [msgs, setMsgs] = useState(msgsIniciais);
  const [ocupado, setOcupado] = useState(false);
  const [leu, setLeu] = useState(false);
  const supabase = supabaseBrowser();

  // o QR muda a cada ~55s e o status vem do serviço: precisa de polling
  useEffect(() => {
    if (!inst?.id) return;
    const t = setInterval(async () => {
      const { data } = await supabase.from('wa_instancias').select('*').eq('id', inst.id).maybeSingle();
      if (data) setInst(data);
      if (data?.status === 'conectado') {
        const [{ data: c }, { data: m }] = await Promise.all([
          supabase.from('wa_contatos').select('*').order('criado_em', { ascending: false }).limit(50),
          supabase.from('wa_mensagens').select('*').order('criado_em', { ascending: false }).limit(40),
        ]);
        setContatos(c ?? []); setMsgs(m ?? []);
      }
    }, ['aguardando_qr', 'conectando'].includes(inst?.status) ? 3000 : 12000);
    return () => clearInterval(t);
  }, [inst?.id, inst?.status, supabase]);

  async function acao(a: string, extra: any = {}) {
    setOcupado(true);
    try {
      const r = await fetch('/api/whatsapp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: a, instancia_id: inst?.id, ...extra }),
      });
      const j = await r.json();
      if (j.erro) { alert(j.erro); setOcupado(false); return; }
      if (j.instancia) setInst(j.instancia);
      if (j.aviso) alert(j.aviso);
      const { data } = await supabase.from('wa_instancias').select('*').eq('id', j.instancia?.id ?? inst?.id).maybeSingle();
      if (data) setInst(data);
    } catch (e: any) { alert('Falha: ' + e.message); }
    setOcupado(false);
  }

  async function ligarContato(id: number, colaborador_id: string) {
    const r = await fetch('/api/whatsapp', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contato_id: id, colaborador_id: colaborador_id || null }),
    });
    const j = await r.json();
    if (j.erro) { alert(j.erro); return; }
    setContatos(l => l.map(c => c.id === id ? { ...c, colaborador_id: colaborador_id ? Number(colaborador_id) : null } : c));
  }

  // ---------- sem instância
  if (!inst) {
    return (
      <>
        <section className="cock-hero">
          <div className="saud">WhatsApp</div>
          <div className="resumo">Ligue a comunicação do dia a dia ao sistema. Leia o aviso antes.</div>
        </section>
        <div className="panel">
          <div className="bd">
            <p className="hint" style={{ marginBottom: 12 }}>Nenhuma instância criada.</p>
            <button className="btn" disabled={ocupado} onClick={() => acao('criar')}>Criar instância</button>
          </div>
        </div>
      </>
    );
  }

  // ---------- aceite de risco
  if (!inst.risco_aceito) {
    return (
      <>
        <section className="cock-hero">
          <div className="saud">Antes de conectar</div>
          <div className="resumo">Leia com atenção. Isto não é formalidade.</div>
        </section>
        <div className="panel" style={{ borderLeft: '3px solid var(--brand)' }}>
          <div className="hd"><h3>O risco</h3></div>
          <div className="bd" style={{ fontSize: 13.5, lineHeight: 1.7 }}>
            <p style={{ marginBottom: 12 }}>
              Conectar o WhatsApp por QR usa uma biblioteca <b>não-oficial</b>. Isso <b>viola os Termos de
              Serviço da Meta</b>.
            </p>
            <p style={{ marginBottom: 12 }}>
              <b>O número pode ser banido</b> — sem aviso, sem prazo, e sem recurso prático além do formulário
              de contestação deles, que costuma não responder.
            </p>
            <p style={{ marginBottom: 12 }}>
              Se este número é o que a equipe usa para tudo, o dano de um banimento vai muito além do sistema:
              some o histórico, os grupos, os contatos.
            </p>
            <p style={{ marginBottom: 16 }}>
              Não existe forma de eliminar esse risco. O que dá para fazer — e o serviço faz — é reduzir:
              cadência lenta e irregular, sem disparo em massa, sem iniciar conversa com desconhecido.
            </p>
            <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 8, marginBottom: 14 }}>
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={leu} onChange={e => setLeu(e.target.checked)} style={{ marginTop: 3 }} />
                <span>Li e entendi. Aceito o risco de o número ser banido e assumo essa decisão.</span>
              </label>
            </div>
            <button className="btn" disabled={!leu || ocupado} onClick={() => acao('aceitar_risco')}>
              Aceitar e prosseguir
            </button>
            <p className="hint" style={{ marginTop: 10 }}>
              O aceite fica registrado com a data, o usuário e o IP.
            </p>
          </div>
        </div>
      </>
    );
  }

  const naoLidas = msgs.filter(m => m.direcao === 'entrada' && !m.processada).length;

  return (
    <>
      <section className="cock-hero">
        <div className="saud">WhatsApp</div>
        <div className="resumo">
          {inst.status === 'conectado'
            ? <>Conectado no número <b>{inst.numero}</b>.</>
            : inst.status === 'banido'
              ? <>O número foi <b>banido</b>. Era o risco que você aceitou.</>
              : 'Leia o QR com o celular que tem o número da obra.'}
        </div>
        <div className="cock-strip">
          <div className="it"><div className="n" style={{ fontSize: 15, color: COR[inst.status] }}>{ROTULO[inst.status]}</div><div className="l">Status</div></div>
          <div className="it"><div className="n">{contatos.length}</div><div className="l">Contatos</div></div>
          <div className={`it ${naoLidas ? 'risco' : ''}`}><div className="n">{naoLidas}</div><div className="l">Não processadas</div></div>
        </div>
      </section>

      {/* ---------- conexão ---------- */}
      <div className="panel">
        <div className="hd">
          <h3>Conexão</h3>
          <div style={{ display: 'flex', gap: 7 }}>
            {inst.status !== 'conectado' && inst.status !== 'banido' && (
              <button className="btn" disabled={ocupado} onClick={() => acao('conectar')}>
                {ocupado ? '…' : 'Conectar'}
              </button>
            )}
            {inst.status === 'conectado' && (
              <button className="mini" disabled={ocupado} onClick={() => {
                if (confirm('Desconectar? A sessão é encerrada e o QR precisará ser lido de novo.')) acao('desconectar');
              }}>Desconectar</button>
            )}
          </div>
        </div>
        <div className="bd">
          {inst.status === 'aguardando_qr' && inst.qr_code && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ background: '#fff', padding: 12, borderRadius: 10, display: 'inline-block' }}>
                <img src={inst.qr_code} alt="QR" style={{ width: 260, height: 260, display: 'block' }} />
              </div>
              <p className="hint" style={{ marginTop: 12, maxWidth: 380, margin: '12px auto 0' }}>
                WhatsApp → <b>Dispositivos conectados</b> → <b>Conectar dispositivo</b>. O código expira em cerca
                de um minuto e se renova sozinho.
              </p>
            </div>
          )}
          {inst.status === 'conectando' && <p className="hint">Conectando…</p>}
          {inst.status === 'banido' && (
            <div style={{ padding: 12, background: 'var(--brand-soft)', borderRadius: 8, borderLeft: '3px solid var(--brand)' }}>
              <b style={{ fontSize: 13 }}>O número foi banido pela Meta.</b>
              <p className="hint" style={{ marginTop: 6 }}>
                Não há recurso automático. O caminho é o formulário de contestação da Meta, e a taxa de resposta
                é baixa. Para voltar a usar o sistema, será preciso outro número.
              </p>
            </div>
          )}
          {inst.status === 'desconectado' && <p className="hint">Clique em Conectar para gerar o QR.</p>}
          {inst.ultimo_erro && <p className="hint" style={{ marginTop: 8, color: 'var(--brand)' }}>{inst.ultimo_erro}</p>}
          {inst.visto_em && (
            <p className="hint" style={{ marginTop: 8 }}>
              Serviço visto {new Date(inst.visto_em).toLocaleTimeString('pt-BR')}
              {Date.now() - new Date(inst.visto_em).getTime() > 120000 && <b style={{ color: 'var(--brand)' }}> — sem sinal há mais de 2 min. O serviço pode estar fora.</b>}
            </p>
          )}
        </div>
      </div>

      {/* ---------- contatos ---------- */}
      {contatos.length > 0 && (
        <div className="panel">
          <div className="hd"><h3>Contatos · {contatos.length}</h3><span className="hint">ligue o número à pessoa</span></div>
          <div className="bd" style={{ overflowX: 'auto' }}>
            <table className="tab">
              <thead><tr><th>Número</th><th>Nome no WhatsApp</th><th>É</th><th>Colaborador</th></tr></thead>
              <tbody>
                {contatos.map(c => (
                  <tr key={c.id}>
                    <td><span className="mono">{c.numero}</span></td>
                    <td>{c.nome_wa ?? '—'}</td>
                    <td><span className="hint">{c.eh_grupo ? 'grupo' : 'pessoa'}</span></td>
                    <td>
                      {c.eh_grupo ? <span className="hint">—</span> : (
                        <select value={c.colaborador_id ?? ''} onChange={e => ligarContato(c.id, e.target.value)}
                          style={{ padding: '4px 6px', fontSize: 12 }}>
                          <option value="">— não ligado —</option>
                          {colaboradores.map(k => <option key={k.id} value={k.id}>{k.nome}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------- mensagens ---------- */}
      {msgs.length > 0 && (
        <div className="panel">
          <div className="hd"><h3>Últimas mensagens</h3></div>
          <div className="bd">
            <p className="hint" style={{ marginBottom: 10 }}>
              Mensagem de WhatsApp é <b>informação, nunca ordem</b>. O advisor lê e propõe; quem confirma é você,
              aqui no sistema.
            </p>
            {msgs.slice(0, 20).map(m => (
              <div key={m.id} style={{
                display: 'flex', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line)',
                opacity: m.direcao === 'saida' ? .7 : 1,
              }}>
                <span className={`tp ${m.direcao === 'entrada' ? 'tp-rotina' : 'tp-tarefa'}`}>
                  {m.direcao === 'entrada' ? '↓' : '↑'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5 }}>{m.texto ?? <span className="hint">[{m.tipo}]</span>}</div>
                  <div className="hint">
                    {m.autor_nome ?? m.jid?.split('@')[0]} · {new Date(m.criado_em).toLocaleString('pt-BR')}
                    {m.direcao === 'entrada' && !m.processada && <b style={{ color: 'var(--warn)' }}> · não processada</b>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
