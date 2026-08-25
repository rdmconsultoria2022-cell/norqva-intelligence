-- Migration 006: Sprint 2.5 Payments and Provider Customer mappings

-- 1. Add PII protection fields for CPF/CNPJ in customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cpf_cnpj_encrypted TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cpf_cnpj_hash VARCHAR(64);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cpf_cnpj_encryption_key_version INTEGER DEFAULT 1;

-- 2. Add secure hashed checkout token and lifecycle fields to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_token_hash VARCHAR(64) UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_token_expires_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_token_revoked_at TIMESTAMPTZ;

-- 3. Create payment provider customers mapping
CREATE TABLE IF NOT EXISTS payment_provider_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  provider VARCHAR(50) NOT NULL,
  provider_customer_id VARCHAR(255) NOT NULL,
  provider_environment VARCHAR(50) NOT NULL DEFAULT 'SANDBOX',
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_provider_customer UNIQUE(customer_id, provider, provider_environment),
  CONSTRAINT uq_provider_customer_id_env UNIQUE(provider, provider_environment, provider_customer_id)
);

-- 4. Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id VARCHAR(100) UNIQUE NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider VARCHAR(50) NOT NULL,
  provider_payment_id VARCHAR(255),
  payment_method VARCHAR(50) NOT NULL DEFAULT 'PIX',
  status VARCHAR(50) NOT NULL CHECK (status IN ('CREATED', 'PENDING', 'CONFIRMED', 'FAILED', 'EXPIRED', 'REFUNDED', 'REQUIRES_RECONCILIATION')) DEFAULT 'CREATED',
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  provider_fee NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  net_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  pix_copy_paste TEXT,
  expires_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  idempotency_key VARCHAR(255) NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  provider_environment VARCHAR(50) NOT NULL DEFAULT 'SANDBOX',
  external_reference VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_payments_provider_payment_id UNIQUE(provider, provider_environment, provider_payment_id),
  CONSTRAINT uq_payments_provider_idempotency UNIQUE(provider, provider_environment, idempotency_key, is_demo),
  CONSTRAINT uq_payments_provider_external_ref UNIQUE(provider, provider_environment, external_reference)
);
