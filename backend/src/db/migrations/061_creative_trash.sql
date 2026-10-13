-- Migration 061 (NORQVA-0058, regras da lixeira aprovadas em 13/10/2026 17h11 - D-0057): lixeira de criativos.
-- Somente aditiva. Excluir pela tela marca is_deleted (coluna já existente) em todas as versões do criativo
-- e guarda quando e quem. Restaurar desfaz. Nada é apagado.

ALTER TABLE creatives ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;
