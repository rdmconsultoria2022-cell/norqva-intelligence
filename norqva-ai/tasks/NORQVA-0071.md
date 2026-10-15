# NORQVA-0071: menu fixo no topo, período compacto e nova ordem da Visão Geral

**Pedido:** Ricardo, 15/10/2026 (prints da Visão Geral no celular). **Autorização:** mudança de tela (D-0037). Nada de pagamento, entrega, gasto na Meta ou dados muda. **Risco:** LOW

**Antes:** o topo (botão do menu + título) rolava junto com a página; o período era uma caixa grande com 7 botões em cima de cada tela; na Visão Geral vinham primeiro o crédito Meta, o quadro "Hoje", campanhas aguardando e o teto dos experimentos, e só depois os resultados.

**Mudanças:**
- `AppShell`: a moldura ocupa a altura da tela (`100dvh`); só o conteúdo rola, então o topo com o botão do menu fica sempre visível (celular e computador).
- `Header`: período à direita, ao lado de "Sincronizar". Mostra só o período escolhido (ícone + nome + seta); as opções abrem num menu pequeno e fecham depois da escolha, ao tocar fora ou com Esc. "Personalizado" abre as datas dentro do menu.
- O filtro aparece só nas telas em que o período filtra números (`PERIOD_AWARE_TABS`: Visão Geral, Campanhas, Pesquisa, Resultados, Criativos, Vendas). A caixa antiga em cima de cada tela saiu.
- Visão Geral, nesta ordem: 1) Resultados (investimento, faturamento, pedidos, entregas) na horizontal; 2) Funil (5 etapas com setas) na horizontal; 3) Tráfego Meta Ads (impressões, alcance, cliques, CTR, CPC, CPM) na horizontal. No celular cada faixa desliza para o lado; no computador cabe numa linha. Depois: crédito Meta, quadro "Hoje", campanhas aguardando, teto dos experimentos, campanhas em operação e últimas transações.
- Os números e as consultas não mudam.
- Testes: `norqva_0071_header_period_layout.test.tsx`; testes antigos que clicavam no período agora abrem o menu antes.
