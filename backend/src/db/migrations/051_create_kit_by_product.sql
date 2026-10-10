-- Migration 051 (NORQVA-0039): segunda tentativa de criar o Kit Cozinha Italiana FORA DO AR.
-- A 050 não criou nada (auditoria 2026-10-10 16h18: PDFs ligados ao Trattoria OFF-000001: 0).
-- A oferta que vende o Trattoria não é a OFF-000001. Agora as ofertas são achadas pelos produtos que o Ricardo
--   mostrou na tela: Trattoria em Casa = PRD-000003 e Dolci della Nonna = PRD-000006 (oferta OFF-000005).
-- Mesmo resultado aprovado pelo Ricardo em 2026-10-10 16h07: produto e oferta em RASCUNHO, R$ 34,80 por R$ 27,90,
--   cartão 4x (total R$ 27,96), com os PDFs já existentes dos dois livros. Ativar é decisão do Ricardo.
-- Segurança: só age se cada produto tiver EXATAMENTE uma oferta não arquivada com EXATAMENTE um PDF, e se o kit
--   ainda não existir. Senão não cria nada e registra o motivo na auditoria.
-- Envolvido em DO: o emulador pg-mem dos testes remove blocos DO, o PostgreSQL executa normalmente.

DO $$
DECLARE
  n_tr INTEGER;
  n_do INTEGER;
  n_kit INTEGER;
  n_tr_asset INTEGER;
  n_do_asset INTEGER;
  tr_offer UUID;
  do_offer UUID;
  tr_product UUID;
  tr_asset UUID;
  do_asset UUID;
  kit_product UUID := gen_random_uuid();
  kit_offer UUID := gen_random_uuid();
  prd_human TEXT;
  off_human TEXT;
  num BIGINT;
  reason TEXT := NULL;
BEGIN
  SELECT count(*), min(o.id::text)::uuid INTO n_tr, tr_offer
  FROM offers o JOIN products p ON p.id = o.product_id
  WHERE p.human_id = 'PRD-000003' AND o.is_demo = FALSE AND o.is_deleted = FALSE AND o.status <> 'ARQUIVADA';

  SELECT count(*), min(o.id::text)::uuid INTO n_do, do_offer
  FROM offers o JOIN products p ON p.id = o.product_id
  WHERE p.human_id = 'PRD-000006' AND o.is_demo = FALSE AND o.is_deleted = FALSE AND o.status <> 'ARQUIVADA';

  SELECT count(*) INTO n_kit FROM products WHERE name = 'Kit Cozinha Italiana' AND is_demo = FALSE AND is_deleted = FALSE;

  IF n_kit > 0 THEN
    reason := 'o kit já existe';
  ELSIF n_tr <> 1 THEN
    reason := 'ofertas do Trattoria (PRD-000003) encontradas: ' || n_tr || ' (esperado 1)';
  ELSIF n_do <> 1 THEN
    reason := 'ofertas do Dolci (PRD-000006) encontradas: ' || n_do || ' (esperado 1)';
  END IF;

  IF reason IS NULL THEN
    SELECT count(*), min(asset_id::text)::uuid INTO n_tr_asset, tr_asset FROM offer_digital_assets WHERE offer_id = tr_offer;
    SELECT count(*), min(asset_id::text)::uuid INTO n_do_asset, do_asset FROM offer_digital_assets WHERE offer_id = do_offer;
    IF n_tr_asset <> 1 THEN
      reason := 'PDFs ligados ao Trattoria: ' || n_tr_asset || ' (esperado 1)';
    ELSIF n_do_asset <> 1 THEN
      reason := 'PDFs ligados ao Dolci: ' || n_do_asset || ' (esperado 1)';
    ELSIF tr_asset = do_asset THEN
      reason := 'Trattoria e Dolci apontam para o mesmo PDF';
    END IF;
  END IF;

  IF reason IS NOT NULL THEN
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'KIT_CREATE_SKIPPED', 'Migration 051: kit não criado, ' || reason, NULL, NULL, FALSE);
    RETURN;
  END IF;

  SELECT product_id INTO tr_product FROM offers WHERE id = tr_offer;

  -- Códigos no mesmo formato da tela (PRD-000123 e OFF-000123), sem repetir um código existente
  LOOP
    IF to_regclass('seq_products_human_id') IS NOT NULL THEN
      num := nextval('seq_products_human_id');
    ELSE
      SELECT COALESCE(max(NULLIF(regexp_replace(human_id, '\D', '', 'g'), '')::bigint), 0) + 1 INTO num FROM products;
    END IF;
    prd_human := 'PRD-' || lpad(num::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM products WHERE human_id = prd_human);
  END LOOP;
  LOOP
    IF to_regclass('seq_offers_human_id') IS NOT NULL THEN
      num := nextval('seq_offers_human_id');
    ELSE
      SELECT COALESCE(max(NULLIF(regexp_replace(human_id, '\D', '', 'g'), '')::bigint), 0) + 1 INTO num FROM offers;
    END IF;
    off_human := 'OFF-' || lpad(num::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM offers WHERE human_id = off_human);
  END LOOP;

  INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, brand_id)
  SELECT kit_product, prd_human, 'Kit Cozinha Italiana', p.category,
         'Trattoria em Casa (28 receitas) e Dolci della Nonna (10 doces italianos), em PDF.',
         'PLANEJADO', FALSE, 'COMMERCIAL_PRODUCTION', p.brand_id
  FROM products p WHERE p.id = tr_product;

  INSERT INTO offers (id, human_id, product_id, name, price, promotional_price, description, status, is_demo, data_provenance,
                      card_enabled, card_max_installments, card_total_price)
  VALUES (kit_offer, off_human, kit_product, 'Kit Cozinha Italiana', 34.80, 27.90,
          'Os dois livros: Trattoria em Casa (massas, molhos e pizzas) e Dolci della Nonna (sobremesas italianas).',
          'RASCUNHO', FALSE, 'COMMERCIAL_PRODUCTION', TRUE, 4, 27.96);

  INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES (kit_offer, tr_asset), (kit_offer, do_asset);

  INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
  VALUES (gen_random_uuid(), NULL, 'KIT_CREATED',
          'Migration 051: Kit Cozinha Italiana criado em RASCUNHO (' || off_human || ', produto ' || prd_human || ') com os PDFs do Trattoria e do Dolci',
          NULL, off_human, FALSE);
END $$;

-- Instrução inofensiva para o pg-mem ter o que executar depois de remover o bloco DO.
SELECT 1;
