-- Migration 029: Creative Factory core (NORQVA-0005 / G1)
-- Additive only. Matrix metadata, versioning and approval state on creatives, plus the
-- claims registry, creative reviews and deterministic creative-to-Meta-ad links.

-- A proposal exists before the asset is produced
ALTER TABLE creatives ALTER COLUMN file_url DROP NOT NULL;

ALTER TABLE creatives ADD COLUMN IF NOT EXISTS batch_code VARCHAR(50);
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS hook_family VARCHAR(50);
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS angle TEXT;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS pain TEXT;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS desire TEXT;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS mechanism TEXT;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS proof_type VARCHAR(50);
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS audience TEXT;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS primary_text TEXT;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS headline TEXT;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS script TEXT;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS generation_source VARCHAR(30) NOT NULL DEFAULT 'HUMAN';
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS parent_creative_id UUID REFERENCES creatives(id) ON DELETE SET NULL;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS root_creative_id UUID;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS lineage_code VARCHAR(100);
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS utm_content_key VARCHAR(100);
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS approval_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT';
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_creatives_utm_content_key ON creatives (utm_content_key);
CREATE INDEX IF NOT EXISTS idx_creatives_batch_code ON creatives (batch_code);

CREATE TABLE IF NOT EXISTS claims_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id VARCHAR(50) UNIQUE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  claim_text TEXT NOT NULL,
  claim_type VARCHAR(30) NOT NULL CHECK (claim_type IN ('FEATURE', 'PRICE', 'OFFER_TERM', 'RESULT', 'SOCIAL_PROOF', 'TESTIMONIAL', 'SCARCITY', 'AUTHORITY')),
  source TEXT,
  evidence TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED' CHECK (status IN ('UNVERIFIED', 'VERIFIED', 'EXPIRED', 'REJECTED')),
  status_note TEXT,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creative_claims (
  creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES claims_registry(id) ON DELETE CASCADE,
  PRIMARY KEY (creative_id, claim_id)
);

CREATE TABLE IF NOT EXISTS creative_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
  content_hash VARCHAR(64) NOT NULL,
  decision VARCHAR(30) NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  reason_code VARCHAR(50),
  notes TEXT,
  reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creative_reviews_creative ON creative_reviews (creative_id);

CREATE TABLE IF NOT EXISTS creative_meta_ads (
  creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
  meta_ad_id VARCHAR(100) NOT NULL,
  link_method VARCHAR(20) NOT NULL DEFAULT 'MANUAL' CHECK (link_method IN ('MANUAL', 'API_PUBLISH')),
  linked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (creative_id, meta_ad_id)
);
