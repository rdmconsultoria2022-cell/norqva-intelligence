-- NORQVA-0018 (fase A): marca por nicho e checklist de ativos Meta (D-0009). Somente aditiva.

CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  niche_id UUID REFERENCES market_niches(id) ON DELETE SET NULL,
  positioning TEXT,
  audience TEXT,
  tone TEXT,
  visual_identity JSONB NOT NULL DEFAULT '{}'::jsonb,
  spokesperson_type VARCHAR(30) NOT NULL DEFAULT 'BRAND_ONLY'
    CHECK (spokesperson_type IN ('BRAND_ONLY', 'REAL_CREATOR', 'ILLUSTRATED_CHARACTER')),
  real_person_consent_ref TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PROVISIONING', 'PILOT', 'CERTIFIED', 'PAUSED')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_brands_consent CHECK (
    (spokesperson_type = 'REAL_CREATOR' AND real_person_consent_ref IS NOT NULL)
    OR (spokesperson_type <> 'REAL_CREATOR' AND real_person_consent_ref IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS brand_meta_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  asset_type VARCHAR(20) NOT NULL
    CHECK (asset_type IN ('FACEBOOK_PAGE', 'INSTAGRAM', 'AD_ACCOUNT', 'PIXEL', 'WHATSAPP')),
  external_id VARCHAR(120),
  handle VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING_OPERATOR'
    CHECK (status IN ('PENDING_OPERATOR', 'PENDING_API', 'LINKED', 'VERIFIED', 'FAILED', 'NOT_NEEDED')),
  created_by VARCHAR(10) CHECK (created_by IN ('API', 'OPERATOR')),
  verified_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_brand_meta_assets UNIQUE (brand_id, asset_type)
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_brand ON products (brand_id);

-- Piloto: Trattoria em Casa. Página criada pelo operador em 2026-09-30 (ID lido no portfólio norqva).
INSERT INTO brands (code, name, niche_id, positioning, audience, tone, visual_identity, status)
SELECT 'TRATTORIA', 'Trattoria em Casa',
       (SELECT id FROM market_niches WHERE name = 'Culinária italiana'),
       'Cozinha de trattoria italiana para fazer em casa: massa fresca, molhos clássicos, medidas para o Brasil.',
       'Quem gosta de cozinhar em casa e quer pratos italianos de verdade.',
       'Acolhedor, simples, sem promessas de resultado.',
       '{"primary":"#A83E28","background":"#F5ECDD","ink":"#34221A","accent":"tricolor"}'::jsonb,
       'PILOT'
ON CONFLICT (code) DO NOTHING;

INSERT INTO brand_meta_assets (brand_id, asset_type, external_id, handle, status, created_by)
SELECT b.id, v.asset_type, v.external_id, v.handle, v.status, v.created_by
FROM brands b
CROSS JOIN (VALUES
  ('FACEBOOK_PAGE', '1287452237795325', 'Trattoria em Casa', 'LINKED', 'OPERATOR'),
  ('INSTAGRAM', NULL, 'trattoriaemcasa.oficial', 'PENDING_OPERATOR', 'OPERATOR'),
  ('PIXEL', NULL, NULL, 'PENDING_API', NULL),
  ('WHATSAPP', NULL, NULL, 'PENDING_OPERATOR', NULL),
  ('AD_ACCOUNT', NULL, NULL, 'NOT_NEEDED', NULL)
) AS v(asset_type, external_id, handle, status, created_by)
WHERE b.code = 'TRATTORIA'
ON CONFLICT (brand_id, asset_type) DO NOTHING;

UPDATE products SET brand_id = (SELECT id FROM brands WHERE code = 'TRATTORIA')
WHERE brand_id IS NULL
  AND id IN (SELECT product_id FROM offers WHERE human_id = 'OFF-000001' AND is_demo = FALSE);
