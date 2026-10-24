-- NORQVA-0122 pausa noturna das campanhas criadas fora do NORQVA (só aditiva)
-- night_pause_external_campaigns guarda a configuração (ligada, início e fim) por campanha da Meta que não é de um plano
-- night_pause_external_runs guarda uma linha por campanha e por noite, com as mesmas colunas de night_pause_runs
-- plan_code na tabela de noites guarda o rótulo usado nos textos (nome da campanha)
-- mirror_checked_at e mirror_error registram a cópia mínima da campanha em meta_campaigns (para pausar sem esperar a sincronização)
-- as duas campanhas ativas no dia do contrato entram ligadas (dados novos de uma tabela nova)

CREATE TABLE IF NOT EXISTS night_pause_external_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_campaign_id VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  night_pause_start VARCHAR(5) NOT NULL DEFAULT '00:00',
  night_pause_end VARCHAR(5) NOT NULL DEFAULT '06:00',
  created_by UUID,
  mirror_checked_at TIMESTAMPTZ,
  mirror_error TEXT,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS night_pause_external_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id UUID NOT NULL REFERENCES night_pause_external_campaigns(id) ON DELETE CASCADE,
  plan_code VARCHAR(255),
  meta_campaign_id VARCHAR(64) NOT NULL,
  night_date DATE NOT NULL,
  window_start VARCHAR(5) NOT NULL,
  window_end VARCHAR(5) NOT NULL,
  state VARCHAR(30) NOT NULL CHECK (state IN ('SKIPPED', 'PAUSING', 'PAUSE_UNCONFIRMED', 'PAUSED', 'PAUSE_FAILED', 'REACTIVATING', 'RESUME_UNCONFIRMED', 'REACTIVATED', 'RESUME_FAILED', 'CANCELLED', 'EXPIRED')),
  previous_status VARCHAR(30),
  meta_daily_budget_at_pause NUMERIC(14, 2),
  meta_updated_time_at_pause VARCHAR(40),
  meta_updated_time_at_resume VARCHAR(40),
  activity_check VARCHAR(30),
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
  resume_attempts INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_night_pause_external_campaign_date UNIQUE (meta_campaign_id, night_date)
);

CREATE INDEX IF NOT EXISTS idx_night_pause_external_runs_state ON night_pause_external_runs (state, night_date);
CREATE INDEX IF NOT EXISTS idx_night_pause_external_runs_ext ON night_pause_external_runs (external_id, night_date DESC);

INSERT INTO night_pause_external_campaigns (meta_campaign_id, name, enabled)
VALUES ('120250112900200097', 'NQ – Kit 5 livros – Teste – Vendas', TRUE),
       ('120250081197880097', 'NQ – Seca Barriga – Teste – Vendas', TRUE)
ON CONFLICT (meta_campaign_id) DO NOTHING;
