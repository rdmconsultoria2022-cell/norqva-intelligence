-- NORQVA-0017 (fase 3): time de IAs — oportunidade → avaliação → plano de campanha → lote na Fábrica.
-- Somente aditiva. As IAs nunca publicam, pausam ou mudam orçamento (D-0007, D-0008).

CREATE TABLE IF NOT EXISTS creative_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(60) NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  name TEXT,
  source VARCHAR(10) NOT NULL DEFAULT 'AI' CHECK (source IN ('CODE', 'AI')),
  opportunity_id UUID,
  payload JSONB NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_at TIMESTAMPTZ,
  CONSTRAINT uq_creative_batches_code UNIQUE (code, is_demo)
);

CREATE SEQUENCE IF NOT EXISTS seq_campaign_opportunities_human_id START 1;

CREATE TABLE IF NOT EXISTS campaign_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id VARCHAR(20) NOT NULL UNIQUE,
  title TEXT NOT NULL,
  source VARCHAR(12) NOT NULL CHECK (source IN ('ACCOUNT', 'EU_MARKET', 'MANUAL')),
  source_level VARCHAR(12),
  source_ref TEXT,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  market_niche_id UUID REFERENCES market_niches(id) ON DELETE SET NULL,
  brief TEXT,
  evidence JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'CAPTADA'
    CHECK (status IN ('CAPTADA', 'EM_AVALIACAO', 'AVALIADA', 'EM_PLANEJAMENTO', 'PLANO_PRONTO', 'APROVADA', 'DESCARTADA')),
  ai_score INTEGER,
  verdict VARCHAR(12) CHECK (verdict IN ('SEGUIR', 'TESTAR', 'DESCARTAR')),
  evaluation JSONB,
  second_opinion JSONB,
  plan JSONB,
  batch_code VARCHAR(60),
  task_kind VARCHAR(10) CHECK (task_kind IN ('EVALUATE', 'PLAN')),
  task_status VARCHAR(20) CHECK (task_status IN ('NOT_CONFIGURED', 'DISPATCHED', 'IN_PROGRESS', 'DONE', 'NEEDS_INPUT', 'FAILED')),
  task_response TEXT,
  session_url TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaign_opportunities_status ON campaign_opportunities (is_demo, status);
