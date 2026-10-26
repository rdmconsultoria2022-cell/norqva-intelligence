-- Migration 085 (NORQVA-0138): Coleção Trattoria Completa em RASCUNHO, a R$ 47,00.
-- Aprovado pelo Ricardo em 26/10/2026 14h23: os 5 livros do kit de 5 (OFF-000010) + o bônus "Cardápio italiano de 4
--   semanas com lista de compras". No WhatsApp a coleção vem primeiro, em destaque, e o kit de 5 é a alternativa.
-- Só aditiva. Colunas novas em offers (o atendente lê, a tela não muda):
--   attendant_featured = o atendente apresenta esta oferta primeiro, como a recomendada
--   attendant_alternative_offer_id = a alternativa mais em conta que ele apresenta logo depois (só se estiver ATIVA)
-- Bloco DO cria produto e oferta novos, sem mexer em oferta existente:
--   preço cheio ("de") = soma real dos preços avulsos dos 5 livros (OFF-000001, 05, 07, 08 e 09), como manda a D-0080
--   o bônus não tem preço avulso e não entra na soma
--   cartão como nos livros (D-0080) com até 10 parcelas, 1x sem acréscimo e 2,99% ao mês acima (parcela mínima R$ 5,00)
--   entrega = os mesmos 5 PDFs do kit (nada é copiado). O PDF do bônus entra depois, pela tela
--   (Produtos, PDF entregue ao comprador, Adicionar mais PDFs), e só então o Ricardo ativa a oferta.
-- Travas: o kit OFF-000010 precisa existir com exatamente 5 PDFs, as 5 ofertas avulsas precisam existir e entregar
--   exatamente esses 5 PDFs, a soma precisa ser maior que R$ 47,00 e a coleção ainda não pode existir.
--   Senão não cria nada e registra o motivo na auditoria.
-- Envolvido em DO: o emulador pg-mem dos testes remove blocos DO, o PostgreSQL executa normalmente.

ALTER TABLE offers ADD COLUMN IF NOT EXISTS attendant_featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS attendant_alternative_offer_id UUID REFERENCES offers(id) ON DELETE SET NULL;

DO $$
DECLARE
  kit RECORD;
  n_kit_assets INTEGER;
  n_books INTEGER;
  n_book_assets INTEGER;
  full_price NUMERIC(14,2);
  resp UUID;
  prd UUID := gen_random_uuid();
  off UUID := gen_random_uuid();
  prd_human TEXT;
  off_human TEXT;
  num BIGINT;
  reason TEXT := NULL;
