# NORQVA-0159 — WhatsApp: cartão só quando o cliente pede

**Pedido (Ricardo, 01/11/2026 16h36):** na conversa de um cliente, o atendente gerou o link de cartão sem a pessoa escolher a forma de pagamento; ela pediu Pix em seguida e ficou um pedido de cartão "aguardando" ao lado do Pix pago (pedido duplicado).

**Tipo:** correção de erro do atendente (D-0037). Só restringe: nenhuma cobrança nova, nenhum valor muda.

## O que muda (`services/whatsapp/attendant.ts`)

- `chosenPaymentMethods`: lê as últimas 12 mensagens do cliente e vê se ele falou em Pix e/ou cartão (cartão, crédito, parcelas, "3x", bandeiras).
- `create_card_payment` só gera o link se o cliente falou em cartão; sem escolha, a ferramenta devolve "pergunte: Prefere pagar no Pix ou no cartão?"; se ele pediu Pix, manda usar o Pix.
- `create_pix_payment` fica barrado só quando o cliente pediu cartão (e não Pix). O Pix continua sendo a forma principal.
- Regra 4 do prompt: antes de cobrar, perguntar a forma de pagamento se o cliente não disse; nunca escolher por ele nem gerar as duas.

## Testes

`norqva_0046_whatsapp_attendant.test.ts`: reconhecimento da forma escolhida; sem pedir cartão, o link de cartão não é gerado e nenhum pedido é criado.
