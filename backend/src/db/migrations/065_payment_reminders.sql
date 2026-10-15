-- Migration 065 (NORQVA-0074): registro dos lembretes de pagamento enviados para pedidos pendentes.
-- Aprovado pelo Ricardo em 15/10/2026 10h38 ("2- Aprovado", item 2 do diagnóstico).
-- Uma linha por pedido e etapa (1 = 15 minutos, 2 = 2 horas, 3 = 20 horas). Só aditiva.

CREATE TABLE IF NOT EXISTS order_payment_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  step INTEGER NOT NULL CHECK (step IN (1, 2, 3)),
  channel VARCHAR(20) NOT NULL DEFAULT 'EMAIL',
  status VARCHAR(20) NOT NULL CHECK (status IN ('SENDING', 'SENT', 'FAILED')),
  pix_expired BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_order_payment_reminders_step UNIQUE (order_id, step)
);

