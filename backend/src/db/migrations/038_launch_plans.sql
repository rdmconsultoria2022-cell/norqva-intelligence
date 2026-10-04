-- NORQVA-0019: campanhas preparadas pelo Claude (tudo PAUSADO na Meta) e ativadas só pela resposta
-- "Sim" do operador (D-0010). Somente aditiva.

CREATE TABLE IF NOT EXISTS launch_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL UNIQUE,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  offer_human_id VARCHAR(50),
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'CREATING', 'CREATED_PAUSED', 'AWAITING_OPERATOR', 'APPROVED', 'ACTIVE', 'REJECTED', 'FAILED')),
  spec JSONB NOT NULL,
  meta_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  daily_budget_brl NUMERIC(14,2) NOT NULL CHECK (daily_budget_brl > 0),
  max_spend_brl NUMERIC(14,2) NOT NULL CHECK (max_spend_brl > 0),
  question_text TEXT NOT NULL,
  decision_id UUID REFERENCES decisions(id) ON DELETE SET NULL,
  experiment_id UUID REFERENCES experiments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  answer VARCHAR(3) CHECK (answer IN ('YES', 'NO')),
  answered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  answered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_launch_plans_status ON launch_plans (status);
