-- NORQVA-0148 motivo da recusa do pagamento (só aditiva)
-- guarda só o código do erro (ex. ASAAS_400:invalid_email:email), nunca dado do comprador

ALTER TABLE payments ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(120);
