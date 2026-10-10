# NORQVA-0045: "Últimas transações" repetia o pedido do kit

**Branch:** `ai/NORQVA-0045-transacoes-duplicadas` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** correção de erro de tela (D-0037) · **Risco:** LOW

## Motivo

Ricardo (10/10/2026 19h16): a compra do kit aparecia duas vezes no painel, com o valor cheio em cada linha. Era só a lista: ela juntava o pedido com cada arquivo entregue (o kit tem 2) e repetia a linha. O faturamento não foi afetado (soma pedidos, sem essa junção).

## Escopo

- Lista "Últimas transações": uma linha por pedido; downloads somados; cobrança confirmada preferida.
- Coluna "Pagamento" mostra Pix ou Cartão; no cartão com valor diferente do pedido, mostra o valor cobrado.
