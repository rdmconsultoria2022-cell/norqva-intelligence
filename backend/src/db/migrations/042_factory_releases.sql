-- Migration 042 — NORQVA-0020: ponte Creative Factory → NORQVA. Somente aditiva.
-- Cada release certificado da Factory vira um criativo DRAFT na Fábrica do NORQVA.
-- A certificação da Factory viaja como evidência, e a aprovação operacional continua no NORQVA (D-0011).

ALTER TABLE creative_batches DROP CONSTRAINT IF EXISTS creative_batches_source_check;
ALTER TABLE creative_batches DROP CONSTRAINT IF EXISTS chk_creative_batches_source;
ALTER TABLE creative_batches ADD CONSTRAINT chk_creative_batches_source CHECK (source IN ('CODE', 'AI', 'FACTORY'));

CREATE TABLE IF NOT EXISTS factory_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id VARCHAR(40) NOT NULL,
  creative_version VARCHAR(12) NOT NULL,
  creative_id UUID REFERENCES creatives(id) ON DELETE SET NULL,
  batch_code VARCHAR(50) NOT NULL,
  factory_version VARCHAR(30),
  sha256 VARCHAR(64) NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_bucket VARCHAR(63) NOT NULL,
  storage_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  media JSONB,
  qa_certifications JSONB NOT NULL,
  lineage JSONB,
  manifest JSONB NOT NULL,
  approval_timestamp TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_factory_releases_key UNIQUE (campaign_id, creative_version, is_demo)
);
CREATE INDEX IF NOT EXISTS idx_factory_releases_creative ON factory_releases (creative_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_factory_releases_sha ON factory_releases (sha256, is_demo);
CREATE UNIQUE INDEX IF NOT EXISTS uq_factory_releases_path ON factory_releases (storage_path, is_demo);
