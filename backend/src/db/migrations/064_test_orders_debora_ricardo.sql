-- Migration 064 (NORQVA-0073): tira dos números as tentativas de compra NÃO pagas feitas em teste
-- por Débora Souza Pena e Ricardo Andrade Lucas (também gravado como "RICARDO A LUCAS").
-- Pedido do Ricardo em 15/10/2026 10h38 ("Retire todas as tentativas de compra não efetuadas").
-- Nada é apagado: os pedidos passam para STAGING_SANDBOX_QA (mesmo critério das migrations 028 e 048, D-0002).
-- Pedidos PAGOS desses nomes não mudam.
-- Segurança: só age se encontrar EXATAMENTE 5 pedidos não pagos da conta real com esses nomes
-- (conferido no painel em 15/10/2026: 3 da Débora e 2 do Ricardo), senão registra e não faz nada.
-- Envolvido em DO: o emulador pg-mem dos testes remove blocos DO, o PostgreSQL executa normalmente.

DO $$
DECLARE
  n INTEGER;
BEGIN
  CREATE TEMP TABLE tmp_064_targets ON COMMIT DROP AS
  SELECT o.id
  FROM orders o
  JOIN customers c ON c.id = o.customer_id
  WHERE o.is_demo = FALSE
    AND o.status <> 'PAID'
    AND o.data_provenance = 'COMMERCIAL_PRODUCTION'
    AND lower(translate(trim(c.name), 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc'))
        IN ('debora souza pena', 'ricardo andrade lucas', 'ricardo a lucas');

  SELECT count(*) INTO n FROM tmp_064_targets;

  IF n = 5 THEN
    UPDATE order_items SET data_provenance = 'STAGING_SANDBOX_QA'
      WHERE order_id IN (SELECT id FROM tmp_064_targets) AND data_provenance = 'COMMERCIAL_PRODUCTION';
    UPDATE payments SET data_provenance = 'STAGING_SANDBOX_QA'
      WHERE order_id IN (SELECT id FROM tmp_064_targets) AND data_provenance = 'COMMERCIAL_PRODUCTION';
    UPDATE orders SET data_provenance = 'STAGING_SANDBOX_QA', updated_at = NOW()
      WHERE id IN (SELECT id FROM tmp_064_targets) AND data_provenance = 'COMMERCIAL_PRODUCTION';
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'ORDER_RECLASSIFIED_TEST',
            'Migration 064: 5 tentativas de compra não pagas de teste (Débora Souza Pena e Ricardo Andrade Lucas) tiradas dos números, a pedido do operador em 15/10/2026',
            'COMMERCIAL_PRODUCTION', 'STAGING_SANDBOX_QA', FALSE);
  ELSE
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'ORDER_RECLASSIFY_SKIPPED',
            'Migration 064: ' || n || ' pedidos encontrados no critério (esperado 5); nada foi reclassificado',
            NULL, NULL, FALSE);
  END IF;
END $$;

-- Instrução inofensiva para o pg-mem ter o que executar depois de remover o bloco DO.
SELECT 1;
