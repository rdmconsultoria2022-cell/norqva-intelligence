-- NORQVA-0009: alerts about Meta ads (additive).
-- First rule: SPEND_WITHOUT_SALE — an active ad spent at least 2x the breakeven CPA of its
-- product without any paid order. Recommendation only: nothing is paused automatically.
CREATE TABLE IF NOT EXISTS ad_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code VARCHAR(50) NOT NULL,
  meta_ad_id VARCHAR(100) NOT NULL,
  ad_name VARCHAR(255),
  meta_campaign_id VARCHAR(100),
  campaign_name VARCHAR(255),
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  spend NUMERIC(14,2) NOT NULL DEFAULT 0,
  threshold NUMERIC(14,2) NOT NULL DEFAULT 0,
  breakeven_cpa NUMERIC(14,2),
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  resolution VARCHAR(50),
  notified_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_alerts_status ON ad_alerts(status, is_demo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_alerts_ad ON ad_alerts(rule_code, meta_ad_id, is_demo);
