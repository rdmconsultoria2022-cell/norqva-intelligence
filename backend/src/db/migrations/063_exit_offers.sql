-- Migration 063 (NORQVA-0069, contrato aprovado pelo Ricardo em 2026-10-15): ofertas de saída do kit completo.
-- Quando a pessoa clica em Voltar no pagamento do kit de 5 livros (OFF-000010), o site mostra o kit por R$ 49,90 e, ao voltar de novo, por R$ 39,90.
-- O preço é sempre o da oferta no servidor: por isso a migration cria duas ofertas reais do mesmo produto, com os mesmos PDFs do kit.
-- offers.exit_offer_id (aditiva): a oferta que vem depois, no Voltar. OFF-000010 aponta para a de R$ 49,90, e esta para a de R$ 39,90.
-- Só cria se a OFF-000010 existir, estiver ativa, entregar 5 PDFs e ainda não tiver oferta de saída. Senão não cria nada e registra o motivo na auditoria.
-- Envolvido em DO: o emulador pg-mem dos testes remove blocos DO, o PostgreSQL executa normalmente.

ALTER TABLE offers ADD COLUMN IF NOT EXISTS exit_offer_id UUID REFERENCES offers(id) ON DELETE SET NULL;

DO $$
DECLARE
  kit RECORD;
  n_assets INTEGER;
  reason TEXT;
  b RECORD;
  prev UUID;
  created_id UUID;
  off_human TEXT;
  num BIGINT;
  created INTEGER := 0;
BEGIN
  SELECT * INTO kit FROM offers
  WHERE human_id = 'OFF-000010' AND name LIKE 'KIT TRATTORIA COMPLETO%' AND is_demo = FALSE AND is_deleted = FALSE AND status = 'ATIVA';
  IF NOT FOUND THEN
    reason := 'a oferta OFF-000010 não foi encontrada ou não está ativa';
  ELSIF kit.exit_offer_id IS NOT NULL THEN
    reason := 'a OFF-000010 já tem oferta de saída';
  ELSE
    SELECT count(*) INTO n_assets FROM offer_digital_assets WHERE offer_id = kit.id;
    IF n_assets <> 5 THEN
      reason := 'a OFF-000010 não entrega exatamente 5 PDFs (' || n_assets || ')';
    END IF;
  END IF;

  IF reason IS NOT NULL THEN
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'EXIT_OFFERS_SKIPPED', 'Migration 063: ofertas de saída não criadas, ' || reason, NULL, NULL, FALSE);
    RETURN;
  END IF;

  -- cria primeiro a de R$ 39,90 (a última da sequência) e depois a de R$ 49,90, que aponta para ela
  prev := NULL;
  FOR b IN SELECT * FROM (VALUES (39.90, 'R$ 39,90'), (49.90, 'R$ 49,90')) AS t(price, label) LOOP
    LOOP
      IF to_regclass('seq_offers_human_id') IS NOT NULL THEN
        num := nextval('seq_offers_human_id');
      ELSE
        SELECT COALESCE(max(NULLIF(regexp_replace(human_id, '\D', '', 'g'), '')::bigint), 0) + 1 INTO num FROM offers;
      END IF;
      off_human := 'OFF-' || lpad(num::text, 6, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM offers WHERE human_id = off_human);
    END LOOP;
    created_id := gen_random_uuid();
    INSERT INTO offers (id, human_id, product_id, name, price, promotional_price, description, bonus, status, is_demo, data_provenance,
                        card_enabled, card_max_installments, card_total_price, card_free_installments, card_interest_monthly, exit_offer_id)
    VALUES (created_id, off_human, kit.product_id, 'KIT TRATTORIA COMPLETO — 5 LIVROS | Oferta de saída ' || b.label, b.price, NULL,
            kit.description, kit.bonus, 'ATIVA', FALSE, 'COMMERCIAL_PRODUCTION',
            kit.card_enabled, kit.card_max_installments, CASE WHEN kit.card_enabled THEN b.price ELSE NULL END,
            kit.card_free_installments, kit.card_interest_monthly, prev);
    INSERT INTO offer_digital_assets (offer_id, asset_id) SELECT created_id, asset_id FROM offer_digital_assets WHERE offer_id = kit.id;
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'EXIT_OFFER_CREATED', 'Migration 063: oferta de saída ' || off_human || ' (' || b.label || ') criada com os 5 PDFs do kit', NULL, off_human, FALSE);
    prev := created_id;
    created := created + 1;
  END LOOP;

  IF created <> 2 THEN
    RAISE EXCEPTION 'Migration 063: esperava criar 2 ofertas de saída e criou %', created;
  END IF;
  UPDATE offers SET exit_offer_id = prev WHERE id = kit.id;
END $$;

-- Instrução inofensiva para o pg-mem ter o que executar depois de remover o bloco DO.
SELECT 1;
