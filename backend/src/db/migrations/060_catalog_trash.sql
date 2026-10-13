-- Migration 060 (NORQVA-0057, contrato aprovado em 13/10/2026 17h11): lixeira de produtos e ofertas.
-- Somente aditiva. Excluir pela tela marca is_deleted (coluna já existente) e guarda quando e quem.
-- Nada é apagado: pedidos, pagamentos e downloads dos compradores continuam ligados ao cadastro.

ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;
