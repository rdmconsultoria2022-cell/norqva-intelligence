# NORQVA-0158 — WhatsApp: parar de atender quem não é cliente

**Pedido (Ricardo, 01/11/2026 16h20):** mensagem no atendimento oferecendo produto (era o robô da Shopee, e o nosso atendente respondia o robô deles). "Precisamos encontrar uma forma de identificar essas mensagens para não continuar o atendimento."

**Tipo:** correção de comportamento do atendente (D-0037: sem aprovação). Não mexe em pagamento, entrega nem dados de cliente.

## O que muda

- `services/whatsapp/notCustomer.ts`: `detectNotCustomer` (sinais fortes: "WhatsApp oficial da…", mensagem automática, menu "responda 1", "baixe o app", "gostaria de apresentar/oferecer…", tráfego pago/marketing, proposta comercial, crédito, renda extra; sinais fracos só valem dois juntos) e `markNotCustomer` (modo HUMAN, `needs_human` FALSE, `not_customer_at`/`not_customer_reason`).
- `attendant.ts`: antes da IA, confere as mensagens recebidas desde a última resposta; se for "não cliente" (e a pessoa não tem pedido pago), para sem responder e sem chamar ninguém. Nova ferramenta `mark_not_customer` e regra 5b no prompt para os casos que a regra fixa não pega; nada da resposta é enviado.
- Migration 090 (só aditiva): `whatsapp_conversations.not_customer_at`, `not_customer_reason`.
- `whatsappService.ts`: filtro `NOT_CUSTOMER`, campos na lista e na conversa; "Devolver ao atendente" (modo BOT) tira a marca.
- Tela WhatsApp: rótulo "Não é cliente", filtro "Não é cliente" e aviso com o motivo na conversa.

## Testes

`norqva_0046_whatsapp_attendant.test.ts`: detector (robô, oferta, mensagem automática; cliente com cupom, CNPJ ou dúvida não é marcado); robô para sem resposta e sem chamar pessoa, aparece no filtro e volta ao atendente; IA marca e nada é enviado.
