-- NORQVA-0158: conversa que não é de cliente (robô de outra empresa, propaganda, quem oferece produto ou serviço)
-- o atendente automático para nessa conversa e ninguém é chamado
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS not_customer_at TIMESTAMPTZ;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS not_customer_reason VARCHAR(200);
