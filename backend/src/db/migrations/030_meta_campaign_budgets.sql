-- Migration 030: campaign-level budgets (NORQVA-0006)
-- Advantage+ sales campaigns keep the budget on the campaign, not on the ad set.
ALTER TABLE meta_campaigns ADD COLUMN IF NOT EXISTS daily_budget NUMERIC(14,2);
ALTER TABLE meta_campaigns ADD COLUMN IF NOT EXISTS lifetime_budget NUMERIC(14,2);
