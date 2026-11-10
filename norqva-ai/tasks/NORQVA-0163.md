# NORQVA-0163 — Pix e cartão de quem já comprou

## Problema (10/11/2026)
O atendente do WhatsApp não gerava Pix (nem cartão) para o Jean Lucas Rech (teste do Ricardo).
Conferido pela API pública: cliente que já tinha comprado → recusa 400 do Asaas com a mensagem
genérica; cliente novo → Pix gerado normalmente. A conta do Asaas está bem; o vínculo guardado
em `payment_provider_customers` aponta para um cliente do Asaas que não é mais aceito
(apagado ou inválido), e o NORQVA reutilizava esse vínculo para sempre.

## Mudança
- `utils/asaasRejection.ts`: `isAsaasCustomerRejection` reconhece recusa 4xx por causa do cliente
  (código com "customer" ou descrição "cliente/customer … inválido/removido/não encontrado").
- `controllers/api.ts` (checkout Pix e cartão): a cobrança roda em `chargeOnce()`. Se o Asaas recusar
  por causa do cliente e houver CPF válido (guardado ou enviado), refaz o cliente no Asaas uma vez,
  atualiza o vínculo (nada é apagado), grava `ASAAS_CUSTOMER_RECREATED` em `audit_logs` e tenta de novo.
  Recusa de novo → falha como antes. Outras recusas (CPF, e-mail…) seguem iguais.
- Teste: `tests/norqva_0163_asaas_customer.test.ts` (Asaas sempre simulado).

## Aprovação
Correção de erro em pagamento: não muda preço, regra de entrega nem confirmação PAID
(entrega continua só com PAID do Asaas). Tratado como correção de erro (D-0037).
