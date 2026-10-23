-- Migration 076 (NORQVA-0115, D-0115): referências de página de venda e de anúncio.
-- Guarda SÓ a estrutura (esqueleto) da referência. Texto, HTML, imagens e prints nunca são gravados.
-- Para a checagem anticópia da etapa 2 ficam apenas impressões (hash sha256 cortado em 16) de cada
-- janela de 6 palavras do texto de origem. Do link fica só o domínio e um hash (sha256) do link normalizado.
-- Exclusão pela tela marca deleted_at (nada é apagado). Só aditiva.

CREATE SEQUENCE IF NOT EXISTS seq_creative_references_human_id START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS creative_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id VARCHAR(50) UNIQUE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  source_kind VARCHAR(20) NOT NULL CHECK (source_kind IN ('PAGE_URL', 'SCREENSHOTS')),
  source_url_hash VARCHAR(64),
  source_host VARCHAR(255),
  reference_type VARCHAR(20) NOT NULL CHECK (reference_type IN ('SALES_PAGE', 'AD')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('READY', 'FAILED')),
  failure_reason TEXT,
  extraction_method VARCHAR(20),
  structure JSONB,
  source_word_count INTEGER NOT NULL DEFAULT 0,
  source_shingles TEXT[] NOT NULL DEFAULT '{}',
  source_shingle_count INTEGER NOT NULL DEFAULT 0,
  fingerprint_truncated BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  data_provenance VARCHAR(50) NOT NULL DEFAULT 'COMMERCIAL_PRODUCTION',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_creative_references_created ON creative_references (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creative_references_product ON creative_references (product_id);
CREATE INDEX IF NOT EXISTS idx_creative_references_url_hash ON creative_references (source_url_hash);
