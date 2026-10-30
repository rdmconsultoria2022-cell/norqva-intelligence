# NORQVA-0157 — Visão Geral: lucro, custos e projeção de 30 dias

**Pedido (Ricardo, 30/10/2026 20h19):** "Adicione a informação de lucro, coloque a informação de custos abaixo do valor de investimento e uma projeção para os próximos 30 dias, de acordo com os resultados dos últimos 7 dias."

**Tipo:** mudança de tela (D-0037: sem aprovação). Nada muda no servidor nem no banco.

## O que muda (`frontend/src/features/dashboard/ExecutiveOverview.tsx`)

1. Quadro principal: Investimento | ROAS; **Custos** (abaixo do Investimento, `summary.totalCosts`: impostos, taxas e custos fixos) | Vendas pagas; e **Lucro estimado** em destaque na linha de baixo (era "Resultado estimado"; mesmo número `summary.netProfit` = receita − anúncios − custos), verde quando positivo, vermelho quando negativo.
2. Novo quadro **Projeção para os próximos 30 dias**: receita, vendas, investimento, custos e lucro estimado = (soma dos últimos 7 dias inteiros ÷ 7) × 30. Os 7 dias são sempre de hoje−7 até ontem (dias completos), seja qual for o período escolhido no topo; lidos do mesmo `/financial/dashboard` com período personalizado, então valem as mesmas fórmulas do servidor. Nota explica que é estimativa.
3. Falha na leitura dos 7 dias: o quadro diz "Sem dados dos últimos 7 dias para projetar" e o resto da tela segue.

## Testes

`frontend/src/tests/norqva_0157_profit_projection.test.tsx`: custos, lucro, projeção (×30/7) e janela de 7 dias inteiros; falha da leitura.
