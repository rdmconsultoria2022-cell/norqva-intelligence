-- Migration 013: Data Provenance & Financial Integrity Hardening

-- Canonical Data Provenance Classes:
-- 'COMMERCIAL_PRODUCTION', 'STAGING_SANDBOX_QA', 'QA_FIXTURE', 'DEMO_SEED', 'LEGACY_MIGRATION', 'UNKNOWN'

-- 1. Add data_provenance column to all relevant financial, commercial and telemetry entities with safe default 'UNKNOWN'
ALTER TABLE orders ADD COLUMN IF NOT EXISTS data_provenance VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS data_provenance VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS data_provenance VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE products ADD COLUMN IF NOT EXISTS data_provenance VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE offers ADD COLUMN IF NOT EXISTS data_provenance VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS data_provenance VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE meta_ad_accounts ADD COLUMN IF NOT EXISTS data_provenance VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE meta_ad_sets ADD COLUMN IF NOT EXISTS data_provenance VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE meta_campaigns ADD COLUMN IF NOT EXISTS data_provenance VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE meta_insights ADD COLUMN IF NOT EXISTS data_provenance VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE meta_ads ADD COLUMN IF NOT EXISTS data_provenance VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE performance_entries ADD COLUMN IF NOT EXISTS data_provenance VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN';

-- 2. Legacy records where is_demo = true are classified as 'DEMO_SEED'
UPDATE products SET data_provenance = 'DEMO_SEED' WHERE is_demo = TRUE AND data_provenance = 'UNKNOWN';
UPDATE offers SET data_provenance = 'DEMO_SEED' WHERE is_demo = TRUE AND data_provenance = 'UNKNOWN';
UPDATE experiments SET data_provenance = 'DEMO_SEED' WHERE is_demo = TRUE AND data_provenance = 'UNKNOWN';
UPDATE performance_entries SET data_provenance = 'DEMO_SEED' WHERE is_demo = TRUE AND data_provenance = 'UNKNOWN';
UPDATE meta_campaigns SET data_provenance = 'DEMO_SEED' WHERE is_demo = TRUE AND data_provenance = 'UNKNOWN';
UPDATE meta_insights SET data_provenance = 'DEMO_SEED' WHERE is_demo = TRUE AND data_provenance = 'UNKNOWN';
UPDATE meta_ads SET data_provenance = 'DEMO_SEED' WHERE is_demo = TRUE AND data_provenance = 'UNKNOWN';
UPDATE orders SET data_provenance = 'DEMO_SEED' WHERE is_demo = TRUE AND data_provenance = 'UNKNOWN';
UPDATE payments SET data_provenance = 'DEMO_SEED' WHERE is_demo = TRUE AND data_provenance = 'UNKNOWN';

-- 3. Staging Sandbox E2E operational orders/payments are classified as 'STAGING_SANDBOX_QA'
-- Existing historical non-demo runtime orders/payments executed during staging verification gates
UPDATE orders SET data_provenance = 'STAGING_SANDBOX_QA' WHERE is_demo = FALSE AND data_provenance = 'UNKNOWN';
UPDATE order_items SET data_provenance = 'STAGING_SANDBOX_QA' WHERE data_provenance = 'UNKNOWN';
UPDATE payments SET data_provenance = 'STAGING_SANDBOX_QA' WHERE is_demo = FALSE AND data_provenance = 'UNKNOWN';

-- 4. Non-demo legacy catalog & marketing entities become 'LEGACY_MIGRATION'
UPDATE products SET data_provenance = 'LEGACY_MIGRATION' WHERE is_demo = FALSE AND data_provenance = 'UNKNOWN';
UPDATE offers SET data_provenance = 'LEGACY_MIGRATION' WHERE is_demo = FALSE AND data_provenance = 'UNKNOWN';
UPDATE experiments SET data_provenance = 'LEGACY_MIGRATION' WHERE is_demo = FALSE AND data_provenance = 'UNKNOWN';
UPDATE meta_ad_accounts SET data_provenance = 'LEGACY_MIGRATION' WHERE data_provenance = 'UNKNOWN';
UPDATE meta_campaigns SET data_provenance = 'LEGACY_MIGRATION' WHERE is_demo = FALSE AND data_provenance = 'UNKNOWN';
UPDATE meta_insights SET data_provenance = 'LEGACY_MIGRATION' WHERE is_demo = FALSE AND data_provenance = 'UNKNOWN';
UPDATE meta_ads SET data_provenance = 'LEGACY_MIGRATION' WHERE is_demo = FALSE AND data_provenance = 'UNKNOWN';

-- 5. Performance and query indexes
CREATE INDEX IF NOT EXISTS idx_orders_provenance ON orders(data_provenance, status, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_provenance ON payments(data_provenance, status, created_at);
CREATE INDEX IF NOT EXISTS idx_meta_insights_provenance ON meta_insights(data_provenance, entity_level, date_start);

-- 6. Relax provider_fee constraint (fees can be NULL/unknown before payment gateway confirmation)
ALTER TABLE payments ALTER COLUMN provider_fee DROP NOT NULL;
ALTER TABLE payments ALTER COLUMN provider_fee DROP DEFAULT;
