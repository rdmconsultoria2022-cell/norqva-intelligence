-- Migration 068 (NORQVA-0080): livro + Dolci por R$ 24,90 e kit de 5 livros por R$ 29,90.
-- Aprovado pelo Ricardo em 16/10/2026 01h42 (contrato NORQVA-0080 no Claude Docs).
-- Só mexe em dados de ofertas, em bloco DO, com checagem de cada oferta e registro em audit_logs. Nenhuma coluna nova.
-- 1. Adicional Dolci (OFF-000005) por R$ 5,00 no Trattoria (OFF-000001), Pães (OFF-000007), Antipasti (OFF-000008) e Risotos (OFF-000009).
-- 2. Cartão nesses quatro livros, no kit de 5 (OFF-000010), no Kit Cozinha Italiana (OFF-000006) e na oferta depois da compra:
--    até 10 parcelas permitidas, só 1x sem acréscimo, 2,99% ao mês acima disso. A parcela mínima de R$ 5,00 corta o resto.
-- 3. Kit de 5 de R$ 94,50 por R$ 29,90. Kit Cozinha Italiana de R$ 34,80 por R$ 24,90.
-- 4. Ofertas de saída do kit (R$ 49,90 e R$ 39,90) pausadas, porque ficariam mais caras que o kit.
-- 5. Oferta depois da compra do Trattoria (+4 livros) de R$ 27,90 para R$ 9,90.
-- Livros sozinhos continuam R$ 19,90 e o Dolci R$ 14,90.

DO $$
DECLARE
  dolci RECORD;
  bk RECORD;
  kit RECORD;
  combo RECORD;
  trat RECORD;
  pp RECORD;
  ex RECORD;
  pp_id UUID;
  next_id UUID;
  hops INTEGER := 0;
  dolci_assets INTEGER;
  shared INTEGER;
  v_headline TEXT := 'Leve mais um livro de sobremesa por apenas R$ 5,00 comprando os dois.';
