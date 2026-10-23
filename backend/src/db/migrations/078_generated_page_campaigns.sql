-- Migration 078 (NORQVA-0117, D-0117): campanha pausada a partir de uma página gerada.
-- O plano de lançamento (tabela launch_plans de sempre) fica ligado à página gerada. O índice único
-- garante um plano só por página (um segundo clique mostra o plano que já existe). Só aditiva.

ALTER TABLE launch_plans ADD COLUMN IF NOT EXISTS generated_page_id UUID REFERENCES generated_pages(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_launch_plans_generated_page ON launch_plans (generated_page_id);
