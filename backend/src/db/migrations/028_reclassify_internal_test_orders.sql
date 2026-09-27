-- Migration 028 (NORQVA-0003): reclassify internal test orders out of COMMERCIAL_PRODUCTION.
-- Approved by the operator on 2026-09-27. Nothing is deleted: 3 of these orders have real Pix
-- payments in Asaas, so rows are kept for reconciliation and only leave production dashboards.
-- Customers: Ricardo licas (4), Ricardo Andrade (1), QA User A (1), Qa Sandbox Buyer Test (2).
-- Idempotent: only rows still marked COMMERCIAL_PRODUCTION are touched, unknown ids are a no-op.
-- Wrapped in a DO block: the pg-mem test emulator strips DO blocks (it has no such data),
-- PostgreSQL executes it normally.

DO $$
BEGIN
  UPDATE order_items SET data_provenance = 'STAGING_SANDBOX_QA'
  WHERE order_id IN (
    '49fefd75-1f9e-4877-b0ca-dfc28f4303c1',
    'db7517d3-470c-4575-89c7-da54f53d524a',
    'a39e7cb9-592e-4bda-b720-45364d873348',
    '6a8303d2-c081-441f-9751-729b81c4bf9a',
    'dd7708cb-466f-49fd-a8f7-3aba3c27d075',
    '53cb8c49-f700-4521-aaef-6b251342eb9f',
    '8900fd7b-1d71-4d6d-86f8-0e8b6843e836',
    '46743977-3029-41c9-8dfb-f69f6533627b'
  ) AND data_provenance = 'COMMERCIAL_PRODUCTION';

  UPDATE payments SET data_provenance = 'STAGING_SANDBOX_QA'
  WHERE order_id IN (
    '49fefd75-1f9e-4877-b0ca-dfc28f4303c1',
    'db7517d3-470c-4575-89c7-da54f53d524a',
    'a39e7cb9-592e-4bda-b720-45364d873348',
    '6a8303d2-c081-441f-9751-729b81c4bf9a',
    'dd7708cb-466f-49fd-a8f7-3aba3c27d075',
    '53cb8c49-f700-4521-aaef-6b251342eb9f',
    '8900fd7b-1d71-4d6d-86f8-0e8b6843e836',
    '46743977-3029-41c9-8dfb-f69f6533627b'
  ) AND data_provenance = 'COMMERCIAL_PRODUCTION';

  UPDATE orders SET data_provenance = 'STAGING_SANDBOX_QA', updated_at = NOW()
  WHERE id IN (
    '49fefd75-1f9e-4877-b0ca-dfc28f4303c1',
    'db7517d3-470c-4575-89c7-da54f53d524a',
    'a39e7cb9-592e-4bda-b720-45364d873348',
    '6a8303d2-c081-441f-9751-729b81c4bf9a',
    'dd7708cb-466f-49fd-a8f7-3aba3c27d075',
    '53cb8c49-f700-4521-aaef-6b251342eb9f',
    '8900fd7b-1d71-4d6d-86f8-0e8b6843e836',
    '46743977-3029-41c9-8dfb-f69f6533627b'
  ) AND data_provenance = 'COMMERCIAL_PRODUCTION';
END $$;
