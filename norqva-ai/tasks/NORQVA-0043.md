# NORQVA-0043: tela de pagamento clara também no "Checkout da oferta"

**Branch:** `ai/NORQVA-0043-pagamento-tela-clara` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** correção de tela (D-0037) · **Risco:** LOW

## Motivo

Ricardo (10/10/2026 18h43): pelo botão "Checkout da oferta" (Produtos), a segunda tela (pagamento) continuava escura. A NORQVA-0041 só tinha ligado o visual do produto nas páginas públicas.

## Escopo

- O pagamento aberto pela tela de Produtos usa `look="light"` (creme e terracota), exceto ofertas do Bolso Blindado, que continuam escuras.
