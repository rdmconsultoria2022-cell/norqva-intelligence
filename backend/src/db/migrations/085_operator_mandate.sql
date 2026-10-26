-- NORQVA-0137 mandato de operação das campanhas (só aditiva)
-- o Claude opera as campanhas da Trattoria dentro de limites conferidos no servidor
-- operator_mandates guarda o mandato (capital, teto diário, prazo, freio) e a situação dele
-- operator_mandate_campaigns guarda as campanhas da Meta que o operador pode tocar
-- operator_mandate_actions registra cada ação (feita, recusada ou com falha) do operador, do freio e do administrador

CREATE TABLE IF NOT EXISTS operator_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL DEFAULT 'Mandato Trattoria',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BRAKED', 'ENDED')),
  capital_brl NUMERIC(14, 2) NOT NULL DEFAULT 1500,
  daily_cap_brl NUMERIC(14, 2) NOT NULL DEFAULT 100,
  days INTEGER NOT NULL DEFAULT 21,
  brake_spend_brl NUMERIC(14, 2) NOT NULL DEFAULT 750,
  brake_loss_brl NUMERIC(14, 2) NOT NULL DEFAULT 750,
  min_sales INTEGER NOT NULL DEFAULT 5,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  stopped_at TIMESTAMPTZ,
  stop_code VARCHAR(30),
  stop_reason TEXT,
  pause_pending BOOLEAN NOT NULL DEFAULT FALSE,
  last_check_at TIMESTAMPTZ,
  last_snapshot JSONB,
  last_check_error TEXT,
  read_failures INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  ended_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operator_mandates_status ON operator_mandates (status, created_at DESC);

CREATE TABLE IF NOT EXISTS operator_mandate_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandate_id UUID NOT NULL REFERENCES operator_mandates(id) ON DELETE CASCADE,
  meta_campaign_id VARCHAR(64) NOT NULL,
  name VARCHAR(255),
  offer_human_id VARCHAR(100),
  added_by UUID,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_operator_mandate_campaign UNIQUE (mandate_id, meta_campaign_id)
);

CREATE TABLE IF NOT EXISTS operator_mandate_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandate_id UUID REFERENCES operator_mandates(id) ON DELETE CASCADE,
  actor VARCHAR(20) NOT NULL,
  action VARCHAR(40) NOT NULL,
  entity_type VARCHAR(10),
  meta_id VARCHAR(64),
  meta_campaign_id VARCHAR(64),
  previous_value VARCHAR(40),
  requested_value VARCHAR(40),
  outcome VARCHAR(20) NOT NULL,
  message TEXT,
  change_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operator_mandate_actions_mandate ON operator_mandate_actions (mandate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operator_mandate_actions_meta ON operator_mandate_actions (meta_id, created_at DESC);
