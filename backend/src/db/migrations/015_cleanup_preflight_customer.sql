-- Migration 015: Controlled Preflight Customer Cleanup
-- Removes strictly the preflight probe customer record 5c68ea1f-b68c-4f4d-995a-fa96cf4a9b8d
DELETE FROM customers WHERE id = '5c68ea1f-b68c-4f4d-995a-fa96cf4a9b8d';
