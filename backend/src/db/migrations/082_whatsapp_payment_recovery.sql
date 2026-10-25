-- NORQVA-0125 WhatsApp para quem gerou um pagamento e não pagou (só aditiva)
-- contrato aprovado pelo Ricardo em 24/10/2026 23h53
-- uma linha por pessoa (telefone normalizado em phone_key) garante no banco uma única mensagem de recuperação para sempre
-- status QUEUED na fila, SENDING enviando, SENT enviada, FAILED erro no envio, SKIPPED não enviada com o motivo em reason

CREATE TABLE IF NOT EXISTS whatsapp_recovery_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_key VARCHAR(20) NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  number_id UUID REFERENCES whatsapp_numbers(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  ref_id UUID REFERENCES whatsapp_refs(id) ON DELETE SET NULL,
  first_name VARCHAR(40),
  product_name VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')),
  reason VARCHAR(120),
  queued_by UUID REFERENCES users(id) ON DELETE SET NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  provider_message_id VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_whatsapp_recovery_phone UNIQUE (phone_key)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_recovery_status ON whatsapp_recovery_messages (status, queued_at);

-- quem respondeu SAIR (ou parar, não quero) fica fora da recuperação para sempre
-- ack_sent_at marca a resposta curta do atendente (uma vez só)
CREATE TABLE IF NOT EXISTS whatsapp_recovery_optouts (
  phone_key VARCHAR(20) PRIMARY KEY,
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  ack_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- espaçamento da fila entre servidores (uma pessoa a cada 2 a 4 minutos)
CREATE TABLE IF NOT EXISTS whatsapp_recovery_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  next_send_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO whatsapp_recovery_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
