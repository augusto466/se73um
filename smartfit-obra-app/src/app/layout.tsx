import './globals.css';

export const metadata = {
  title: 'Se73um · Gestão de Obras',
  description: 'Sistema de gestão de obras — medições, compras, caixa e qualidade em um lugar.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 6 90 28v44L50 94 10 72V28L50 6z' stroke='%23FD1843' stroke-width='9' fill='none' stroke-linejoin='round'/%3E%3Cpath d='M64 36 40 50l24 14' stroke='%23FD1843' stroke-width='9' fill='none' stroke-linecap='round'/%3E%3C/svg%3E" />
      </head>
      <body>{children}</body>
    </html>
  );
}
