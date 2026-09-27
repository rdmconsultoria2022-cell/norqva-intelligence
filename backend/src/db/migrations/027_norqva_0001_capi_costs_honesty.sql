-- Migration 027: NORQVA-0001 CAPI Retry, Costs Honesty, and Opportunity Score Simulation Persistence

-- 1. Extend capi_events table status constraint and default max_attempts
ALTER TABLE capi_events
  ALTER COLUMN max_attempts SET DEFAULT 8;

ALTER TABLE capi_events
  DROP CONSTRAINT IF EXISTS capi_events_constraint_1;

ALTER TABLE capi_events
  DROP CONSTRAINT IF EXISTS capi_events_status_check;

ALTER TABLE capi_events
  DROP CONSTRAINT IF EXISTS chk_capi_events_status;

ALTER TABLE capi_events
  ADD CONSTRAINT chk_capi_events_status
  CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED'));

-- 2. Business Cost Settings Table (single row per environment / is_demo)
CREATE TABLE IF NOT EXISTS business_cost_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_fixed_costs NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_business_cost_settings_demo UNIQUE(is_demo)
);

CREATE INDEX IF NOT EXISTS idx_business_cost_settings_demo ON business_cost_settings(is_demo);

-- 3. Extend opportunity_scores with simulation tracking
ALTER TABLE opportunity_scores
  ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(50) DEFAULT 'MOCK';
