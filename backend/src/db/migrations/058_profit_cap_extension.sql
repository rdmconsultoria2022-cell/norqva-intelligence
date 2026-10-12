-- Migration 058 (NORQVA-0052): teto editável e campanha lucrativa não pausada pelo teto.
-- Somente aditiva: colunas novas em launch_plans, sem alterar dados existentes.
-- max_spend_initial_brl guarda o teto antes da primeira extensão automática por lucro
-- max_spend_ceiling_brl é o teto máximo absoluto definido pelo operador (vazio = 3 vezes o teto inicial)
-- profit_extend_enabled liga ou desliga a extensão por lucro no plano
-- cap_extensions conta quantas vezes o vigia estendeu o teto por lucro

ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS max_spend_initial_brl NUMERIC(14, 2);
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS max_spend_ceiling_brl NUMERIC(14, 2);
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS profit_extend_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS cap_extensions INTEGER NOT NULL DEFAULT 0;
