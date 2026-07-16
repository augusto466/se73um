'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Logo } from './Marca';

type Item = { href: string; label: string; ic: string; badge?: number };
type Grupo = { titulo: string; itens: Item[] };

export default function Sidebar({ papel, perfil, obras, obraAtiva, badges }:
  { papel: string; perfil: any; obras: any[]; obraAtiva: number | null; badges: Record<string, number> }) {
  const path = usePathname();
  const [aberta, setAberta] = useState(false);
  const gestor = papel === 'admin' || papel === 'contratante';

  const grupos: Grupo[] = [
    { titulo: 'Comando', itens: [
      { href: '/meu-dia', label: 'Meu Dia', ic: '◈', badge: badges.meuDia },
      ...(gestor ? [{ href: '/painel-ceo', label: 'Cockpit', ic: '◉' }] : []),
      { href: '/obras', label: 'Obras', ic: '⬢' },
    ]},
    ...(gestor ? [{ titulo: 'Comercial', itens: [
      { href: '/comercial', label: 'Pipeline', ic: '◇' },
      { href: '/galpao', label: 'Simular Galpão', ic: '⬡' },
      { href: '/base-precos', label: 'Base de Preços', ic: '◈' },
    ]}] : []),
    { titulo: 'Contrato', itens: [
      { href: '/visao', label: 'Visão da Obra', ic: '▤' },
      { href: '/cronograma', label: 'Cronograma', ic: '▦', badge: badges.medicoes },
      ...(gestor ? [{ href: '/replanejamento', label: 'Replanejamento', ic: '◫' }] : []),
      { href: '/medicoes', label: 'Faturamento', ic: '▩' },
      ...(gestor ? [{ href: '/financeiro', label: 'Financeiro', ic: '▣', badge: badges.financeiro }] : []),
    ]},
    { titulo: 'Operação', itens: [
      { href: '/materiais', label: 'Materiais', ic: '◲', badge: badges.pedidos },
      { href: '/diario', label: 'Diário de Obras', ic: '◱' },
      { href: '/qualidade', label: 'Qualidade', ic: '◰' },
      { href: '/tarefas', label: 'Tarefas', ic: '◧' },
      { href: '/colaboradores', label: 'Equipe de Campo', ic: '◍' },
      { href: '/rotinas', label: 'Rotinas', ic: '◨' },
    ]},
    { titulo: 'Acervo', itens: [
      { href: '/projetos', label: 'Projetos', ic: '⬡' },
      { href: '/documentos', label: 'Documentos', ic: '⬠', badge: badges.documentos },
    ]},
    ...(gestor ? [{ titulo: 'Gestão', itens: [
      { href: '/metas', label: 'Metas', ic: '◇' },
      ...(papel === 'admin' ? [{ href: '/equipe', label: 'Equipe & Acessos', ic: '◎' }] : []),
    ]}] : []),
  ];

  async function trocarObra(id: string) {
    if (id === '_todas') { window.location.href = '/obras'; return; }
    await fetch('/api/obra-ativa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ obraId: Number(id) }) });
    window.location.reload();
  }

  const iniciais = (perfil?.nome ?? perfil?.email ?? '?').slice(0, 2).toUpperCase();
  const papelLabel = papel === 'admin' ? 'Administrador' : papel === 'contratante' ? 'Contratante' : 'Contratada';

  return (
    <>
      <button className="burger" onClick={() => setAberta(a => !a)}
        style={{ position: 'fixed', top: 12, left: 12, zIndex: 60 }} aria-label="Menu">☰</button>

      <aside className={`side ${aberta ? 'open' : ''}`}>
        <div className="side-brand"><Logo size={28} /></div>

        {obras.length > 0 && (
          <div className="side-obra">
            <div className="lb">Obra ativa</div>
            <select value={obraAtiva ?? ''} onChange={e => trocarObra(e.target.value)} aria-label="Obra ativa">
              {obras.map(o => <option key={o.id} value={o.id}>{o.codigo}</option>)}
              <option value="_todas">Ver todas as obras</option>
            </select>
          </div>
        )}

        <nav className="side-nav">
          {grupos.map(g => (
            <div key={g.titulo}>
              <div className="nav-grp">{g.titulo}</div>
              {g.itens.map(i => (
                <Link key={i.href} href={i.href} className={`nav-i ${path.startsWith(i.href) ? 'on' : ''}`} onClick={() => setAberta(false)}>
                  <span className="ic">{i.ic}</span>
                  <span>{i.label}</span>
                  {!!i.badge && <span className="bd">{i.badge}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="side-user">
          <div className="av">{iniciais}</div>
          <div className="in">
            <div className="n">{perfil?.nome ?? perfil?.email}</div>
            <div className="r">{papelLabel}</div>
          </div>
          <button onClick={async () => { await supabaseBrowser().auth.signOut(); window.location.href = '/login'; }}>Sair</button>
        </div>
      </aside>
    </>
  );
}