BEGIN
  -- 1 e 2: adicional Dolci e cartão nos livros
  SELECT * INTO dolci FROM offers
  WHERE human_id = 'OFF-000005' AND is_demo = FALSE AND is_deleted = FALSE AND status IN ('ATIVA', 'TESTE');
  IF NOT FOUND THEN
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'BOOK_DOLCI_COMBO_SKIPPED', 'Migration 068: Dolci (OFF-000005) não encontrado ou fora de venda, adicional não ligado', NULL, NULL, FALSE);
  ELSE
    SELECT count(*) INTO dolci_assets FROM offer_digital_assets WHERE offer_id = dolci.id;
    FOR bk IN
      SELECT o.* FROM offers o
      WHERE o.human_id IN ('OFF-000001', 'OFF-000007', 'OFF-000008', 'OFF-000009')
        AND o.is_demo = FALSE AND o.is_deleted = FALSE
      ORDER BY o.human_id
    LOOP
      SELECT count(*) INTO shared FROM offer_digital_assets a
      WHERE a.offer_id = bk.id AND a.asset_id IN (SELECT asset_id FROM offer_digital_assets WHERE offer_id = dolci.id);
      IF dolci_assets = 0 OR shared > 0 THEN
        INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
        VALUES (gen_random_uuid(), NULL, 'BOOK_DOLCI_COMBO_SKIPPED',
                'Migration 068: ' || bk.human_id || ' sem adicional (Dolci sem PDF ou com o mesmo PDF do livro)', NULL, NULL, FALSE);
      ELSE
        IF EXISTS (SELECT 1 FROM offer_bumps WHERE offer_id = bk.id) THEN
          UPDATE offer_bumps
          SET bump_offer_id = dolci.id, bump_price = 5.00, headline = v_headline, is_active = TRUE, is_demo = FALSE, updated_at = NOW()
          WHERE offer_id = bk.id;
        ELSE
          INSERT INTO offer_bumps (offer_id, bump_offer_id, bump_price, headline, is_active, is_demo)
          VALUES (bk.id, dolci.id, 5.00, v_headline, TRUE, FALSE);
        END IF;
        INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
        VALUES (gen_random_uuid(), NULL, 'BOOK_DOLCI_COMBO_SET',
                'Migration 068: ' || bk.human_id || ' com o Dolci por R$ 5,00 no mesmo pagamento', NULL, '5.00', FALSE);
      END IF;

      UPDATE offers
      SET card_enabled = TRUE, card_max_installments = 10, card_free_installments = 1, card_interest_monthly = 2.99,
          card_total_price = NULL
      WHERE id = bk.id;
      INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
      VALUES (gen_random_uuid(), NULL, 'OFFER_CARD_PLAN',
              'Migration 068: ' || bk.human_id || ' no cartão, 1x sem acréscimo e 2,99% ao mês acima (parcela mínima R$ 5,00)',
              CASE WHEN bk.card_enabled THEN bk.card_max_installments || 'x, ' || COALESCE(bk.card_free_installments::text, 'todas') || ' sem juros' ELSE 'sem cartão' END,
              '1 sem acréscimo, 2,99% a.m.', FALSE);
    END LOOP;
  END IF;

  -- 3 e 4: kit de 5 livros a R$ 29,90 e ofertas de saída pausadas
  SELECT * INTO kit FROM offers
  WHERE human_id = 'OFF-000010' AND is_demo = FALSE AND is_deleted = FALSE;
  IF NOT FOUND OR (SELECT count(*) FROM offer_digital_assets WHERE offer_id = kit.id) < 5 THEN
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'KIT_PRICE_SKIPPED', 'Migration 068: kit de 5 livros (OFF-000010) não encontrado ou com menos de 5 PDFs', NULL, NULL, FALSE);
  ELSE
    UPDATE offers
    SET price = 94.50, promotional_price = 29.90,
        card_enabled = TRUE, card_max_installments = 10, card_free_installments = 1, card_interest_monthly = 2.99,
        card_total_price = NULL
    WHERE id = kit.id;
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'KIT_PRICE_CHANGED', 'Migration 068: kit de 5 livros (OFF-000010) de R$ 94,50 por R$ 29,90',
            COALESCE(kit.promotional_price, kit.price)::text, '29.90', FALSE);

    next_id := kit.exit_offer_id;
    WHILE next_id IS NOT NULL AND hops < 5 LOOP
      hops := hops + 1;
      SELECT * INTO ex FROM offers WHERE id = next_id;
      EXIT WHEN NOT FOUND;
      IF ex.name LIKE '%Oferta de saída%' AND ex.status = 'ATIVA' THEN
        UPDATE offers SET status = 'PAUSADA' WHERE id = ex.id;
        INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
        VALUES (gen_random_uuid(), NULL, 'EXIT_OFFER_PAUSED',
                'Migration 068: oferta de saída ' || ex.human_id || ' pausada (mais cara que o kit a R$ 29,90)', 'ATIVA', 'PAUSADA', FALSE);
      END IF;
      next_id := ex.exit_offer_id;
    END LOOP;
  END IF;

  -- 3: Kit Cozinha Italiana (Trattoria + Dolci) com o mesmo preço do novo combo
  SELECT * INTO combo FROM offers
  WHERE human_id = 'OFF-000006' AND is_demo = FALSE AND is_deleted = FALSE;
  IF NOT FOUND THEN
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'KIT_PRICE_SKIPPED', 'Migration 068: Kit Cozinha Italiana (OFF-000006) não encontrado', NULL, NULL, FALSE);
  ELSE
    UPDATE offers
    SET price = 34.80, promotional_price = 24.90,
        card_enabled = TRUE, card_max_installments = 10, card_free_installments = 1, card_interest_monthly = 2.99,
        card_total_price = NULL
    WHERE id = combo.id;
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'KIT_PRICE_CHANGED', 'Migration 068: Kit Cozinha Italiana (OFF-000006) de R$ 34,80 por R$ 24,90',
            COALESCE(combo.promotional_price, combo.price)::text, '24.90', FALSE);
  END IF;

  -- 5: oferta depois da compra do Trattoria a R$ 9,90
  SELECT * INTO trat FROM offers WHERE human_id = 'OFF-000001' AND is_demo = FALSE AND is_deleted = FALSE;
  IF FOUND AND trat.post_purchase_offer_id IS NOT NULL THEN
    SELECT id INTO pp_id FROM offers WHERE id = trat.post_purchase_offer_id AND is_deleted = FALSE AND is_demo = FALSE;
    SELECT * INTO pp FROM offers WHERE id = pp_id;
  END IF;
  IF pp_id IS NULL THEN
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'POST_PURCHASE_PRICE_SKIPPED', 'Migration 068: oferta depois da compra do Trattoria não encontrada', NULL, NULL, FALSE);
  ELSE
    UPDATE offers
    SET price = 9.90, promotional_price = NULL,
        card_enabled = TRUE, card_max_installments = 10, card_free_installments = 1, card_interest_monthly = 2.99,
        card_total_price = NULL
    WHERE id = pp_id;
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'POST_PURCHASE_PRICE_CHANGED', 'Migration 068: ' || pp.human_id || ' (+4 livros) passa a R$ 9,90',
            COALESCE(pp.promotional_price, pp.price)::text, '9.90', FALSE);
  END IF;
END $$;

-- Instrução inofensiva para o pg-mem ter o que executar depois de remover o bloco DO.
SELECT 1;
