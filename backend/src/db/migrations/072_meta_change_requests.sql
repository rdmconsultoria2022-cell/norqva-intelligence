-- NORQVA-0097 fichas de alteração na Meta (só aditiva)
-- pausar, reativar e orçamento ganham situação e só ficam confirmadas depois de reler a Meta
-- o id vem de quem pede: o mesmo pedido repetido não é enviado de novo

CREATE TABLE IF NOT EXISTS meta_change_requests (
  id UUID PRIMARY KEY,
  plan_id UUID,
  plan_code VARCHAR(60),
  entity_type VARCHAR(10) NOT NULL CHECK (entity_type IN ('CAMPAIGN', 'ADSET', 'AD')),
  meta_id VARCHAR(64) NOT NULL,
  entity_name VARCHAR(255),
  meta_campaign_id VARCHAR(64),
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('STATUS', 'DAILY_BUDGET')),
  previous_value VARCHAR(40),
  requested_value VARCHAR(40) NOT NULL,
  state VARCHAR(30) NOT NULL CHECK (state IN ('AWAITING_APPROVAL', 'SENDING', 'CONFIRMED', 'FAILED', 'UNCONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED')),
  requested_by UUID,
  requested_by_name VARCHAR(255),
  requested_by_role VARCHAR(30),
  approved_by UUID,
  approved_by_name VARCHAR(255),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  meta_value VARCHAR(40),
  error TEXT,
  scope_campaign VARCHAR(64),
  expires_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_change_requests_state ON meta_change_requests (state, is_demo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_change_requests_plan ON meta_change_requests (plan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_change_requests_campaign ON meta_change_requests (meta_campaign_id, created_at DESC);
