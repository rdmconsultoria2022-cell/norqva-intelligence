-- Migration 062 (NORQVA-0061, contrato aprovado pelo Ricardo em 2026-10-13 19h26): cadastra os Volumes III, IV e V
-- da coleção Cozinha Italiana em Casa para venda separada, a R$ 19,90 cada.
-- Cria, para cada livro que ainda não existe, um produto (PLANEJADO, procedência ORIGINAL) e uma oferta em RASCUNHO.
-- Rascunho não vende: o PDF é enviado pelo Ricardo na tela (Produtos, PDF entregue ao comprador) e ativar é decisão dele.
-- Marca e categoria vêm do produto do Trattoria (oferta OFF-000001). Cartão: as mesmas condições da OFF-000001
--   quando ela custa R$ 19,90 sem promoção, senão só Pix (o Ricardo liga o cartão na tela).
-- Sem a OFF-000001, não cria nada e registra o motivo na auditoria.
-- products.collection_key (aditiva): chave fixa do livro (paes, antipasti, risotos), para a página de venda e o kit
--   continuarem certos mesmo se o nome do produto for editado na tela.
-- Envolvido em DO: o emulador pg-mem dos testes remove blocos DO, o PostgreSQL executa normalmente.

ALTER TABLE products ADD COLUMN IF NOT EXISTS collection_key VARCHAR(30);

DO $$
DECLARE
  tr RECORD;
  resp UUID;
  same_card BOOLEAN;
  b RECORD;
  prd UUID;
  off UUID;
  prd_human TEXT;
  off_human TEXT;
  num BIGINT;
  created INTEGER := 0;
BEGIN
  SELECT o.id, o.price, o.promotional_price, o.card_enabled, o.card_max_installments, o.card_total_price,
         o.card_free_installments, o.card_interest_monthly, p.brand_id, p.category
    INTO tr
  FROM offers o JOIN products p ON p.id = o.product_id
  WHERE o.human_id = 'OFF-000001' AND o.is_demo = FALSE AND o.is_deleted = FALSE;

  IF NOT FOUND THEN
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'COLLECTION_BOOKS_SKIPPED', 'Migration 062: livros não cadastrados, a oferta OFF-000001 não foi encontrada', NULL, NULL, FALSE);
    RETURN;
  END IF;

  same_card := tr.price = 19.90 AND tr.promotional_price IS NULL AND tr.card_enabled = TRUE;
  SELECT id INTO resp FROM users WHERE lower(email) = 'rdmconsultoria2022@gmail.com' LIMIT 1;

  FOR b IN
    SELECT * FROM (VALUES
      ('Pães & Fermentação Natural',
       'Volume III da coleção Cozinha Italiana em Casa: 12 receitas, do fermento natural ao pão de frigideira, com foto e passo a passo. PDF de 31 páginas.',
       'Livro digital com 11 pães italianos e o fermento natural: pão rústico, pane pugliese, ciabatta, focaccia barese, grissini, taralli, piadina e mais. Foto e passo a passo em cada receita.',
       'NORQVA-0055', 'paes'),
      ('Antipasti & Aperitivo',
       'Volume IV da coleção Cozinha Italiana em Casa: 12 antepastos e drinques do aperitivo italiano, com foto e passo a passo. PDF de 31 páginas.',
       'Livro digital com 12 receitas para abrir a mesa à italiana: bruschetta, caponata, arancini, cogumelos recheados, tábua de frios, spritz e mais. Foto e passo a passo em cada receita.',
       'NORQVA-0059', 'antipasti'),
      ('Risotos & Polentas',
       'Volume V da coleção Cozinha Italiana em Casa: caldo caseiro, 7 risotos e 4 polentas, com foto e passo a passo. PDF de 31 páginas.',
       'Livro digital com 12 receitas do norte da Itália: risoto alla milanese, de cogumelos, de abóbora, de camarão, polenta cremosa, grelhada e ao forno. Foto e passo a passo em cada receita.',
       'NORQVA-0060', 'risotos')
    ) AS t(name, prd_desc, off_desc, task, folder)
  LOOP
    IF EXISTS (SELECT 1 FROM products WHERE (name = b.name OR collection_key = b.folder) AND is_demo = FALSE AND is_deleted = FALSE) THEN
      CONTINUE;
    END IF;

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

    prd := gen_random_uuid();
    off := gen_random_uuid();
    INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, brand_id,
                          origin_provenance, origin_responsible_id, origin_evidence, collection_key)
    VALUES (prd, prd_human, b.name, tr.category, b.prd_desc, 'PLANEJADO', FALSE, 'COMMERCIAL_PRODUCTION', tr.brand_id,
            'ORIGINAL', resp, 'Escrito para a NORQVA (' || b.task || '); fontes em norqva-ai/produtos/' || b.folder || '/', b.folder);

    INSERT INTO offers (id, human_id, product_id, name, price, promotional_price, description, status, is_demo, data_provenance,
                        card_enabled, card_max_installments, card_total_price, card_free_installments, card_interest_monthly)
    VALUES (off, off_human, prd, b.name, 19.90, NULL, b.off_desc, 'RASCUNHO', FALSE, 'COMMERCIAL_PRODUCTION',
            CASE WHEN same_card THEN TRUE ELSE FALSE END,
            CASE WHEN same_card THEN tr.card_max_installments ELSE 1 END,
            CASE WHEN same_card THEN tr.card_total_price ELSE NULL END,
            CASE WHEN same_card THEN tr.card_free_installments ELSE NULL END,
            CASE WHEN same_card THEN tr.card_interest_monthly ELSE 0 END);

    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'COLLECTION_BOOK_CREATED',
            'Migration 062: ' || b.name || ' criado em RASCUNHO (' || off_human || ', produto ' || prd_human || '), R$ 19,90, sem PDF ainda',
            NULL, off_human, FALSE);
    created := created + 1;
  END LOOP;

  IF created = 0 THEN
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (gen_random_uuid(), NULL, 'COLLECTION_BOOKS_SKIPPED', 'Migration 062: os três livros já existiam, nada criado', NULL, NULL, FALSE);
  END IF;
END $$;

-- Instrução inofensiva para o pg-mem ter o que executar depois de remover o bloco DO.
SELECT 1;
