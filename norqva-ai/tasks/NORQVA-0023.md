# NORQVA-0023: Entrega do PDF que não depende da aba do checkout

**Branch:** `ai/NORQVA-0023-entrega-pdf` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI · **Merge:** Claude, depois do CI verde (autorizado pelo operador)
**Autorização:** Ricardo, 07/10/2026 20h59 ("Aprovado"), contrato no Claude Docs "NORQVA-0023 — Contrato: Correções na Entrega do PDF" · **Risco:** HIGH (pagamento e entrega)

## Problema

Compradores da Trattoria pagaram o Pix e não receberam o PDF; reclamaram no Instagram e no Facebook e o PDF foi mandado à mão. A auditoria de 07/10 mostrou que o PDF só chegava pela aba do checkout:
- a tela de entrega dizia que os links foram enviados por e-mail, mas nenhum e-mail saía após o pagamento;
- webhook do Asaas que falhava uma vez nunca era reprocessado;
- a tela do Pix não mostrava QR Code;
- o painel mostrava "DISPONÍVEL" até para entrega vencida ou revogada.

## Escopo

1. **E-mail de acesso no PAID** (`services/purchaseAccessService.ts`): ao confirmar o pagamento, envia ao comprador um link `/acesso/<token>` (mesmo fluxo da recuperação). Um envio por pedido (`order_access_emails` como claim atômico); falha fica `FAILED` e é tentada de novo até 3 vezes; o link de uma falha é revogado. O link vale 7 dias (`PURCHASE_ACCESS_TOKEN_TTL_HOURS`) e abre até 10 vezes (`PURCHASE_ACCESS_MAX_USES`).
2. **Texto honesto**: a tela de entrega só diz que mandou e-mail se `accessEmailSent` for verdadeiro.
3. **QR Code**: guarda o `encodedImage` do `/pixQrCode` do Asaas em `payments.pix_qr_image` e mostra na tela do Pix.
4. **Confirmação mesmo se o webhook falhar**:
   - o mesmo evento chegando de novo depois de `FAILED` é reprocessado (`retryFailedWebhookEvent`, até 5 vezes);
   - a verificação da tela do comprador consulta o Asaas para pedido real PENDING (no máximo a cada 15 s por pagamento);
   - varredura a cada 5 min (`PAYMENT_SWEEP_ENABLED=false` desliga): webhooks que falharam, pagamentos pendentes das últimas 48 h e e-mails que faltaram (só pedidos pagos depois desta entrega, para não reenviar a quem já foi atendido à mão).
5. **Painel**: "DISPONÍVEL" só para entrega ativa; "VENCIDA (SEM DOWNLOAD)", "REVOGADA" e a situação do e-mail de acesso.

## Regras que não mudam

- Entrega só com pedido PAID; a confirmação vem sempre do Asaas (`reconcileAndFinalizePayment`), nunca da tela.
- CPF continua criptografado e apagado depois do Pix.
- Nenhum Purchase falso, nenhum pagamento simulado como real.
- Migration 043 só aditiva. A recuperação de acesso comum continua de uso único (`max_uses` padrão 1).

## Fora do escopo

Tirar o CPF do checkout (depende da auditoria do Asaas), entrega pelo WhatsApp, tela de Vendas, Bolso Blindado.

## Testes

`backend/src/tests/norqva_0023_purchase_access.test.ts` (A–J) e `frontend/src/tests/norqva_0023_delivery.test.tsx`. Schemas pg-mem dos testes de recuperação ganharam a coluna `max_uses`.

## Operação

O envio real depende de `RESEND_API_KEY`/`EMAIL_FROM` e `FRONTEND_URL` válidos no Render. Sem eles, o e-mail fica `FAILED` e aparece como "E-MAIL FALHOU" no painel; o resto funciona.
