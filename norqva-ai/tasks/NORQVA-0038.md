# NORQVA-0038: Kit Cozinha Italiana com cartão de crédito e landing page

**Branch:** `ai/NORQVA-0038-kit-cartao` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 10/10/2026 15h24 (entrega na confirmação, risco de contestação assumido) e 15h32 ("Aprovado"), contrato no Claude Docs "NORQVA-0038 — Contrato: Kit Cozinha Italiana com cartão de crédito e landing page" · **Risco:** HIGH (pagamento e entrega)

## Escopo

- Migration 049 (só aditiva): `offers.card_enabled/card_max_installments/card_total_price`, `payments.provider_installment_id/invoice_url/installment_count`, tipo de funil `CARD_CHARGE_CREATED`.
- `POST /api/checkout/orders/:orderId/card`: cobrança `CREDIT_CARD` no Asaas sem dados do cartão (o comprador paga na `invoiceUrl` do Asaas). Parcelado: `installmentCount` + `totalValue`. Valor e parcelas calculados no servidor (`resolveCardTerms`). Um pedido não troca de meio no meio do caminho (409 `PAYMENT_METHOD_LOCKED`).
- Conciliação: no cartão parcelado confere a soma das parcelas (`GET /installments/{id}/payments`), não o valor de uma parcela. Grava taxa e valor líquido.
- Webhook: acha o pagamento pela nossa referência, pelo id da cobrança ou pelo parcelamento; parcela de parcelamento desconhecido responde 200 (não trava a fila do Asaas).
- Estorno/contestação (`PAYMENT_REFUNDED`, `PAYMENT_REFUND_IN_PROGRESS`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`): pedido e pagamento `REFUNDED`, entregas e links de acesso `REVOKED`, auditoria. Uma confirmação posterior não reativa.
- Editor de oferta: "Aceita cartão", parcelas (1–12) e total no cartão (≥ Pix, ≤ Pix + 30%, parcelas iguais).
- Produtos: "Usar um PDF que já existe" para o kit entregar os PDFs do Trattoria e do Dolci.
- Checkout: escolha Pix/cartão (só quando a oferta aceita cartão); tela de pagamento com o botão da página segura do Asaas.
- Página do kit em `/kit/<código da oferta>`, com preços e parcelas da oferta; depoimentos escondidos até haver depoimentos reais.

## Regras

Entrega só com confirmação vinda do Asaas (webhook ou consulta). O NORQVA nunca recebe dados de cartão. Pix sem mudança de comportamento. Testes com o Asaas simulado.