BEGIN
  SELECT * INTO kit FROM offers WHERE human_id = 'OFF-000010' AND is_demo = FALSE AND is_deleted = FALSE;
  IF NOT FOUND THEN
    reason := 'o kit de 5 livros (OFF-000010) não foi encontrado';
  ELSIF EXISTS (SELECT 1 FROM offers WHERE name = 'Coleção Trattoria Completa' AND is_demo = FALSE AND is_deleted = FALSE) THEN
    reason := 'a Coleção Trattoria Completa já existe';
  ELSE
    SELECT count(*) INTO n_kit_assets FROM offer_digital_assets WHERE offer_id = kit.id;
    SELECT count(*), sum(COALESCE(NULLIF(promotional_price, 0), price)) INTO n_books, full_price
    FROM offers
    WHERE human_id IN ('OFF-000001', 'OFF-000005', 'OFF-000007', 'OFF-000008', 'OFF-000009')
      AND is_demo = FALSE AND is_deleted = FALSE;
    SELECT count(DISTINCT a.asset_id) INTO n_book_assets
    FROM offer_digital_assets a JOIN offers o ON o.id = a.offer_id
    WHERE o.human_id IN ('OFF-000001', 'OFF-000005', 'OFF-000007', 'OFF-000008', 'OFF-000009')
      AND o.is_demo = FALSE AND o.is_deleted = FALSE
      AND a.asset_id IN (SELECT asset_id FROM offer_digital_assets WHERE offer_id = kit.id);
    IF n_kit_assets <> 5 THEN
      reason := 'o kit OFF-000010 não entrega exatamente 5 PDFs (' || n_kit_assets || ')';
    ELSIF n_books <> 5 THEN
      reason := 'ofertas avulsas dos 5 livros encontradas: ' || n_books || ' (esperado 5)';
    ELSIF n_book_assets <> 5 THEN
      reason := 'as ofertas avulsas não entregam os mesmos 5 PDFs do kit (' || n_book_assets || ' em comum)';
    ELSIF full_price IS NULL OR full_price <= 47.00 THEN
      reason := 'a soma dos livros avulsos (' || COALESCE(full_price::text, '?') || ') não é maior que R$ 47,00';
    END IF;
  END IF;

  IF reason IS NOT NULL THEN
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'COLLECTION_FULL_SKIPPED', 'Migration 085: Coleção Trattoria Completa não criada, ' || reason, NULL, NULL, FALSE);
    RETURN;
  END IF;

  SELECT id INTO resp FROM users WHERE lower(email) = 'rdmconsultoria2022@gmail.com' LIMIT 1;

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

  INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, brand_id,
                        origin_provenance, origin_responsible_id, origin_evidence)
  SELECT prd, prd_human, 'Coleção Trattoria Completa', p.category,
         'Os 5 livros da coleção Cozinha Italiana em Casa (Trattoria em Casa, Dolci della Nonna, Pães & Fermentação Natural, '
         || 'Antipasti & Aperitivo e Risotos & Polentas) e o bônus Cardápio italiano de 4 semanas com lista de compras, em PDF.',
         'PLANEJADO', FALSE, 'COMMERCIAL_PRODUCTION', p.brand_id,
         'ORIGINAL', resp, 'Escrito para a NORQVA (NORQVA-0138); fontes em norqva-ai/produtos/ (bônus em norqva-ai/produtos/cardapio/)'
  FROM products p WHERE p.id = kit.product_id;

  INSERT INTO offers (id, human_id, product_id, name, price, promotional_price, description, bonus, status, is_demo, data_provenance,
                      card_enabled, card_max_installments, card_total_price, card_free_installments, card_interest_monthly,
                      attendant_featured, attendant_alternative_offer_id)
  VALUES (off, off_human, prd, 'Coleção Trattoria Completa', full_price, 47.00,
          'Os 5 livros da coleção em PDF: Trattoria em Casa (massas e molhos), Dolci della Nonna (sobremesas), '
          || 'Pães & Fermentação Natural, Antipasti & Aperitivo e Risotos & Polentas. '
          || 'Mais o bônus: cardápio italiano de 4 semanas, com 28 jantares e a lista de compras de cada semana.',
          'Cardápio italiano de 4 semanas com lista de compras (PDF)',
          'RASCUNHO', FALSE, 'COMMERCIAL_PRODUCTION',
          TRUE, 10, NULL, 1, 2.99,
          TRUE, kit.id);

  INSERT INTO offer_digital_assets (offer_id, asset_id) SELECT off, asset_id FROM offer_digital_assets WHERE offer_id = kit.id;

  INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
  VALUES (gen_random_uuid(), NULL, 'COLLECTION_FULL_CREATED',
          'Migration 085: Coleção Trattoria Completa criada em RASCUNHO (' || off_human || ', produto ' || prd_human || '), de R$ '
          || replace(full_price::text, '.', ',') || ' por R$ 47,00, com os 5 PDFs do kit ' || kit.human_id
          || '. Falta enviar o PDF do bônus pela tela antes de ativar.',
          NULL, off_human, FALSE);
END $$;

-- Instrução inofensiva para o pg-mem ter o que executar depois de remover o bloco DO.
SELECT 1;
