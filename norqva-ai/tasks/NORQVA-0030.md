# NORQVA-0030: Fase 6 — Produtos com ofertas e tela Resultados

**Branch:** `ai/NORQVA-0030-produtos-resultados` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 08/10/2026 23h02 ("Aprovado"), contrato no Claude Docs "NORQVA-0030 — Contrato: Fase 6, Produtos+Ofertas e Resultados" · **Risco:** LOW (só frontend)

## Escopo

- **Produtos** (`features/products/ProductsView.tsx`): cada produto com dados e procedência, ofertas dele (preço, situação, arquivos de entrega, checkout de teste) e marca. Nova oferta já ligada ao produto. Botões: catálogo ADMIN/PRODUCT; arquivos de entrega e marca só ADMIN (marca com confirmação, porque pode mudar o pixel das vendas).
- **Resultados** (`features/results/ResultsView.tsx`): Financeiro (sub-tela financeira da Visão Geral), Criativos, Público, Crédito Meta (só ADMIN) e Decisões. Nenhum cálculo muda.
- **Visão Geral**: `DashboardView section="overview"` (só a visão executiva, sem a aba de experimentos) + `CreditSummary` (ADMIN).
- **Menu** com 10 itens; `offers`, `creative-performance`, `demographics`, `meta-credit` e `decisions` redirecionam para a tela e a aba certas.

## Regras

Sem mudança de backend nem de banco; pagamento e entrega intactos; nenhum teste fala com a Meta ou com o Asaas.

## Testes

`frontend/src/tests/norqva_0030_products_results.test.tsx`; menu e testes de Ofertas na App ajustados.
