-- Migration 056 (NORQVA-0046): WhatsApp dentro do NORQVA, com até 100 números, conversas e condições de atendimento.
-- Aprovado pelo Ricardo em 2026-10-10 19h38 (contrato NORQVA-0046). Somente aditiva, nada existente é alterado.
-- Todo número nasce com o atendente automático DESLIGADO (bot_enabled = FALSE).
-- Mensagens dos clientes são apagadas depois de 180 dias (rotina do servidor).

CREATE TABLE IF NOT EXISTS whatsapp_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(80) NOT NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  instance_name VARCHAR(60) NOT NULL UNIQUE,
  webhook_secret_hash VARCHAR(64) NOT NULL,
  phone VARCHAR(40),
  profile_name VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW', 'CONNECTING', 'CONNECTED', 'DISCONNECTED', 'BANNED')),
  status_reason TEXT,
  bot_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  conditions TEXT NOT NULL DEFAULT '',
  last_qr_base64 TEXT,
  last_qr_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number_id UUID NOT NULL REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  contact_jid VARCHAR(120) NOT NULL,
  contact_phone VARCHAR(40),
  contact_name VARCHAR(120),
  mode VARCHAR(20) NOT NULL DEFAULT 'BOT'
    CHECK (mode IN ('BOT', 'HUMAN', 'OPTED_OUT')),
  needs_human BOOLEAN NOT NULL DEFAULT FALSE,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_message_preview VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_whatsapp_conversation UNIQUE (number_id, contact_jid)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_last ON whatsapp_conversations (last_message_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  direction VARCHAR(3) NOT NULL CHECK (direction IN ('IN', 'OUT')),
  author VARCHAR(20) NOT NULL CHECK (author IN ('CUSTOMER', 'BOT', 'OPERATOR', 'PHONE', 'SYSTEM')),
  body TEXT NOT NULL DEFAULT '',
  kind VARCHAR(20) NOT NULL DEFAULT 'TEXT',
  provider_message_id VARCHAR(120),
  send_status VARCHAR(20) NOT NULL DEFAULT 'OK' CHECK (send_status IN ('OK', 'FAILED')),
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conv ON whatsapp_messages (conversation_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_messages_provider ON whatsapp_messages (conversation_id, provider_message_id) WHERE provider_message_id IS NOT NULL;

-- Condições de atendimento: texto geral (number_id nulo) ou de um número, com histórico de versões
CREATE TABLE IF NOT EXISTS whatsapp_condition_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number_id UUID REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  conditions TEXT NOT NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_condition_versions ON whatsapp_condition_versions (number_id, created_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  global_conditions TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO whatsapp_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Pedido criado pelo atendente do WhatsApp (para entregar na conversa e medir vendas por número)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS whatsapp_conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE SET NULL;
