-- NORQVA-0152: o servidor do WhatsApp (Evolution) manda o arquivo do áudio junto com a mensagem
-- (webhook com base64). Marca os números já reconfigurados. Só aditiva.
ALTER TABLE whatsapp_numbers ADD COLUMN IF NOT EXISTS webhook_media_base64 BOOLEAN NOT NULL DEFAULT FALSE;
