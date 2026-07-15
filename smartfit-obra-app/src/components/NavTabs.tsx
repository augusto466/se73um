'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: [string, string][] = [
  ['/visao', 'Visão Geral'],
  ['/cronograma', 'Cronograma & Medições'],
  ['/medicoes', 'Faturamento'],
  ['/materiais', 'Materiais & Compras'],
  ['/tarefas', 'Tarefas'],
  ['/diario', 'Diário de Obras'],
  // Oculto por decisão comercial — reativar removendo o comentário:
  // ['/validacoes', 'Validações Contratuais'],
];

export default function NavTabs({ papel }: { papel: string }) {
  const path = usePathname();
  const tabs: [string, string][] = [['/obras', 'Obras'], ...TABS];
  if (papel === 'admin' || papel === 'contratante') tabs.push(['/financeiro', 'Financeiro']);
  if (papel === 'admin') tabs.push(['/equipe', 'Equipe & Acessos']);
  return (
    <nav className="tabs">
      <div className="in">
        {tabs.map(([href, label]) => (
          <Link key={href} href={href} className={path.startsWith(href) ? 'on' : ''}>{label}</Link>
        ))}
      </div>
    </nav>
  );
}
