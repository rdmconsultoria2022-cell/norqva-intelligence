-- Migration 077 (NORQVA-0116, D-0116): geração a partir de uma referência.
-- Página de venda original (seções nossas seguindo só o esqueleto da referência) e anúncios na fábrica de criativos.
-- Os anúncios gerados ficam na tabela creatives (aprovação pelo fluxo da fábrica, creative_reviews), ligados à
-- referência e à página por colunas novas. copy_check guarda o resultado da checagem anticópia, números e promessas.
-- Exclusão pela tela marca deleted_at (nada é apagado). Só aditiva.

CREATE SEQUENCE IF NOT EXISTS seq_generated_pages_human_id START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS generated_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id VARCHAR(50) UNIQUE NOT NULL,
  reference_id UUID REFERENCES creative_references(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  slug VARCHAR(120) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'PUBLISHED', 'UNPUBLISHED')),
  sections JSONB NOT NULL,
  theme VARCHAR(20) NOT NULL DEFAULT 'light',
  copy_check JSONB,
  images_mode VARCHAR(20),
  generation_method VARCHAR(20),
  version INTEGER NOT NULL DEFAULT 0,
  data_provenance VARCHAR(50) NOT NULL DEFAULT 'COMMERCIAL_PRODUCTION',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  unpublished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_generated_pages_reference ON generated_pages (reference_id);
CREATE INDEX IF NOT EXISTS idx_generated_pages_status ON generated_pages (status);

ALTER TABLE creatives ADD COLUMN IF NOT EXISTS reference_id UUID REFERENCES creative_references(id) ON DELETE SET NULL;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS generated_page_id UUID REFERENCES generated_pages(id) ON DELETE SET NULL;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS ad_description TEXT;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS copy_check JSONB;

CREATE INDEX IF NOT EXISTS idx_creatives_generated_page ON creatives (generated_page_id);
