-- NORQVA-0018 (fase C): o pixel da marca só recebe vendas depois de ativado pelo operador.
-- Evita trocar o pixel de uma campanha em andamento sem decisão. Somente aditiva.
ALTER TABLE brand_meta_assets ADD COLUMN IF NOT EXISTS routing_enabled BOOLEAN NOT NULL DEFAULT FALSE;
