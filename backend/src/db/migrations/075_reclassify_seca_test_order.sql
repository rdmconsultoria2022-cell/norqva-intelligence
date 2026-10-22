-- Migration 075 (NORQVA-0114): tira do faturamento a compra de teste do Seca Barriga feita pelo operador.
-- Teste de ponta a ponta aprovado pelo Ricardo em 2026-10-22 19h14 ("sim"), pago em 22/10/2026 19h24 (R$ 37,00, Pix, OFF-000014).
-- Nada é apagado: o Pix é real no Asaas, então o pedido fica para conciliação e só sai dos painéis de produção
-- (mesmo critério das migrations 028 e 048, decisão D-0002).
-- Segurança: só age se encontrar EXATAMENTE UM pedido com o código abaixo e todas estas características:
--   pago, conta real, ainda COMMERCIAL_PRODUCTION, total R$ 37,00, criado em 22/10/2026 entre 19h20 e 19h30 (22h20 a 22h30 UTC).
-- Envolvido em DO: o emulador pg-mem dos testes remove blocos DO, o PostgreSQL executa normalmente.

DO $$
DECLARE
  n INTEGER;
BEGIN
  SELECT count(*) INTO n
  FROM orders o
  WHERE o.id = '07425233-2e43-4413-933c-43958153a3e8'::uuid
    AND o.is_demo = FALSE
    AND o.status = 'PAID'
    AND o.data_provenance = 'COMMERCIAL_PRODUCTION'
    AND o.total_amount = 37.00
    AND o.created_at >= TIMESTAMPTZ '2026-10-22 22:20:00+00'
    AND o.created_at <  TIMESTAMPTZ '2026-10-22 22:30:00+00';

  IF n = 1 THEN
    UPDATE order_items SET data_provenance = 'STAGING_SANDBOX_QA' WHERE order_id = '07425233-2e43-4413-933c-43958153a3e8'::uuid AND data_provenance = 'COMMERCIAL_PRODUCTION';
    UPDATE payments SET data_provenance = 'STAGING_SANDBOX_QA' WHERE order_id = '07425233-2e43-4413-933c-43958153a3e8'::uuid AND data_provenance = 'COMMERCIAL_PRODUCTION';
    UPDATE orders SET data_provenance = 'STAGING_SANDBOX_QA', updated_at = NOW() WHERE id = '07425233-2e43-4413-933c-43958153a3e8'::uuid AND data_provenance = 'COMMERCIAL_PRODUCTION';
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'ORDER_RECLASSIFIED_TEST',
            'Compra de teste do Seca Barriga (22/10/2026 19h24, R$ 37,00) tirada do faturamento, a pedido do operador (migration 075)',
            'COMMERCIAL_PRODUCTION', 'STAGING_SANDBOX_QA', FALSE);
  ELSE
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'ORDER_RECLASSIFY_SKIPPED',
            'Migration 075: ' || n || ' pedidos encontrados no critério (esperado 1); nada foi reclassificado',
            NULL, NULL, FALSE);
  END IF;
END $$;

-- Instrução inofensiva para o pg-mem ter o que executar depois de remover o bloco DO.
SELECT 1;
