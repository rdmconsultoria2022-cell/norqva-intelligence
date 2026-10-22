# NORQVA-0114: tirar do faturamento a compra de teste do Seca Barriga

**Autorização:** Ricardo, 22/10/2026 19h14 ("sim" para a compra real de teste), contrato Claude Docs "NORQVA-0112 — Contrato: Seca Barriga no checkout do NORQVA". **Risco:** LOW (reclassifica 1 pedido, nada é apagado).

**O que muda:** migration 075 marca como `STAGING_SANDBOX_QA` o pedido 07425233-2e43-4413-933c-43958153a3e8 (OFF-000014, R$ 37,00, Pix, pago em 22/10/2026 19h24), igual às migrations 028 e 048. Só age se achar exatamente esse pedido pago, real, de R$ 37,00, criado entre 19h20 e 19h30. Grava `ORDER_RECLASSIFIED_TEST` (ou `ORDER_RECLASSIFY_SKIPPED`).

**Resultado do teste (22/10/2026):** pedido pago e confirmado pelo Asaas às 19h24; e-mail "Seca Barriga 21 Dias <acesso@mail.norqva.com.br>" entregue (Resend) 0,4 s depois; primeiro download feito.
