-- H6/H7/H8 (R-0019-01): teto real do experimento. Só aditiva.
-- spend_cap da campanha na Meta (H8), vigia do gasto com alertas 80/90/100 (H6) e pausa
-- preventiva só da campanha do plano ao atingir o teto (H7, autorizada pelo operador em 2026-10-07).
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS spend_cap_applied_brl NUMERIC(14,2);
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS spend_cap_status VARCHAR(20);
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS spend_cap_error TEXT;
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS spend_cap_applied_at TIMESTAMPTZ;
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS spent_brl_last NUMERIC(14,2);
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS spent_checked_at TIMESTAMPTZ;
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS guard_state VARCHAR(20);
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS guard_note TEXT;
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS capped_at TIMESTAMPTZ;
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS cap_alerts_sent JSONB DEFAULT '{}'::jsonb;
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS guard_read_failures INTEGER DEFAULT 0;
