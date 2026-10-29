# NORQVA-0148: erros no pagamento (e-mail com acento, motivo da recusa, pedido substituído)

**Branch:** `ai/NORQVA-0148-erros-pagamento` · **Tipo:** pagamento (D-0037, com aprovação) · **Risco:** MEDIUM (mexe na resposta do checkout; entrega e confirmação intactas)

## Aprovação

Contrato no Claude Docs "NORQVA-0148 — Erros no pagamento". **Aprovado pelo Ricardo em 29/10/2026 às 09h54.**

## Problema (análise de 29/10/2026, 30 dias, 80 pedidos)

- 29/10: a compradora digitou o e-mail com acento; o nosso formulário aceitou, o Asaas recusou duas vezes e ela só viu "verifique seus dados". Corrigiu e pagou na terceira.
- O motivo da recusa não ficava guardado (o teste de 27/10 no Kit de Bordado ficou sem explicação).
- Quem abandona o primeiro Pix e paga um segundo pedido deixa o primeiro "aguardando" para sempre, inflando o contador.

## Correção

- `emailProblem` (backend `utils/validation.ts` e frontend `checkoutValidation.ts`); `validateEmail` usa a mesma regra. Cadastro do comprador devolve `{ error, field: 'email' }`; o formulário mostra o motivo embaixo do campo.
- `utils/asaasRejection.ts`: campo pelo código do erro (a descrição só ajuda a reconhecer o campo, nunca é gravada). `runCheckoutCharge` devolve `{ error, field }` e grava `payments.failure_reason` (migration 088, aditiva). Também: `CPF_INVALIDO`, `ASAAS_SEM_RESPOSTA`, `NAO_CRIADO_NO_ASAAS`, `VALOR_DIFERENTE_NO_ASAAS`; sucesso limpa o motivo.
- `PaymentStatus`: mensagens "Confira o/a …" do servidor chegam ao comprador como vieram.
- `services/commerce/supersededOrders.ts`: pedidos substituídos calculados na hora (consulta só pedidos PAID). Vendas: `superseded`, `payment_failure_reason`, `summary.superseded`, pendentes sem os substituídos; painel: "aguardando" sem os substituídos.

## Testes

`backend/src/tests/norqva_0148_payment_errors.test.ts`, P24/P24b em `sprint2_5c_payment.test.ts`, `frontend/src/tests/norqva_0148_payment_errors.test.tsx`.

## Revisão independente

Subagente (29/10): nada bloqueante. Aplicado: log do erro do Asaas sem o corpo da resposta (podia repetir o e-mail); telefone com dígito repetido ou sequência não liga pessoas; pago só da mesma origem (`data_provenance`) e de valor igual ou maior; `ERRO_SEM_STATUS` quando não é timeout/rede/5xx; motivo limpo também na conciliação; faixa de acentos escrita com `\u`.
Fica como está: o Financeiro (`pendingOrdersCount`) continua contando todos os aguardando (é número de funil; só Vendas e o Painel descontam os substituídos); e-mails antigos fora da regra nova já eram recusados pelo Asaas.

## Execução

PR #197 mesclado em 29/10/2026 (CI verde). Deploy automático no Render; migration 088 roda no início do servidor.
