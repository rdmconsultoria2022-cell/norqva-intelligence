-- Create tables for NORQVA Intelligence Core

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'INTELLIGENCE', 'PRODUCT', 'CREATIVE', 'PERFORMANCE', 'OPERATIONS')),
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  subcategory VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  problem_desire TEXT NOT NULL,
  format VARCHAR(100) NOT NULL,
  source VARCHAR(255) NOT NULL,
  reference_url TEXT,
  notes TEXT,
  responsible_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('DESCOBERTA', 'EM_ANALISE', 'AGUARDANDO_DECISAO', 'APROVADA', 'REJEITADA', 'ARQUIVADA')) DEFAULT 'DESCOBERTA',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('FATO', 'INFERENCIA', 'HIPOTESE', 'DADO_INSUFICIENTE')),
  source VARCHAR(255) NOT NULL,
  url TEXT,
  description TEXT NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responsible_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reliability VARCHAR(100) NOT NULL,
  observations TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  responsible_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('PLANEJADO', 'EM_DESENVOLVIMENTO', 'REVISAO', 'PRONTO', 'ATIVO', 'PAUSADO', 'ARQUIVADO')) DEFAULT 'PLANEJADO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  estimated_cost NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (estimated_cost >= 0),
  observations TEXT,
  origin_provenance VARCHAR(100) CHECK (origin_provenance IS NULL OR origin_provenance IN ('ORIGINAL', 'LICENCIADO', 'PRODUZIDO_SOB_ENCOMENDA')),
  origin_responsible_id UUID REFERENCES users(id) ON DELETE SET NULL,
  origin_evidence TEXT,
  origin_notes TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT chk_provenance CHECK ((status <> 'PRONTO' AND status <> 'ATIVO') OR (origin_provenance IS NOT NULL AND origin_responsible_id IS NOT NULL AND origin_evidence IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id VARCHAR(50) UNIQUE NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  price NUMERIC(14,2) NOT NULL CHECK (price >= 0),
  promotional_price NUMERIC(14,2) CHECK (promotional_price IS NULL OR promotional_price >= 0),
  bonus TEXT,
  description TEXT NOT NULL,
  upsell TEXT,
  cross_sell TEXT,
  status VARCHAR(50) NOT NULL CHECK (status IN ('RASCUNHO', 'TESTE', 'ATIVA', 'PAUSADA', 'ARQUIVADA')) DEFAULT 'RASCUNHO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id VARCHAR(50) UNIQUE NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  hook TEXT NOT NULL,
  concept TEXT NOT NULL,
  copy TEXT NOT NULL,
  cta VARCHAR(100) NOT NULL,
  format VARCHAR(50) NOT NULL CHECK (format IN ('VIDEO', 'IMAGE', 'CAROUSEL')),
  file_url TEXT NOT NULL,
  responsible_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('IDEIA', 'PRODUCAO', 'REVISAO', 'PRONTO', 'TESTANDO', 'ATIVO', 'PAUSADO', 'ARQUIVADO')) DEFAULT 'IDEIA',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  hypothesis TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  responsible_id UUID REFERENCES users(id) ON DELETE SET NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  status VARCHAR(50) NOT NULL CHECK (status IN ('PLANEJADO', 'AUTORIZADO', 'ATIVO', 'PAUSADO', 'CONCLUIDO', 'CANCELADO')) DEFAULT 'PLANEJADO',
  capital_requested NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (capital_requested >= 0),
  capital_approved NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (capital_approved >= 0),
  capital_used NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (capital_used >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT chk_capital_limit CHECK (capital_used <= capital_approved)
);

CREATE TABLE IF NOT EXISTS experiment_creatives (
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
  PRIMARY KEY (experiment_id, creative_id)
);

CREATE TABLE IF NOT EXISTS capital_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  previous_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  new_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  justification TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id VARCHAR(50) UNIQUE NOT NULL,
  related_entity_id UUID NOT NULL,
  related_entity_type VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('APROVAR_PRODUTO', 'REJEITAR_PRODUTO', 'APROVAR_CAPITAL', 'AUMENTAR_CAPITAL', 'PAUSAR_EXPERIMENTO', 'ENCERRAR_EXPERIMENTO')),
  decision_text TEXT NOT NULL,
  responsible_id UUID REFERENCES users(id) ON DELETE SET NULL,
  justification TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  available_data TEXT,
  future_result TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);
