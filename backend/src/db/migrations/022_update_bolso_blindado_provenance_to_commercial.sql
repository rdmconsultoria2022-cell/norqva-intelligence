DO $$
-- Migration 022: Update Bolso Blindado Commercial Data Provenance
-- NORQVA Gate 11.8: Production Promotion Package Hardening
-- Atomically updates data_provenance to COMMERCIAL_PRODUCTION for active commercial product & offer.
-- Strictly validates cardinality (exactly 1 product, exactly 1 offer) before mutating.
-- Historical orders, payments, customers, and entitlements remain completely untouched.
DECLARE
    v_offer_count INTEGER;
    v_product_count INTEGER;
BEGIN
    -- 1. Validate Product Cardinality (Active & Non-Deleted)
    SELECT COUNT(*) INTO v_product_count
    FROM public.products
    WHERE human_id = 'PRD-BOLSO-BLINDADO'
      AND is_deleted = FALSE;

    IF v_product_count != 1 THEN
        RAISE EXCEPTION '[MIGRATION 022 SAFETY ERROR]: Expected exactly 1 product with human_id ''PRD-BOLSO-BLINDADO'' (is_deleted=FALSE), found %', v_product_count;
    END IF;

    -- 2. Validate Offer Cardinality (Active & Non-Deleted)
    SELECT COUNT(*) INTO v_offer_count
    FROM public.offers
    WHERE human_id = 'OFF-BOLSO-BLINDADO-2990'
      AND is_deleted = FALSE;

    IF v_offer_count != 1 THEN
        RAISE EXCEPTION '[MIGRATION 022 SAFETY ERROR]: Expected exactly 1 offer with human_id ''OFF-BOLSO-BLINDADO-2990'' (is_deleted=FALSE), found %', v_offer_count;
    END IF;

    -- 3. Execute Idempotent Updates (ONLY on product and offer definitions)
    UPDATE public.products
    SET data_provenance = 'COMMERCIAL_PRODUCTION'
    WHERE human_id = 'PRD-BOLSO-BLINDADO'
      AND is_deleted = FALSE;

    UPDATE public.offers
    SET data_provenance = 'COMMERCIAL_PRODUCTION'
    WHERE human_id = 'OFF-BOLSO-BLINDADO-2990'
      AND is_deleted = FALSE;

END $$;
