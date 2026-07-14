import './globals.css';
export const metadata = {
  title: 'Painel da Obra · BTS Smart Fit — Contrato TK-328/2026',
  description: 'Acompanhamento contratual Turn Key — Invest Market × Modo Modular',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
