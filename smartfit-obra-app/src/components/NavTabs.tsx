'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavTabs({ papel }: { papel: string }) {
  const path = usePathname();
  const gestor = papel === 'admin' || papel === 'contratante';

  const tabs: [string, string][] = [
    ['/meu-dia', 'Meu Dia'],
    ['/obras', 'Obras'],
    ['/visao', 'Visão Geral'],
    ['/cronograma', 'Cronograma & Medições'],
    ['/medicoes', 'Faturamento'],
    ['/materiais', 'Materiais & Compras'],
    ['/projetos', 'Projetos'],
    ['/documentos', 'Documentos'],
    ['/qualidade', 'Qualidade'],
    ['/tarefas', 'Tarefas'],
    ['/rotinas', 'Rotinas'],
    ['/diario', 'Diário de Obras'],
    // Oculto por decisão comercial:
    // ['/validacoes', 'Validações Contratuais'],
  ];
  if (gestor) tabs.push(['/financeiro', 'Financeiro'], ['/metas', 'Metas']);
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
