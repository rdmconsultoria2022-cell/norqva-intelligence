-- Migration 048 (NORQVA-0036): tira do faturamento a compra de teste do adicional feita pelo operador.
-- Pedido aprovado pelo Ricardo em 2026-10-10 08h32 ("10/10/2026, 08:18:21", Trattoria + Dolci della Nonna).
-- Nada é apagado: o Pix é real no Asaas, então o pedido fica para conciliação e só sai dos painéis de produção
-- (mesmo critério da migration 028 / decisão D-0002).
-- Segurança: só age se encontrar EXATAMENTE UM pedido com todas as características abaixo, senão não faz nada.
--   pago, conta real, ainda COMMERCIAL_PRODUCTION, total R$ 34,80, com item do adicional (is_bump),
--   criado em 10/10/2026 entre 08h10 e 08h25 (horário de Brasília = 11h10 a 11h25 UTC).
-- Envolvido em DO: o emulador pg-mem dos testes remove blocos DO, o PostgreSQL executa normalmente.

DO $$
DECLARE
  n INTEGER;
  target UUID;
BEGIN
  SELECT count(*), min(o.id::text)::uuid INTO n, target
  FROM orders o
  WHERE o.is_demo = FALSE
    AND o.status = 'PAID'
    AND o.data_provenance = 'COMMERCIAL_PRODUCTION'
    AND o.total_amount = 34.80
    AND o.created_at >= TIMESTAMPTZ '2026-10-10 11:10:00+00'
    AND o.created_at <  TIMESTAMPTZ '2026-10-10 11:25:00+00'
    AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.is_bump = TRUE);

  IF n = 1 THEN
    UPDATE order_items SET data_provenance = 'STAGING_SANDBOX_QA' WHERE order_id = target AND data_provenance = 'COMMERCIAL_PRODUCTION';
    UPDATE payments SET data_provenance = 'STAGING_SANDBOX_QA' WHERE order_id = target AND data_provenance = 'COMMERCIAL_PRODUCTION';
    UPDATE orders SET data_provenance = 'STAGING_SANDBOX_QA', updated_at = NOW() WHERE id = target AND data_provenance = 'COMMERCIAL_PRODUCTION';
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'ORDER_RECLASSIFIED_TEST',
            'Compra de teste do adicional (10/10/2026 08:18) tirada do faturamento, a pedido do operador (migration 048)',
            'COMMERCIAL_PRODUCTION', 'STAGING_SANDBOX_QA', FALSE);
  ELSE
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'ORDER_RECLASSIFY_SKIPPED',
            'Migration 048: ' || n || ' pedidos encontrados no critério (esperado 1); nada foi reclassificado',
            NULL, NULL, FALSE);
  END IF;
END $$;

-- Instrução inofensiva para o pg-mem ter o que executar depois de remover o bloco DO.
SELECT 1;
