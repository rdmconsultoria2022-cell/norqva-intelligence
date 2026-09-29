-- NORQVA-0017 (fase 2): mercado europeu pela API oficial da Biblioteca de Anúncios (ads_archive).
-- A Meta só entrega anúncios comerciais de terceiros veiculados na UE (DSA). Somente aditiva.

CREATE TABLE IF NOT EXISTS market_niches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL UNIQUE,
  search_terms TEXT[] NOT NULL DEFAULT '{}',
  countries TEXT[] NOT NULL DEFAULT ARRAY['DE','FR','ES','IT','PT','NL','PL','IE'],
  product_category VARCHAR(100),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_eu_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_library_id VARCHAR(64) NOT NULL,
  niche_id UUID NOT NULL REFERENCES market_niches(id) ON DELETE CASCADE,
  search_term TEXT,
  page_id VARCHAR(64),
  page_name TEXT,
  start_date DATE,
  stop_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  eu_total_reach BIGINT,
  languages TEXT[] NOT NULL DEFAULT '{}',
  platforms TEXT[] NOT NULL DEFAULT '{}',
  countries TEXT[] NOT NULL DEFAULT '{}',
  body TEXT,
  title TEXT,
  link_caption TEXT,
  link_description TEXT,
  snapshot_url TEXT,
  target_ages TEXT,
  target_gender TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_market_eu_ads UNIQUE (ad_library_id, niche_id)
);
CREATE INDEX IF NOT EXISTS idx_market_eu_ads_niche ON market_eu_ads (niche_id, is_active);

-- Alcance por dia, para medir crescimento
CREATE TABLE IF NOT EXISTS market_eu_ad_snapshots (
  ad_row_id UUID NOT NULL REFERENCES market_eu_ads(id) ON DELETE CASCADE,
  observed_date DATE NOT NULL,
  eu_total_reach BIGINT,
  is_active BOOLEAN NOT NULL,
  PRIMARY KEY (ad_row_id, observed_date)
);

CREATE TABLE IF NOT EXISTS market_eu_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  status VARCHAR(20) NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'DONE', 'FAILED', 'BLOCKED')),
  niches INTEGER NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0,
  ads_upserted INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- Nichos iniciais, ligados às categorias dos nossos produtos (Bolso Blindado e Trattoria)
INSERT INTO market_niches (name, search_terms, product_category, notes) VALUES
  ('Finanças pessoais', ARRAY['budget planner', 'haushaltsbuch', 'finanzas personales', 'budget app', 'gestion budget'], 'Finanças', 'Referência para o Método Bolso Blindado'),
  ('Culinária italiana', ARRAY['pasta recipes', 'ricette pasta', 'recetas pasta', 'italian cookbook', 'pasta fresca'], 'Culinária', 'Referência para a Trattoria')
ON CONFLICT (name) DO NOTHING;
