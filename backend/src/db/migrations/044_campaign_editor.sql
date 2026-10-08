-- NORQVA-0027: tela Campanhas (planos de lançamento) com modo manual. Só aditiva.
-- manual_fields: campos que o operador editou (ex.: ads.0.headline = true). O preenchimento
--   automático não sobrescreve esses campos.
-- auto_values: valor automático anterior de cada campo editado (para Voltar ao automático).
-- ad_creatives: criativo escolhido à mão para cada anúncio (índice do anúncio -> uuid do criativo).
-- Ficam fora da spec de propósito: a spec só descreve o que vai para a Meta.

ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS manual_fields JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS auto_values JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS ad_creatives JSONB NOT NULL DEFAULT '{}'::jsonb;
