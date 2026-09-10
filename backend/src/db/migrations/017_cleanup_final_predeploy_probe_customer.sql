-- Migration 017: Controlled Cleanup of Final Pre-deploy Probe Customer
-- Removes strictly the fourth pre-deploy probe customer record created on legacy runtime
DELETE FROM customers
WHERE id = 'e561a6a9-1e7c-4a3d-af53-3b1c04859cc2';

