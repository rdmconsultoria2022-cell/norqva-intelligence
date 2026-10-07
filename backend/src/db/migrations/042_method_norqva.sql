-- NORQVA-0022: Método NORQVA de Campanhas V1. Só aditiva, sem trocar CHECKs existentes.
-- Caso (00_GESTAO) por produto e oferta, notas por etapa, matriz de hipóteses dos criativos,
-- decisão por criativo (com motivo e evidência) e biblioteca de aprendizado ligada à evidência.
-- Nada aqui age na Meta.

CREATE SEQUENCE IF NOT EXISTS seq_method_cases_human_id START 1;
CREATE SEQUENCE IF NOT EXISTS seq_creative_hypotheses_human_id START 1;
CREATE SEQUENCE IF NOT EXISTS seq_learnings_human_id START 1;

CREATE TABLE IF NOT EXISTS method_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id VARCHAR(20) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  central_proposition TEXT,
  proposition_status VARCHAR(20) NOT NULL DEFAULT 'HIPOTESE' CHECK (proposition_status IN ('HIPOTESE', 'NAO_VALIDADO', 'VALIDADO', 'REJEITADO')),
  audience_summary TEXT,
  problem_desire TEXT,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_method_cases_offer ON method_cases (offer_id, is_demo);

CREATE TABLE IF NOT EXISTS method_stage_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES method_cases(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 10),
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  evidence_refs JSONB,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (case_id, stage)
);

CREATE TABLE IF NOT EXISTS creative_hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id VARCHAR(20) NOT NULL UNIQUE,
  case_id UUID REFERENCES method_cases(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  campaign_ref VARCHAR(200),
  angle VARCHAR(200),
  hook TEXT,
  statement TEXT NOT NULL,
  variable_tested VARCHAR(20) NOT NULL CHECK (variable_tested IN ('GANCHO', 'ANGULO', 'FORMATO', 'OFERTA', 'PUBLICO', 'COPY', 'VISUAL')),
  format VARCHAR(20),
  version INTEGER NOT NULL DEFAULT 1,
  audience TEXT,
  test_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'PROPOSTA' CHECK (status IN ('PROPOSTA', 'TESTANDO', 'PROMISSORA', 'VALIDADA', 'REJEITADA', 'NAO_VALIDADA')),
  notes TEXT,
  derived_from_learning_id UUID,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creative_hypotheses_case ON creative_hypotheses (case_id, is_demo);

-- Vínculo criativo → hipótese (validado na aplicação). Nulo nos criativos antigos: sem hipótese o criativo não fica PRONTO.
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS hypothesis_id UUID;

CREATE TABLE IF NOT EXISTS creative_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
  hypothesis_id UUID REFERENCES creative_hypotheses(id) ON DELETE SET NULL,
  decision VARCHAR(10) NOT NULL CHECK (decision IN ('MATAR', 'MANTER', 'ITERAR', 'ESCALAR')),
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL,
  data_level VARCHAR(30) NOT NULL CHECK (data_level IN ('SEM_DADOS', 'DADOS_INSUFICIENTES', 'DADOS_CONFIAVEIS')),
  confidence VARCHAR(10) NOT NULL CHECK (confidence IN ('BAIXA', 'MEDIA', 'ALTA')),
  responsible_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creative_decisions_creative ON creative_decisions (creative_id, decided_at DESC);

CREATE TABLE IF NOT EXISTS learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id VARCHAR(20) NOT NULL UNIQUE,
  case_id UUID REFERENCES method_cases(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('GANCHO', 'ANGULO', 'OFERTA', 'FORMATO', 'OBJECAO', 'PADRAO_VISUAL', 'PUBLICO', 'FALHA', 'HIPOTESE')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('VENCEDOR', 'PROMISSORA', 'VALIDADA', 'REJEITADA')),
  statement TEXT NOT NULL,
  source_decision_id UUID NOT NULL REFERENCES creative_decisions(id) ON DELETE RESTRICT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_learnings_case ON learnings (case_id, is_demo);
