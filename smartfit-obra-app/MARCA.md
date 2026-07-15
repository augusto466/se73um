# MARCA — símbolo Se73um na plataforma

## O que mudou

O hexágono genérico saiu. Entrou o símbolo oficial: chevron apontando à esquerda sobre as seis barras.

## Vetor de verdade, não imagem embutida

Os SVGs exportados do Photoshop eram PNG em base64 dentro de um envelope SVG — 42 KB de raster que borra ao ampliar e não aceita troca de cor por CSS.

O símbolo foi **redesenhado como vetor puro** a partir da geometria do arquivo original: um `path` para o chevron e seis `rect` para as barras. Menos de 1 KB, nítido de 16px a 1000px.

## Um símbolo, dois temas

As barras neutras usam `currentColor`. Em fundo claro herdam preto; em fundo escuro (sidebar, login), branco. Não existem duas versões para manter — o contexto resolve.

As barras vermelhas usam `var(--brand)`, então acompanham a paleta automaticamente.

## Onde foi aplicado

| Ponto | Componente | Por quê |
|---|---|---|
| Sidebar | `<Logo>` | lockup: símbolo + "Se73um Technology" |
| Login (splash) | `<Logo size={34}>` | primeira impressão da marca |
| Advisor — botão flutuante | `<SimboloMini cor="#fff">` | chevron branco sobre o brand |
| Advisor — cabeçalho | `<SimboloMini>` | identifica o painel |
| Advisor — avatar das mensagens | `<SimboloMini size={12}>` | 12px: só o chevron é legível |
| Favicon | SVG inline no `layout.tsx` | substitui o hexágono |

## Por que existe o SimboloMini

Abaixo de ~20px, as seis barras viram um borrão cinza — perdem o ritmo que faz o símbolo funcionar. O `SimboloMini` mantém só o chevron, que é o elemento mais reconhecível e sobrevive em 12px.

Regra prática: **acima de 20px, símbolo completo; abaixo, só o chevron.**

## Onde NÃO foi aplicado (decisão consciente)

- **Marca d'água em fundo de painel** — o símbolo tem contraste alto e competiria com os dados. Num sistema de gestão, o dado é o protagonista.
- **Cabeçalhos de tabela ou cards** — repetição cansa e dilui.
- **Loading spinners** — a tentação é grande, mas marca girando vira ruído.

A marca ancora a interface em pontos estratégicos; não decora cada canto.

## Componentes disponíveis

```tsx
import { Simbolo, SimboloMini, Logo } from '@/components/Marca';

<Simbolo size={30} />              // completo, barras herdam a cor do container
<Simbolo size={30} neutra="#fff" /> // força a cor das barras neutras
<SimboloMini size={14} />          // só o chevron
<SimboloMini size={14} cor="#fff" />
<Logo size={26} />                 // símbolo + nome
```

`HexMark` continua exportado por compatibilidade, mas agora renderiza o `SimboloMini`.
