import './globals.css';

export const metadata = {
  title: 'Se73um · Gestão de Obras',
  description: 'Sistema de gestão de obras — medições, compras, caixa e qualidade em um lugar.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%27-6%200%20112%20100%27%3E%3Cpath%20d%3D%27M99.7%200%20L0%2021.74%20L99.7%2035.54%20L99.7%2025.5%20L20.5%2021.74%20L99.7%207.51%20Z%27%20fill%3D%27%23FD1843%27/%3E%3Crect%20x%3D%270%27%20y%3D%2735.65%27%20width%3D%27100%27%20height%3D%277.73%27%20fill%3D%27%238A8A93%27/%3E%3Crect%20x%3D%270%27%20y%3D%2745.47%27%20width%3D%27100%27%20height%3D%277.73%27%20fill%3D%27%238A8A93%27/%3E%3Crect%20x%3D%270%27%20y%3D%2759.05%27%20width%3D%27100%27%20height%3D%277.73%27%20fill%3D%27%23FD1843%27/%3E%3Crect%20x%3D%270%27%20y%3D%2768.87%27%20width%3D%27100%27%20height%3D%277.73%27%20fill%3D%27%23FD1843%27/%3E%3Crect%20x%3D%270%27%20y%3D%2778.81%27%20width%3D%27100%27%20height%3D%277.73%27%20fill%3D%27%23FD1843%27/%3E%3Crect%20x%3D%270%27%20y%3D%2792.38%27%20width%3D%27100%27%20height%3D%277.73%27%20fill%3D%27%238A8A93%27/%3E%3C/svg%3E" />
      </head>
      <body>{children}</body>
    </html>
  );
}
