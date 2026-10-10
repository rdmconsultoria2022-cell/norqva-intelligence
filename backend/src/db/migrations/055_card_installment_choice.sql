-- Migration 055 (NORQVA-0041): o comprador escolhe o parcelamento. Aprovado pelo Ricardo em 2026-10-10 18h10.
-- offers.card_free_installments: parcelas sem juros (o vendedor absorve). Nulo = todas as parcelas sem juros.
-- offers.card_interest_monthly: juros ao mês, em %, acima das parcelas sem juros (Tabela Price, comprador paga).
-- payments.card_interest_applied: a cobrança de cartão teve juros repassados ao comprador.
-- Kit Cozinha Italiana (OFF-000006): até 12x, 4 sem juros, 2,99% ao mês acima disso (a tela limita a parcela
--   mínima de R$ 5,00, então o kit vai até 6x). Só muda se achar exatamente essa oferta com cartão ligado.

ALTER TABLE offers ADD COLUMN IF NOT EXISTS card_free_installments INTEGER;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS card_interest_monthly NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE offers DROP CONSTRAINT IF EXISTS chk_offers_card_free_installments;
ALTER TABLE offers ADD CONSTRAINT chk_offers_card_free_installments CHECK (card_free_installments IS NULL OR card_free_installments BETWEEN 1 AND 12);
ALTER TABLE offers DROP CONSTRAINT IF EXISTS chk_offers_card_interest_monthly;
ALTER TABLE offers ADD CONSTRAINT chk_offers_card_interest_monthly CHECK (card_interest_monthly >= 0 AND card_interest_monthly <= 10);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS card_interest_applied BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
DECLARE
  n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM offers WHERE human_id = 'OFF-000006' AND is_demo = FALSE AND card_enabled = TRUE;
  IF n = 1 THEN
    UPDATE offers SET card_max_installments = 12, card_free_installments = 4, card_interest_monthly = 2.99
    WHERE human_id = 'OFF-000006' AND is_demo = FALSE AND card_enabled = TRUE;
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'OFFER_CARD_PLAN',
            'Migration 055: OFF-000006 com até 4x sem juros e 2,99% ao mês acima disso (parcela mínima R$ 5,00)',
            NULL, '4 sem juros, 2,99% a.m.', FALSE);
  ELSE
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'OFFER_CARD_PLAN_SKIPPED',
            'Migration 055: OFF-000006 com cartão ligado encontrada ' || n || ' vez(es) (esperado 1), nada mudou',
            NULL, NULL, FALSE);
  END IF;
END $$;

SELECT 1;
