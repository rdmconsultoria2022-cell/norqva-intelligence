-- Migration 008: Meta Acquisition Core (Phase A - Read-Only Ingestion)

CREATE TABLE IF NOT EXISTS meta_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(50) NOT NULL CHECK (status IN ('CONNECTED', 'DISCONNECTED', 'ERROR', 'EXPIRED')) DEFAULT 'DISCONNECTED',
  meta_user_id VARCHAR(255),
  meta_user_name VARCHAR(255),
  token_reference VARCHAR(255),
  token_expires_at TIMESTAMPTZ,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_meta_connections_demo UNIQUE (is_demo)
);

CREATE TABLE IF NOT EXISTS meta_ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_account_id VARCHAR(100) NOT NULL,
  connection_id UUID REFERENCES meta_connections(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'BRL',
  timezone_name VARCHAR(100),
  account_status INTEGER DEFAULT 1,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_meta_ad_accounts_id_demo UNIQUE (meta_account_id, is_demo)
);

CREATE TABLE IF NOT EXISTS meta_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_campaign_id VARCHAR(100) NOT NULL,
  ad_account_id UUID NOT NULL REFERENCES meta_ad_accounts(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  objective VARCHAR(100),
  status VARCHAR(50) NOT NULL,
  effective_status VARCHAR(50) NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_meta_campaigns_id_demo UNIQUE (meta_campaign_id, is_demo)
);

CREATE TABLE IF NOT EXISTS meta_ad_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_adset_id VARCHAR(100) NOT NULL,
  campaign_id UUID NOT NULL REFERENCES meta_campaigns(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  effective_status VARCHAR(50) NOT NULL,
  optimization_goal VARCHAR(100),
  billing_event VARCHAR(100),
  daily_budget NUMERIC(14,2),
  lifetime_budget NUMERIC(14,2),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_meta_ad_sets_id_demo UNIQUE (meta_adset_id, is_demo)
);

CREATE TABLE IF NOT EXISTS meta_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_ad_id VARCHAR(100) NOT NULL,
  adset_id UUID NOT NULL REFERENCES meta_ad_sets(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  effective_status VARCHAR(50) NOT NULL,
  meta_creative_id VARCHAR(100),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_meta_ads_id_demo UNIQUE (meta_ad_id, is_demo)
);

CREATE TABLE IF NOT EXISTS meta_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id UUID NOT NULL REFERENCES meta_ad_accounts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES meta_campaigns(id) ON DELETE CASCADE,
  adset_id UUID REFERENCES meta_ad_sets(id) ON DELETE CASCADE,
  ad_id UUID REFERENCES meta_ads(id) ON DELETE CASCADE,
  entity_level VARCHAR(50) NOT NULL CHECK (entity_level IN ('ACCOUNT', 'CAMPAIGN', 'ADSET', 'AD')),
  entity_meta_id VARCHAR(100) NOT NULL,
  date_start DATE NOT NULL,
  date_stop DATE NOT NULL,
  spend NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (spend >= 0),
  impressions INTEGER NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  reach INTEGER CHECK (reach >= 0),
  clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  link_clicks INTEGER CHECK (link_clicks >= 0),
  cpc NUMERIC(10,4),
  cpm NUMERIC(10,4),
  ctr NUMERIC(10,4),
  frequency NUMERIC(10,4),
  raw_actions JSONB,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_meta_insights_idempotency UNIQUE (ad_account_id, entity_level, entity_meta_id, date_start, is_demo)
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_accounts_demo ON meta_ad_accounts(is_demo);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_account ON meta_campaigns(ad_account_id, is_demo);
CREATE INDEX IF NOT EXISTS idx_meta_ad_sets_campaign ON meta_ad_sets(campaign_id, is_demo);
CREATE INDEX IF NOT EXISTS idx_meta_ads_adset ON meta_ads(adset_id, is_demo);
CREATE INDEX IF NOT EXISTS idx_meta_insights_lookup ON meta_insights(ad_account_id, entity_level, date_start, is_demo);
