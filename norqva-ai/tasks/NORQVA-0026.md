# NORQVA-0026: Fase 3 da consolidação — tela Vendas

**Branch:** `ai/NORQVA-0026-vendas` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 08/10/2026 19h07 ("Aprovado"), contrato no Claude Docs "NORQVA-0026 — Contrato: Fase 3, Tela de Vendas" · **Risco:** HIGH (entrega)

## Escopo

- Área **Vendas** no menu e tela `SalesView`: pedidos com comprador, oferta, valor, pagamento, entrega e e-mail de acesso; filtros Todos/Pagos/Pendentes/Com problema; período global; pedidos de teste opcionais. Atalho "Ver todas as vendas" na Visão Geral.
- `GET /api/sales/orders` (ADMIN, OPERATIONS, PERFORMANCE, INTELLIGENCE; e-mail e telefone só ADMIN/OPERATIONS).
- Ações só ADMIN, todas em `audit_logs`:
  - `POST /api/sales/orders/:id/check-payment` — reconciliação no Asaas (mesma do webhook).
  - `POST /api/sales/orders/:id/resend-access` — pedido PAID; reativa entrega vencida/esgotada; e-mail com link novo (`purpose = RESEND`).
  - `POST /api/sales/orders/:id/access-link` — pedido PAID; link `/acesso` de 7 dias para colar no WhatsApp (`purpose = MANUAL`).
- `reissue-delivery` antigo passa a exigir pedido PAID.

## Regras

Nenhum link para pedido não pago; pagamento confirmado só pelo Asaas; link guardado só como hash; entrega revogada não é reativada; sem migration.

## Testes

`backend/src/tests/norqva_0026_sales.test.ts`, `frontend/src/tests/norqva_0026_sales_view.test.tsx`; teste do menu atualizado.
