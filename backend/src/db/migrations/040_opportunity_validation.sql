-- NORQVA-0021 (P2): portão do validador (Claude em modo crítico) no Time de IAs.
-- Só aditiva. O veredito é validado na aplicação (APROVA | REPROVA | PEDE_EVIDENCIA).
-- A derrubada do veto pelo operador fica também em decision_events (OPPORTUNITY_VALIDATION_OVERRIDE).

ALTER TABLE campaign_opportunities ADD COLUMN IF NOT EXISTS validation JSONB;
ALTER TABLE campaign_opportunities ADD COLUMN IF NOT EXISTS validation_verdict VARCHAR(20);
ALTER TABLE campaign_opportunities ADD COLUMN IF NOT EXISTS validation_override JSONB;
-- Etapa da última tarefa enviada ao Claude (EVALUATE | VALIDATE | PLAN). task_kind (CHECK EVALUATE/PLAN)
-- continua preenchido para EVALUATE e PLAN; para VALIDATE fica nulo e vale task_stage.
ALTER TABLE campaign_opportunities ADD COLUMN IF NOT EXISTS task_stage VARCHAR(12);
