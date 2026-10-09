-- NORQVA-0029: tela Pesquisa. Critérios de avaliação com versões validadas pelo dono. Só aditiva.
-- research_criteria_versions: cada ajuste vira uma versão nova em rascunho (DRAFT) e só vale depois de
--   validada (VALIDATED). A versão validada anterior passa a SUPERSEDED. Nada é apagado.
--   numbers = limites numéricos (classes da Base, seleção de candidatos, mercado europeu)
--   texts = checklist do validador e regras das IAs no momento da versão (texts_hash para conferir)
-- campaign_opportunities.criteria_version: versão validada em vigor quando a avaliação chegou.

CREATE TABLE IF NOT EXISTS research_criteria_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'VALIDATED', 'SUPERSEDED')),
  numbers JSONB NOT NULL,
  texts JSONB NOT NULL,
  texts_hash VARCHAR(64) NOT NULL,
  note TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_research_criteria_status ON research_criteria_versions (status);

ALTER TABLE campaign_opportunities ADD COLUMN IF NOT EXISTS criteria_version INT;
