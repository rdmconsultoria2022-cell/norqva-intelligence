-- Migration 066 (NORQVA-0075): oferta depois da compra do Trattoria.
-- Aprovado pelo Ricardo em 15/10/2026 10h38 ("2- Aprovado"): na tela de entrega do Trattoria, "Complete a coleção: os outros 4 livros por R$ 27,90".
-- offers.post_purchase_offer_id (aditiva): a oferta mostrada a quem acabou de comprar esta.
-- Cria a oferta "+4 livros" (R$ 27,90) com os PDFs do kit de 5 (OFF-000010) menos o do Trattoria (OFF-000001): Dolci, Pães, Antipasti e Risotos.
-- Cartão: mesmas condições do Kit Cozinha Italiana (OFF-000006, também R$ 27,90), se ela existir com esse preço. Senão, só Pix.
-- Só cria se o Trattoria estiver ativo, o kit de 5 entregar 5 PDFs e sobrarem exatamente 4. Senão registra o motivo e não cria nada.
-- Envolvido em DO: o emulador pg-mem dos testes remove blocos DO, o PostgreSQL executa normalmente.

ALTER TABLE offers ADD COLUMN IF NOT EXISTS post_purchase_offer_id UUID REFERENCES offers(id) ON DELETE SET NULL;

DO $$
DECLARE
  trat RECORD;
  kit RECORD;
  card RECORD;
  n_assets INTEGER;
  reason TEXT;
  num BIGINT;
  off_human TEXT;
  created_id UUID;
  use_card BOOLEAN := FALSE;
BEGIN
  SELECT * INTO trat FROM offers WHERE human_id = 'OFF-000001' AND is_demo = FALSE AND is_deleted = FALSE AND status = 'ATIVA';
  IF NOT FOUND THEN
    reason := 'o Trattoria (OFF-000001) não foi encontrado ou não está ativo';
  ELSIF trat.post_purchase_offer_id IS NOT NULL THEN
    reason := 'o Trattoria já tem oferta depois da compra';
  ELSE
    SELECT * INTO kit FROM offers WHERE human_id = 'OFF-000010' AND is_demo = FALSE AND is_deleted = FALSE;
    IF NOT FOUND THEN
      reason := 'o kit de 5 livros (OFF-000010) não foi encontrado';
    ELSE
      SELECT count(*) INTO n_assets FROM offer_digital_assets oda
      WHERE oda.offer_id = kit.id
        AND oda.asset_id NOT IN (SELECT asset_id FROM offer_digital_assets WHERE offer_id = trat.id);
      IF n_assets <> 4 THEN
        reason := 'o kit sem o Trattoria não tem exatamente 4 PDFs (' || n_assets || ')';
      END IF;
    END IF;
  END IF;

  IF reason IS NOT NULL THEN
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'POST_PURCHASE_OFFER_SKIPPED', 'Migration 066: oferta depois da compra não criada, ' || reason, NULL, NULL, FALSE);
    RETURN;
  END IF;

  SELECT * INTO card FROM offers WHERE human_id = 'OFF-000006' AND is_demo = FALSE AND price = 27.90 AND card_enabled = TRUE;
  IF FOUND THEN
    use_card := TRUE;
  END IF;

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
                      card_enabled, card_max_installments, card_total_price, card_free_installments, card_interest_monthly)
  VALUES (created_id, off_human, kit.product_id, 'COMPLETE A COLEÇÃO — +4 LIVROS', 27.90, NULL,
          'Dolci della Nonna, Pães & Fermentação Natural, Antipasti & Aperitivo e Risotos & Polentas, em PDF. Oferta para quem comprou o Trattoria em Casa.',
          NULL, 'ATIVA', FALSE, 'COMMERCIAL_PRODUCTION',
          CASE WHEN use_card THEN TRUE ELSE FALSE END,
          CASE WHEN use_card THEN card.card_max_installments ELSE 1 END,
          CASE WHEN use_card THEN card.card_total_price ELSE NULL END,
          CASE WHEN use_card THEN card.card_free_installments ELSE NULL END,
          CASE WHEN use_card THEN card.card_interest_monthly ELSE 0 END);
  INSERT INTO offer_digital_assets (offer_id, asset_id)
  SELECT created_id, oda.asset_id FROM offer_digital_assets oda
  WHERE oda.offer_id = kit.id
    AND oda.asset_id NOT IN (SELECT asset_id FROM offer_digital_assets WHERE offer_id = trat.id);
  UPDATE offers SET post_purchase_offer_id = created_id WHERE id = trat.id;
  INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
  VALUES (gen_random_uuid(), NULL, 'POST_PURCHASE_OFFER_CREATED', 'Migration 066: oferta ' || off_human || ' (+4 livros, R$ 27,90) ligada ao Trattoria OFF-000001', NULL, off_human, FALSE);
END $$;

-- Instrução inofensiva para o pg-mem ter o que executar depois de remover o bloco DO.
SELECT 1;
