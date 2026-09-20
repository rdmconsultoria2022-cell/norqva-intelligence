-- Migration 021_activate_bolso_blindado_offer.sql
-- NORQVA Gate 11.7: Controlled Commercial E2E - Phase A: Offer Activation

UPDATE offers
SET status = 'ATIVA', updated_at = NOW()
WHERE human_id = 'OFF-BOLSO-BLINDADO-2990'
  AND status = 'RASCUNHO'
  AND is_deleted = FALSE;
