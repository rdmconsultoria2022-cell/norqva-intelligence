-- NORQVA-0132 marcas extras por número de WhatsApp (só aditiva)
-- um número continua com a marca principal (whatsapp_numbers.brand_id) e pode atender também outras marcas
-- o atendente usa a origem da conversa para falar só da marca certa

CREATE TABLE IF NOT EXISTS whatsapp_number_brands (
  number_id UUID NOT NULL REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (number_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_number_brands_brand ON whatsapp_number_brands (brand_id);

-- assunto da conversa (marca) depois que a pessoa escolhe, para o atendente não misturar produtos
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS focus_brand_id UUID REFERENCES brands(id) ON DELETE SET NULL;
