-- Migration 026: Commercial Phase 1 Real Metrics, CAPI Telemetry, Unit Economics and Sequences
-- 1. Postgres Sequences for Sequential Human IDs
CREATE SEQUENCE IF NOT EXISTS seq_opportunities_human_id START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_products_human_id START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_decisions_human_id START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_offers_human_id START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_creatives_human_id START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_experiments_human_id START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_research_sessions_human_id START WITH 1 INCREMENT BY 1;

-- 2. Extend Orders Table with Meta CAPI Attribution Context
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fbc VARCHAR(255),
  ADD COLUMN IF NOT EXISTS fbp VARCHAR(255),
  ADD COLUMN IF NOT EXISTS client_ip_address VARCHAR(100),
  ADD COLUMN IF NOT EXISTS client_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS event_source_url TEXT;

-- 3. Meta Conversions API (CAPI) Events & Retry Queue Table
CREATE TABLE IF NOT EXISTS capi_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  event_name VARCHAR(50) NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  pixel_id VARCHAR(100) NOT NULL,
  action_source VARCHAR(50) NOT NULL DEFAULT 'website',
  event_source_url TEXT,
  payload JSONB NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  response_status INT,
  response_body JSONB,
  error_message TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_capi_events_dedup UNIQUE (event_id, is_demo)
);

CREATE INDEX IF NOT EXISTS idx_capi_events_order ON capi_events(order_id, is_demo);
CREATE INDEX IF NOT EXISTS idx_capi_events_status ON capi_events(status, attempts);

-- 4. Offer Unit Economics Table for Real Costs & Break-even Intelligence
CREATE TABLE IF NOT EXISTS offer_unit_economics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  tax_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.0000,
  gateway_fixed_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  gateway_pct_fee NUMERIC(6, 4) NOT NULL DEFAULT 0.0000,
  other_variable_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  target_net_margin NUMERIC(6, 4) NOT NULL DEFAULT 0.2000,
  monthly_fixed_costs NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_offer_unit_economics_offer UNIQUE(offer_id, is_demo)
);

CREATE INDEX IF NOT EXISTS idx_offer_unit_economics_offer ON offer_unit_economics(offer_id, is_demo);

-- 5. Expand commercial_funnel_events event_type CHECK constraint with PIX_GENERATED, PIX_EXPIRED and PAID
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'commercial_funnel_events' 
      AND constraint_name = 'commercial_funnel_events_event_type_check'
  ) THEN
    ALTER TABLE commercial_funnel_events DROP CONSTRAINT commercial_funnel_events_event_type_check;
  END IF;
END $$;

ALTER TABLE commercial_funnel_events
  DROP CONSTRAINT IF EXISTS chk_commercial_funnel_events_event_type;

ALTER TABLE commercial_funnel_events
  DROP CONSTRAINT IF EXISTS commercial_funnel_events_constraint_1;

ALTER TABLE commercial_funnel_events
  DROP CONSTRAINT IF EXISTS commercial_funnel_events_event_type_check;

ALTER TABLE commercial_funnel_events
  ADD CONSTRAINT chk_commercial_funnel_events_event_type
  CHECK (event_type IN (
    'LANDING_PAGE_VIEW',
    'OFFER_VIEW',
    'CHECKOUT_MODAL_OPENED',
    'CHECKOUT_STARTED',
    'PIX_GENERATED',
    'PIX_EXPIRED',
    'PAID'
  ));
