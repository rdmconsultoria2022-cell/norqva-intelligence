-- Migration 057 (NORQVA-0046 etapa 2): entrega pelo WhatsApp depois do pagamento confirmado pelo Asaas.
-- Uma linha por pedido (claim atômico, como o e-mail de acesso). Somente aditiva.

CREATE TABLE IF NOT EXISTS whatsapp_order_deliveries (
  order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'SENDING' CHECK (status IN ('SENDING', 'SENT', 'FAILED', 'SKIPPED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error_code VARCHAR(120),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
