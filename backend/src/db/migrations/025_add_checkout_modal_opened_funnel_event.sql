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
  CHECK (event_type IN ('LANDING_PAGE_VIEW', 'OFFER_VIEW', 'CHECKOUT_MODAL_OPENED', 'CHECKOUT_STARTED'));
