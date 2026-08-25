-- 1. Modify opportunities status constraints
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_status_check;
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_status_check1;
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_constraint_1;
ALTER TABLE opportunities ADD CONSTRAINT chk_opportunities_status CHECK (
  status IN (
    'DESCOBERTA', 'EM_COLETA', 'EM_ANALISE', 'ANALISADA', 
    'AGUARDANDO_REVISAO', 'AGUARDANDO_DECISAO', 'APROVADA_PARA_TESTE', 
    'REJEITADA', 'ARQUIVADA'
  )
);

-- 2. Expand opportunities table
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS product_format VARCHAR(100);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS observed_promise TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS observed_price NUMERIC(14,2);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS market VARCHAR(100);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS language VARCHAR(50);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS country VARCHAR(50);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS research_notes TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS production_complexity_estimate VARCHAR(100);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS differentiation_notes TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS possible_upsells TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS possible_cross_sells TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS risk_notes TEXT;

-- 3. Expand evidences table with type & classification, provenance, and source diversity keys
ALTER TABLE evidences ADD COLUMN IF NOT EXISTS classification VARCHAR(50);
ALTER TABLE evidences DROP CONSTRAINT IF EXISTS chk_evidences_classification;
ALTER TABLE evidences ADD CONSTRAINT chk_evidences_classification CHECK (
  classification IS NULL OR classification IN ('FACT', 'INFERENCE', 'HYPOTHESIS', 'INSUFFICIENT_DATA')
);
ALTER TABLE evidences ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE evidences ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE evidences ADD COLUMN IF NOT EXISTS captured_value VARCHAR(255);
ALTER TABLE evidences ADD COLUMN IF NOT EXISTS captured_text TEXT;
ALTER TABLE evidences ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE evidences ADD COLUMN IF NOT EXISTS source_domain VARCHAR(255);
ALTER TABLE evidences ADD COLUMN IF NOT EXISTS source_group VARCHAR(100);
ALTER TABLE evidences ADD COLUMN IF NOT EXISTS provenance VARCHAR(50) DEFAULT 'EXTERNAL_SOURCE';
UPDATE evidences SET provenance = 'EXTERNAL_SOURCE' WHERE provenance IS NULL;
ALTER TABLE evidences ALTER COLUMN provenance SET NOT NULL;
ALTER TABLE evidences DROP CONSTRAINT IF EXISTS chk_evidences_provenance;
ALTER TABLE evidences ADD CONSTRAINT chk_evidences_provenance CHECK (
  provenance IN ('EXTERNAL_SOURCE', 'MANUAL_OBSERVATION', 'IMPORTED_DATA', 'AI_EXTRACTED_FROM_SOURCE', 'AI_INFERENCE')
);

-- 4. Create research_sessions table
CREATE TABLE IF NOT EXISTS research_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id VARCHAR(50) UNIQUE NOT NULL,
  objective TEXT NOT NULL,
  query TEXT,
  category VARCHAR(100),
  market VARCHAR(100),
  started_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status VARCHAR(50) NOT NULL CHECK (status IN ('PLANNED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')) DEFAULT 'PLANNED',
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

-- 5. Create research_tasks table
CREATE TABLE IF NOT EXISTS research_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task TEXT NOT NULL,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  priority VARCHAR(50) NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')) DEFAULT 'MEDIUM',
  status VARCHAR(50) NOT NULL CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')) DEFAULT 'OPEN',
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

-- 6. Create score_models table (persistent and versioned)
CREATE TABLE IF NOT EXISTS score_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  version INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'INACTIVE')) DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  formula_config JSONB NOT NULL,
  max_total_critical_penalty NUMERIC(5,2) NOT NULL DEFAULT 25.00,
  CONSTRAINT uq_score_model_version UNIQUE (name, version)
);

-- 7. Create score_model_components table
CREATE TABLE IF NOT EXISTS score_model_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  score_model_id UUID NOT NULL REFERENCES score_models(id) ON DELETE RESTRICT,
  component_key VARCHAR(100) NOT NULL,
  name VARCHAR(100) NOT NULL,
  weight NUMERIC(5,2) NOT NULL CHECK (weight >= 0),
  min_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  max_score NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  calculation_rule JSONB NOT NULL,
  max_penalty_per_component NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  display_order INTEGER NOT NULL,
  CONSTRAINT uq_score_model_component UNIQUE (score_model_id, component_key)
);

-- 8. Create prompts table (persistent and versioned)
CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  version VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_prompt_name_version UNIQUE (name, version)
);

-- 9. Create ai_executions table (ON DELETE RESTRICT to protect audit logs)
CREATE TABLE IF NOT EXISTS ai_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE RESTRICT,
  research_session_id UUID REFERENCES research_sessions(id) ON DELETE SET NULL,
  provider VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  prompt_id UUID REFERENCES prompts(id) ON DELETE RESTRICT,
  prompt_version VARCHAR(100),
  execution_id UUID UNIQUE NOT NULL,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  latency INTEGER,
  status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL', 'LIMIT_REACHED')),
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost NUMERIC(14,4),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

