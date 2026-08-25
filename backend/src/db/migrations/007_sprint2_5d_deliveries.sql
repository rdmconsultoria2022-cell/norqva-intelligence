-- Migration 007: Sprint 2.5D Webhook Event Tracking and Digital Deliveries

-- 1. Create webhook event tracking table
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  provider_environment VARCHAR(50) NOT NULL DEFAULT 'SANDBOX',
  external_event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  provider_payment_id VARCHAR(255) NOT NULL,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processing_status VARCHAR(50) NOT NULL CHECK (processing_status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED')) DEFAULT 'RECEIVED',
  payload_hash VARCHAR(64) NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_webhook_event UNIQUE (provider, provider_environment, external_event_id)
);

-- 2. Create digital assets metadata table
CREATE TABLE IF NOT EXISTS digital_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  storage_provider VARCHAR(50) NOT NULL DEFAULT 'SUPABASE',
  storage_bucket VARCHAR(100) NOT NULL,
  storage_path TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create mapping between offers and assets
CREATE TABLE IF NOT EXISTS offer_digital_assets (
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE RESTRICT,
  asset_id UUID NOT NULL REFERENCES digital_assets(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (offer_id, asset_id)
);

-- 4. Create order deliveries table
CREATE TABLE IF NOT EXISTS order_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  asset_id UUID NOT NULL REFERENCES digital_assets(id) ON DELETE RESTRICT,
  delivery_token_hash VARCHAR(64) UNIQUE,
  delivery_token_expires_at TIMESTAMPTZ,
  max_downloads INTEGER NOT NULL DEFAULT 5 CHECK (max_downloads > 0),
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  status VARCHAR(50) NOT NULL CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')) DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_download_at TIMESTAMPTZ,
  CONSTRAINT uq_order_delivery_asset UNIQUE(order_id, asset_id),
  CONSTRAINT chk_download_limit CHECK (download_count <= max_downloads)
);
