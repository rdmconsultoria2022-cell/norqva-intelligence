# NORQVA-0072: cartões da Visão Geral compactos, cada faixa numa linha sem deslizar

**Pedido:** Ricardo, 15/10/2026 09h58: a organização da NORQVA-0071 ficou boa, mas os cartões estão grandes; todos numa linha, sem precisar deslizar. **Autorização:** mudança de tela (D-0037). **Risco:** LOW

**Mudanças** (`DashboardView.tsx`, `AppShell.tsx`):
- Resultados em 4 colunas fixas, Funil em 5 e Tráfego Meta Ads em 6, em qualquer largura de tela (antes: faixa deslizante no celular).
- Abaixo de 1280px (celular, tablet e notebook com o menu lateral): rótulos curtos (Invest., Fatur., Pedidos, Entregas; Pedidos, Pix, Pagos, Entreg., Downl.; Impr., Alcance, Cliques, CTR, CPC, CPM), valores menores em fonte mais estreita e valores resumidos (`brlShort`: R$ 772,65 / R$ 1.234 / R$ 12 mil; `numShort`: 1,9 mil / 46 mil). A partir de 1280px voltam o texto e os valores completos. Nenhum número fica cortado com "…" de 360px a 1440px (simulação da revisão).
- Margem lateral do conteúdo no celular de 16 para 12 px; menos espaço interno nos blocos.
- Números e consultas não mudam.
