-- Migration 067 (NORQVA-0079 etapa 1): segundo motor do WhatsApp, a Cloud API oficial da Meta.
-- Aprovado pelo Ricardo em 15/10/2026 23h27 (contrato NORQVA-0079 no Claude Docs).
-- Somente aditiva: tabela nova e colunas novas com valor padrão. Nada existente é alterado.
-- Os números já cadastrados continuam com provider = EVOLUTION.
-- Token e App Secret ficam criptografados (AES-256-GCM, chave WHATSAPP_SECRETS_KEY) e nunca voltam para a tela.

CREATE TABLE IF NOT EXISTS whatsapp_cloud_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(80) NOT NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  environment VARCHAR(12) NOT NULL DEFAULT 'TEST'
    CHECK (environment IN ('TEST', 'PRODUCTION')),
  waba_id VARCHAR(40) NOT NULL,
  app_id VARCHAR(40) NOT NULL,
  graph_api_version VARCHAR(10) NOT NULL DEFAULT 'v26.0',
  access_token_enc TEXT NOT NULL,
  app_secret_enc TEXT NOT NULL,
  token_last4 VARCHAR(4) NOT NULL DEFAULT '',
  verify_token_hash VARCHAR(64) NOT NULL,
  test_recipients TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW', 'VERIFIED', 'INVALID', 'DISABLED')),
  webhook_verified_at TIMESTAMPTZ,
  last_check_at TIMESTAMPTZ,
  last_error TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE whatsapp_numbers ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'EVOLUTION'
  CHECK (provider IN ('EVOLUTION', 'META_CLOUD'));
ALTER TABLE whatsapp_numbers ADD COLUMN IF NOT EXISTS cloud_account_id UUID REFERENCES whatsapp_cloud_accounts(id) ON DELETE SET NULL;
ALTER TABLE whatsapp_numbers ADD COLUMN IF NOT EXISTS phone_number_id VARCHAR(40);
ALTER TABLE whatsapp_numbers ADD COLUMN IF NOT EXISTS display_phone_number VARCHAR(40);
ALTER TABLE whatsapp_numbers ADD COLUMN IF NOT EXISTS verified_name VARCHAR(120);
ALTER TABLE whatsapp_numbers ADD COLUMN IF NOT EXISTS quality_rating VARCHAR(20);
ALTER TABLE whatsapp_numbers ADD COLUMN IF NOT EXISTS messaging_limit VARCHAR(40);

ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20)
  CHECK (delivery_status IN ('BLOCKED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'OUTSIDE_WINDOW'));
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS error_code VARCHAR(40);
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS template_name VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_provider_id ON whatsapp_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;

-- Índices únicos parciais: uma WABA pertence a uma só conta e a um só ambiente, e um phone_number_id a um só número ativo.
-- Em bloco DO: o PostgreSQL (produção e CI) executa e o pg-mem dos testes ignora (não suporta este tipo de índice).
DO $$
BEGIN
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_cloud_accounts_waba ON whatsapp_cloud_accounts (waba_id) WHERE is_deleted = FALSE';
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_numbers_phone_number_id ON whatsapp_numbers (phone_number_id) WHERE phone_number_id IS NOT NULL AND is_deleted = FALSE';
END $$;
