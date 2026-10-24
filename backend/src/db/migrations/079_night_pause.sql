-- NORQVA-0118 pausa noturna (só aditiva)
-- cada plano ganha a pausa noturna ligada por padrão, das 00:00 às 06:00 no horário de Brasília
-- night_pause_runs guarda uma linha por campanha e por noite: o NORQVA só reativa o que ele mesmo pausou
-- a chave única (campanha, data) impede pausar ou reativar duas vezes, mesmo com reinício ou duas instâncias
-- meta_change_requests ganha a origem da ficha (NIGHT_PAUSE nas fichas da pausa noturna)

ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS night_pause_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS night_pause_start VARCHAR(5) NOT NULL DEFAULT '00:00';
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS night_pause_end VARCHAR(5) NOT NULL DEFAULT '06:00';

ALTER TABLE meta_change_requests ADD COLUMN IF NOT EXISTS origin VARCHAR(30);

CREATE TABLE IF NOT EXISTS night_pause_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES launch_plans(id) ON DELETE CASCADE,
  plan_code VARCHAR(60),
  meta_campaign_id VARCHAR(64) NOT NULL,
  night_date DATE NOT NULL,
  window_start VARCHAR(5) NOT NULL,
  window_end VARCHAR(5) NOT NULL,
  state VARCHAR(30) NOT NULL CHECK (state IN ('SKIPPED', 'PAUSING', 'PAUSE_UNCONFIRMED', 'PAUSED', 'PAUSE_FAILED', 'REACTIVATING', 'RESUME_UNCONFIRMED', 'REACTIVATED', 'RESUME_FAILED', 'CANCELLED', 'EXPIRED')),
  previous_status VARCHAR(30),
  meta_daily_budget_at_pause NUMERIC(14, 2),
  meta_updated_time_at_pause VARCHAR(40),
  plan_daily_budget_at_pause NUMERIC(14, 2),
  plan_cap_at_pause NUMERIC(14, 2),
  pause_change_id UUID,
  resume_change_id UUID,
  pause_started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  quiet_since TIMESTAMPTZ,
  resume_started_at TIMESTAMPTZ,
  resumed_at TIMESTAMPTZ,
  read_failures INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_night_pause_campaign_date UNIQUE (meta_campaign_id, night_date)
);

CREATE INDEX IF NOT EXISTS idx_night_pause_runs_state ON night_pause_runs (state, night_date);
CREATE INDEX IF NOT EXISTS idx_night_pause_runs_plan ON night_pause_runs (plan_id, night_date DESC);
