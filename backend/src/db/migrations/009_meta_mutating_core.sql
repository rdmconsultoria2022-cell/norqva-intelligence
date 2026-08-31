-- Migration 009: Meta Mutating Core (Phase B - Idempotency & Safety Guards)

ALTER TABLE meta_campaigns ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
ALTER TABLE meta_ad_sets ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
ALTER TABLE meta_ads ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_meta_campaigns_idempotency ON meta_campaigns(idempotency_key, is_demo);
CREATE INDEX IF NOT EXISTS idx_meta_ad_sets_idempotency ON meta_ad_sets(idempotency_key, is_demo);
CREATE INDEX IF NOT EXISTS idx_meta_ads_idempotency ON meta_ads(idempotency_key, is_demo);
