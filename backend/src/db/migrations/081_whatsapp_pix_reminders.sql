-- NORQVA-0123 etapa B lembrete único de Pix não pago pelo WhatsApp (só aditiva)
-- uma linha por pagamento garante no banco que o lembrete sai no máximo uma vez
-- status SENDING enquanto envia, SENT enviado, SKIPPED não enviado com o motivo em reason, FAILED erro no envio

CREATE TABLE IF NOT EXISTS whatsapp_payment_reminders (
  payment_id UUID PRIMARY KEY REFERENCES payments(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'SENDING' CHECK (status IN ('SENDING', 'SENT', 'SKIPPED', 'FAILED')),
  reason VARCHAR(120),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_payment_reminders_order ON whatsapp_payment_reminders(order_id);
