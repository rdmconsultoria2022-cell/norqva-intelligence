-- Migration 024: Meta Demographic Intelligence Core V1 (Read-Only Demographic Foundation)
-- Creates isolated, idempotent table for demographic age and gender breakdown slices.

CREATE TABLE IF NOT EXISTS meta_demographic_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  ad_account_id UUID NOT NULL
    REFERENCES meta_ad_accounts(id) ON DELETE CASCADE,

  campaign_id UUID
    REFERENCES meta_campaigns(id) ON DELETE CASCADE,

  adset_id UUID
    REFERENCES meta_ad_sets(id) ON DELETE CASCADE,

  ad_id UUID
    REFERENCES meta_ads(id) ON DELETE CASCADE,

  entity_level VARCHAR(50) NOT NULL
    CHECK (entity_level IN ('ACCOUNT', 'CAMPAIGN', 'ADSET', 'AD')),

  entity_meta_id VARCHAR(100) NOT NULL,

  date_start DATE NOT NULL,
  date_stop DATE NOT NULL,

  age_group VARCHAR(50) NOT NULL
    CHECK (age_group IN ('18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'unknown')),

  gender VARCHAR(50) NOT NULL
    CHECK (gender IN ('male', 'female', 'unknown')),

  spend NUMERIC(14,2) NOT NULL DEFAULT 0.00
    CHECK (spend >= 0),

  impressions BIGINT NOT NULL DEFAULT 0
    CHECK (impressions >= 0),

  reach BIGINT
    CHECK (reach >= 0),

  clicks BIGINT NOT NULL DEFAULT 0
    CHECK (clicks >= 0),

  link_clicks BIGINT
    CHECK (link_clicks >= 0),

  cpc NUMERIC(14,4),
  cpm NUMERIC(14,4),
  ctr NUMERIC(14,4),

  data_provenance VARCHAR(50)
    NOT NULL DEFAULT 'COMMERCIAL_PRODUCTION',

  is_demo BOOLEAN NOT NULL DEFAULT FALSE,

  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Strict Daily Granularity Guard: Prevents multi-day aggregated snapshots from contaminating demographic slices
  CONSTRAINT chk_meta_demo_daily_only CHECK (date_start = date_stop),

  -- Multi-column Unique Constraint for Idempotent Daily Cohort Upserts
  CONSTRAINT uq_meta_demographic_insights_idempotency
  UNIQUE (
    ad_account_id,
    entity_level,
    entity_meta_id,
    date_start,
    age_group,
    gender,
    is_demo
  )
);

-- Performance Indexes for Demographic Aggregations and Entity Rollups
CREATE INDEX IF NOT EXISTS idx_meta_demo_date ON meta_demographic_insights(date_start, is_demo);
CREATE INDEX IF NOT EXISTS idx_meta_demo_ad ON meta_demographic_insights(ad_id, is_demo);
CREATE INDEX IF NOT EXISTS idx_meta_demo_age_gender ON meta_demographic_insights(age_group, gender, is_demo);
CREATE INDEX IF NOT EXISTS idx_meta_demo_campaign ON meta_demographic_insights(campaign_id, is_demo);
CREATE INDEX IF NOT EXISTS idx_meta_demo_date_age ON meta_demographic_insights(date_start, age_group, is_demo);
