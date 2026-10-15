# NORQVA-0074: lembrete de pagamento para Pix pendente

**Pedido e autorização:** item 2 do diagnóstico de 15/10/2026 ("lembrete de Pix pendente e oferta depois da compra"); Ricardo: "2- Aprovado" em 15/10/2026 10h38. **Risco:** MEDIUM (e-mail para compradores; não mexe em cobrança nem entrega).

**Motivo:** 24 dos 53 pedidos nunca foram pagos (45%), e ninguém voltava a falar com essas pessoas.

**Como funciona:**
- Na varredura de pagamentos (a cada 5 minutos), depois de conferir no Asaas os pendentes, o NORQVA manda e-mail para pedidos ainda PENDING: etapa 1 aos 15 minutos, etapa 2 às 2 horas, etapa 3 às 20 horas da criação. Se a varredura atrasar, manda só a etapa mais recente.
- Pix ainda válido: o e-mail traz o código Pix Copia e Cola e a validade. Pix vencido: botão "Gerar novo Pix" para a página do produto. Cartão: botão para a página segura do Asaas.
- Só conta real (`is_demo = false`, `COMMERCIAL_PRODUCTION`), pedidos das últimas 30 horas, com e-mail. Não manda se o comprador pagou outro pedido desde 1 dia antes, e com vários pendentes do mesmo comprador só o mais novo recebe.
- Registro em `order_payment_reminders` (migration 065, aditiva): uma linha por pedido e etapa, reservada antes do envio como SENDING (nunca em dobro; confere de novo que o pedido segue pendente), depois SENT ou FAILED. Pagamento sem cobrança criada no Asaas não recebe lembrete. Cartão recebe texto de cartão; "venceu" só quando havia código Pix e ele venceu.
- `PAYMENT_REMINDER_ENABLED=false` desliga. Em produção sem o Resend configurado, não envia.
- Textos sem promessa nova e sem desconto.

**Arquivos:** `services/paymentReminderService.ts` (novo), `services/paymentSweepService.ts` (item 5), `services/emailService.ts` e `services/resendProvider.ts` (e-mail do lembrete), migration 065, teste `norqva_0074_payment_reminders.test.ts`.

**Conferir depois do deploy:** linhas em `order_payment_reminders` com status SENT para os pedidos pendentes novos.
