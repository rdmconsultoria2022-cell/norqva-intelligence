-- Migration 011: Commercial Funnel Telemetry and First-Party Attribution
-- Backward-compatible attribution fields on orders and first-party event persistence

-- 1. Extend Orders Table with First-Party Attribution Context (Nullable, Safe Backward Compatibility)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS visitor_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS session_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS fbclid VARCHAR(255),
  ADD COLUMN IF NOT EXISTS utm_source VARCHAR(255),
  ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(255),
  ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(255),
  ADD COLUMN IF NOT EXISTS utm_content VARCHAR(255),
  ADD COLUMN IF NOT EXISTS attribution_metadata JSONB;

-- 2. Commercial Funnel Telemetry Table
CREATE TABLE IF NOT EXISTS commercial_funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('LANDING_PAGE_VIEW', 'OFFER_VIEW', 'CHECKOUT_STARTED')),
  visitor_id VARCHAR(100) NOT NULL,
  session_id VARCHAR(100),
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  offer_human_id VARCHAR(100),
  path VARCHAR(500),
  fbclid VARCHAR(255),
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  utm_content VARCHAR(255),
  metadata JSONB,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_funnel_event_idempotency UNIQUE (event_id, is_demo)
);

-- 3. High Performance Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_funnel_events_visitor ON commercial_funnel_events(visitor_id, is_demo);
CREATE INDEX IF NOT EXISTS idx_funnel_events_type_created ON commercial_funnel_events(event_type, created_at DESC, is_demo);
CREATE INDEX IF NOT EXISTS idx_funnel_events_offer ON commercial_funnel_events(offer_human_id, is_demo);
CREATE INDEX IF NOT EXISTS idx_orders_attribution_visitor ON orders(visitor_id, is_demo);
CREATE INDEX IF NOT EXISTS idx_orders_attribution_fbclid ON orders(fbclid, is_demo);
