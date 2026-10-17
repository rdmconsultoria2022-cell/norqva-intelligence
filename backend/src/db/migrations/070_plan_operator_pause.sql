-- NORQVA-0094 plano pausado pelo operador (só aditiva)
-- reativar a campanha de um plano pausado pela tela pede o código do plano (vale como novo Sim)

ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS operator_paused_at TIMESTAMPTZ;
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS operator_paused_by UUID;
