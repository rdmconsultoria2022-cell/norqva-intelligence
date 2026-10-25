-- NORQVA-0126 link de download estável (só aditiva)
-- guarda o link atual de cada arquivo criptografado (mesma chave do CPF) para a página de entrega devolver o mesmo link enquanto ele valer
-- sem isso cada abertura da página (inclusive pré-visualização do Google) trocava o link e o anterior deixava de funcionar

ALTER TABLE order_deliveries ADD COLUMN IF NOT EXISTS delivery_token_enc TEXT;
ALTER TABLE order_deliveries ADD COLUMN IF NOT EXISTS delivery_token_enc_version INTEGER;
