-- Migration 016: Controlled Cleanup of Additional Preflight Probe Customers
-- Removes strictly the two pre-deploy validation probe customer records
DELETE FROM customers
WHERE id IN (
  '0749fee3-9393-4aea-9718-bbe9c0f4c9b1',
  '80cd48e4-de37-4d1f-8064-2da3313b99d9'
);

