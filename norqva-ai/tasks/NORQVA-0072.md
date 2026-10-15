# NORQVA-0072: cartões da Visão Geral compactos, cada faixa numa linha sem deslizar

**Pedido:** Ricardo, 15/10/2026 09h58: a organização da NORQVA-0071 ficou boa, mas os cartões estão grandes; todos numa linha, sem precisar deslizar. **Autorização:** mudança de tela (D-0037). **Risco:** LOW

**Mudanças** (`DashboardView.tsx`, `AppShell.tsx`):
- Resultados em 4 colunas fixas, Funil em 5 e Tráfego Meta Ads em 6, em qualquer largura de tela (antes: faixa deslizante no celular).
- No celular (< 640px): rótulos curtos (Invest., Fatur., Pedidos, Entregas; Pedidos, Pix, Pagos, Entreg., Downl.; Impr., Alcance, Cliques, CTR, CPC, CPM), valores menores em fonte mais estreita e valores resumidos (`brlShort`: R$ 772,65 / R$ 1.234 / R$ 12,3 mil; `numShort`: 10 mil). Do tablet para cima continua o texto completo.
- Margem lateral do conteúdo no celular de 16 para 12 px; menos espaço interno nos blocos.
- Números e consultas não mudam.
