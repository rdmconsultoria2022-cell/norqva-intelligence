-- Migration 025: Expand commercial_funnel_events event_type CHECK constraint
-- Authorizes 'CHECKOUT_MODAL_OPENED' for Gate 17.0B Funnel Telemetry

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'commercial_funnel_events' 
      AND constraint_name = 'commercial_funnel_events_event_type_check'
  ) THEN
    ALTER TABLE commercial_funnel_events DROP CONSTRAINT commercial_funnel_events_event_type_check;
  END IF;
END $$;

ALTER TABLE commercial_funnel_events
  DROP CONSTRAINT IF EXISTS chk_commercial_funnel_events_event_type;

ALTER TABLE commercial_funnel_events
  ADD CONSTRAINT chk_commercial_funnel_events_event_type
  CHECK (event_type IN ('LANDING_PAGE_VIEW', 'OFFER_VIEW', 'CHECKOUT_MODAL_OPENED', 'CHECKOUT_STARTED')) NOT VALID;
-- NOT VALID (decisão D-0001, NORQVA-0001): em bancos onde esta migration é reexecutada
-- depois da 026 (suíte de testes que recria schema_migrations), linhas com PIX_GENERATED,
-- PIX_EXPIRED ou PAID já existem. NOT VALID só pula a validação de linhas antigas;
-- novas linhas continuam verificadas, e a 026 substitui esta constraint por uma validada.
-- Em produção esta migration já foi aplicada e não é reexecutada: nenhum efeito.
