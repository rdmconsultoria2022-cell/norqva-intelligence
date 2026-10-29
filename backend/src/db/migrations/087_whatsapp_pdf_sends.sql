-- NORQVA-0137 PDF enviado direto no WhatsApp (só aditiva)
-- cada envio dos arquivos de um pedido na conversa (o primeiro depois do PAID e os reenvios a pedido)
-- serve para o limite de envios por pedido e para o histórico

CREATE TABLE IF NOT EXISTS whatsapp_pdf_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  reason VARCHAR(20) NOT NULL,
  files_sent INT NOT NULL DEFAULT 0,
  files_skipped INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_pdf_sends_order ON whatsapp_pdf_sends (order_id);
