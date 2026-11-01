-- Migration 091 (NORQVA-0160): vídeo com apresentadora fictícia feito pela Fábrica de Criativos (serviço separado, o "motor").
-- O NORQVA guarda só a ligação: produto, oferta, página gerada (opcional), número da produção no motor e o estado.
-- Roteiro, clipes, custos e o vídeo ficam no motor. Exclusão marca deleted_at (nada é apagado). Só aditiva.

CREATE TABLE IF NOT EXISTS video_productions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  generated_page_id UUID REFERENCES generated_pages(id) ON DELETE SET NULL,
  motor_production_id INTEGER UNIQUE NOT NULL,
  persona_id INTEGER NOT NULL,
  template_id VARCHAR(60) NOT NULL,
  duration_s INTEGER NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'roteiro',
  estimated_cost_usd NUMERIC(10, 2),
  creative_id UUID REFERENCES creatives(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_video_productions_product ON video_productions (product_id);
CREATE INDEX IF NOT EXISTS idx_video_productions_page ON video_productions (generated_page_id);
