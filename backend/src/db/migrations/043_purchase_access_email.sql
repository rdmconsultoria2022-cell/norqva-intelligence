-- NORQVA-0023: entrega do PDF que não depende da aba do checkout. Só aditiva.
-- 1. order_access_emails: um e-mail de acesso por pedido pago (envio único, tentativas registradas).
-- 2. order_recovery_tokens: link do e-mail de compra pode ser aberto mais de uma vez (max_uses);
--    o padrão 1 mantém a recuperação de acesso exatamente como era.
-- 3. payments.pix_qr_image: QR Code (PNG base64) devolvido pelo Asaas, para a tela do Pix.
-- 4. payment_webhook_events.retry_count: reprocessamento de webhooks que falharam.
-- Nada aqui libera entrega: a regra continua sendo pedido PAID confirmado pelo Asaas.

CREATE TABLE IF NOT EXISTS order_access_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('SENDING', 'SENT', 'SIMULATED', 'FAILED')),
  attempts INT NOT NULL DEFAULT 1,
  error_code VARCHAR(120),
  provider_message_id VARCHAR(200),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_access_emails_status ON order_access_emails(status);

ALTER TABLE order_recovery_tokens ADD COLUMN IF NOT EXISTS max_uses INT NOT NULL DEFAULT 1;
ALTER TABLE order_recovery_tokens ADD COLUMN IF NOT EXISTS purpose VARCHAR(20) NOT NULL DEFAULT 'RECOVERY';

ALTER TABLE payments ADD COLUMN IF NOT EXISTS pix_qr_image TEXT;

ALTER TABLE payment_webhook_events ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;
