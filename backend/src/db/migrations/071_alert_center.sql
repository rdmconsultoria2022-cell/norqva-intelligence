-- NORQVA-0095 central de pendências (só aditiva)
-- em tratamento e descartado por alerta, e quem leu cada alerta (o sino conta os não lidos de cada pessoa)

ALTER TABLE ad_alerts ADD COLUMN IF NOT EXISTS in_progress_at TIMESTAMPTZ;
ALTER TABLE ad_alerts ADD COLUMN IF NOT EXISTS in_progress_by UUID;
ALTER TABLE ad_alerts ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;
ALTER TABLE ad_alerts ADD COLUMN IF NOT EXISTS dismissed_by UUID;
ALTER TABLE ad_alerts ADD COLUMN IF NOT EXISTS dismiss_reason TEXT;

CREATE TABLE IF NOT EXISTS ad_alert_reads (
  alert_id UUID NOT NULL REFERENCES ad_alerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (alert_id, user_id)
);
