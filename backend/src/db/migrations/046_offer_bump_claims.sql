-- NORQVA-0032: adicional na hora do Pix (order bump) e promessas por produto. Só aditiva.
-- offer_bumps: a oferta principal pode oferecer UM adicional (outra oferta, com arquivo próprio) por um preço
--   definido aqui. O preço cobrado vem sempre daqui, no servidor. Desligado por padrão.
-- order_items.is_bump: marca o item que entrou pelo adicional. Pedidos antigos ficam FALSE.

CREATE TABLE IF NOT EXISTS offer_bumps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  bump_offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE RESTRICT,
  bump_price NUMERIC(10,2) NOT NULL CHECK (bump_price > 0),
  headline TEXT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_offer_bumps_offer UNIQUE (offer_id),
  CONSTRAINT chk_offer_bumps_distinct CHECK (offer_id <> bump_offer_id)
);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_bump BOOLEAN NOT NULL DEFAULT FALSE;
