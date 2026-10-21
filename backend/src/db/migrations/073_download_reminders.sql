-- Migration 073 (NORQVA-0107): registro dos lembretes de download para quem pagou e nunca baixou.
-- Aprovado pelo Ricardo em 21/10/2026 20h12 ("2 sim").
-- Uma linha por pedido e etapa (1 = 3 horas, 2 = 24 horas depois do pagamento). Só aditiva.

CREATE TABLE IF NOT EXISTS order_download_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  step INTEGER NOT NULL CHECK (step IN (1, 2)),
  status VARCHAR(20) NOT NULL CHECK (status IN ('SENDING', 'SENT', 'FAILED')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  CONSTRAINT uq_order_download_reminders_step UNIQUE (order_id, step)
);