-- 10. Create ai_analyses table (with immutable versioning, ON DELETE RESTRICT)
CREATE TABLE IF NOT EXISTS ai_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE RESTRICT,
  ai_execution_id UUID NOT NULL REFERENCES ai_executions(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL,
  executive_summary TEXT NOT NULL,
  market_signal TEXT NOT NULL,
  target_audience_analysis JSONB NOT NULL,
  problem_analysis JSONB NOT NULL,
  offer_analysis JSONB NOT NULL,
  price_analysis JSONB NOT NULL,
  competition_analysis JSONB NOT NULL,
  differentiation_analysis JSONB NOT NULL,
  production_analysis JSONB NOT NULL,
  creative_potential JSONB NOT NULL,
  upsell_potential JSONB NOT NULL,
  risks JSONB NOT NULL,
  missing_information JSONB NOT NULL,
  recommended_next_steps JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_opportunity_version UNIQUE (opportunity_id, version)
);

-- 11. Create opportunity_scores table (ON DELETE RESTRICT)
CREATE TABLE IF NOT EXISTS opportunity_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE RESTRICT,
  ai_analysis_id UUID REFERENCES ai_analyses(id) ON DELETE RESTRICT,
  score_model_id UUID NOT NULL REFERENCES score_models(id) ON DELETE RESTRICT,
  initial_product_score NUMERIC(5,2) NOT NULL,
  critical_adjustment NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  final_product_score NUMERIC(5,2) NOT NULL,
  confidence_score NUMERIC(5,2) NOT NULL,
  is_human_override BOOLEAN NOT NULL DEFAULT FALSE,
  human_override_score NUMERIC(5,2),
  override_responsible_id UUID REFERENCES users(id) ON DELETE SET NULL,
  override_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

-- 12. Create score_components table
CREATE TABLE IF NOT EXISTS score_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_score_id UUID NOT NULL REFERENCES opportunity_scores(id) ON DELETE CASCADE,
  component_key VARCHAR(100) NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  weight NUMERIC(5,2) NOT NULL,
  weighted_score NUMERIC(5,2) NOT NULL,
  confidence VARCHAR(50) NOT NULL,
  evidence_count INTEGER NOT NULL,
  reasoning_summary TEXT NOT NULL
);

-- 13. Create score_component_evidences table (Traceability)
CREATE TABLE IF NOT EXISTS score_component_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  score_component_id UUID NOT NULL REFERENCES score_components(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES evidences(id) ON DELETE RESTRICT,
  relevance VARCHAR(50) NOT NULL CHECK (relevance IN ('HIGH', 'MEDIUM', 'LOW')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Create opportunity_risks table (ON DELETE RESTRICT)
CREATE TABLE IF NOT EXISTS opportunity_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE RESTRICT,
  risk_type VARCHAR(50) NOT NULL CHECK (
    risk_type IN (
      'MARKET', 'COMPETITION', 'LEGAL', 'COPYRIGHT', 
      'PLATFORM_POLICY', 'PRODUCTION', 'FINANCIAL', 
      'OPERATIONAL', 'REPUTATIONAL', 'DATA_QUALITY', 'OTHER'
    )
  ),
  description TEXT NOT NULL,
  severity VARCHAR(50) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  probability VARCHAR(50) NOT NULL CHECK (probability IN ('LOW', 'MEDIUM', 'HIGH')),
  evidence_id UUID REFERENCES evidences(id) ON DELETE SET NULL,
  mitigation TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

-- 15. Create opportunity_reviews table (ON DELETE RESTRICT)
CREATE TABLE IF NOT EXISTS opportunity_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action VARCHAR(50) NOT NULL CHECK (action IN ('ACCEPT_ANALYSIS', 'REQUEST_MORE_RESEARCH', 'REJECT_ANALYSIS')),
  rejection_reason VARCHAR(100) CHECK (
    rejection_reason IS NULL OR rejection_reason IN (
      'LOW_DEMAND_SIGNAL', 'LOW_CONFIDENCE', 'SATURATED', 
      'POOR_ECONOMICS', 'HIGH_IP_RISK', 'HIGH_PRODUCTION_COMPLEXITY', 
      'WEAK_DIFFERENTIATION', 'PLATFORM_RISK', 'OTHER'
    )
  ),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

-- 16. Create decision_snapshots table (Immutability log for Audit trails, ON DELETE RESTRICT)
CREATE TABLE IF NOT EXISTS decision_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE RESTRICT,
  analysis_id UUID REFERENCES ai_analyses(id) ON DELETE RESTRICT,
  initial_product_score NUMERIC(5,2) NOT NULL,
  critical_adjustment NUMERIC(5,2) NOT NULL,
  final_product_score NUMERIC(5,2) NOT NULL,
  confidence_score NUMERIC(5,2) NOT NULL,
  score_model_id UUID REFERENCES score_models(id) ON DELETE RESTRICT,
  component_scores JSONB,
  evidence_ids UUID[] NOT NULL,
  risk_ids UUID[] NOT NULL,
  prompt_versions JSONB NOT NULL,
  decision VARCHAR(50) NOT NULL,
  responsible_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  justification TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);
