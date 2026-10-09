-- NORQVA-0033: arquivo de entrega trocado pela tela, com cópia de segurança. Só aditiva.
-- digital_assets ganha os dados do arquivo que está no endereço hoje (preenchidos quando o envio é feito pela tela).
-- digital_asset_versions: cada troca sobe o PDF novo num endereço NOVO e o cadastro passa a apontar para ele; o
--   endereço anterior (com o arquivo intacto) entra aqui. Arquivos enviados antes desta tela não têm tamanho/sha.

ALTER TABLE digital_assets ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
ALTER TABLE digital_assets ADD COLUMN IF NOT EXISTS file_sha256 VARCHAR(64);
ALTER TABLE digital_assets ADD COLUMN IF NOT EXISTS file_original_name TEXT;
ALTER TABLE digital_assets ADD COLUMN IF NOT EXISTS file_updated_at TIMESTAMPTZ;
ALTER TABLE digital_assets ADD COLUMN IF NOT EXISTS file_updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS digital_asset_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES digital_assets(id) ON DELETE RESTRICT,
  storage_bucket VARCHAR(100) NOT NULL,
  storage_path TEXT NOT NULL,
  size_bytes BIGINT,
  sha256 VARCHAR(64),
  original_name TEXT,
  replaced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  replaced_by UUID REFERENCES users(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_digital_asset_versions_asset ON digital_asset_versions(asset_id, replaced_at DESC);
