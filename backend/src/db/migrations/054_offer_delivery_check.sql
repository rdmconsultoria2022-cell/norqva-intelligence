-- Migration 054 (NORQVA-0040): relatório, só leitura das ofertas. Aprovado pelo Ricardo em 2026-10-10 16h59.
-- Para cada oferta real não arquivada grava UMA linha na auditoria (OFFER_DELIVERY_CHECK) com código, nome,
--   situação, procedência, produto e quantos PDFs ela entrega. Oferta à venda (ATIVA ou TESTE) sem PDF vira
--   OFFER_WITHOUT_PDF, para aparecer em destaque. Nada é alterado nas ofertas.
-- Motivo: o produto do Trattoria (PRD-000003) tem 3 ofertas e a tela mostra só uma.
-- Envolvido em DO: o emulador pg-mem dos testes remove blocos DO, o PostgreSQL executa normalmente.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT o.human_id, o.name, o.status, o.data_provenance, p.human_id AS product_human_id,
           (SELECT count(*) FROM offer_digital_assets x WHERE x.offer_id = o.id) AS n_pdf
    FROM offers o JOIN products p ON p.id = o.product_id
    WHERE o.is_demo = FALSE AND o.is_deleted = FALSE AND o.status <> 'ARQUIVADA'
    ORDER BY o.human_id
  LOOP
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES (
      gen_random_uuid(), NULL,
      CASE WHEN r.status IN ('ATIVA', 'TESTE') AND r.n_pdf = 0 THEN 'OFFER_WITHOUT_PDF' ELSE 'OFFER_DELIVERY_CHECK' END,
      r.human_id || ' · ' || r.name || ' · ' || r.status || ' · procedência ' || COALESCE(r.data_provenance, '?') ||
        ' · produto ' || r.product_human_id || ' · PDFs: ' || r.n_pdf,
      NULL, NULL, FALSE
    );
  END LOOP;
END $$;

-- Instrução inofensiva para o pg-mem ter o que executar depois de remover o bloco DO.
SELECT 1;
