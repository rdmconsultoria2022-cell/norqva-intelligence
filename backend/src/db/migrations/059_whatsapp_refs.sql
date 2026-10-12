-- Migration 059 (NORQVA-0054, contrato NORQVA-0053 item 3): página → WhatsApp com código de origem.
-- Somente aditiva. Cada clique em "Quero pelo WhatsApp" guarda de qual campanha e anúncio a pessoa veio
-- (utm, fbc/fbp, endereço e navegador da página) com um código curto que vai na mensagem pronta.
-- Quando a pessoa manda a mensagem, a conversa fica ligada ao código e o pedido herda a origem.

CREATE TABLE IF NOT EXISTS whatsapp_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(12) NOT NULL UNIQUE,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  offer_human_id VARCHAR(100),
  number_id UUID REFERENCES whatsapp_numbers(id) ON DELETE SET NULL,
  visitor_id VARCHAR(100),
  session_id VARCHAR(100),
  fbclid VARCHAR(255),
  fbc VARCHAR(255),
  fbp VARCHAR(255),
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  utm_content VARCHAR(255),
  attribution_metadata JSONB,
  client_ip_address VARCHAR(100),
  client_user_agent TEXT,
  event_source_url TEXT,
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_refs_created ON whatsapp_refs (created_at);

ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS ref_id UUID REFERENCES whatsapp_refs(id) ON DELETE SET NULL;
