-- NORQVA-0013: adjustment requests ("Pedir ajuste") become tracked tasks that a Claude routine
-- picks up automatically. Additive.
CREATE TABLE IF NOT EXISTS creative_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
  review_id UUID REFERENCES creative_reviews(id) ON DELETE SET NULL,
  request_text TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'NOT_CONFIGURED', 'DISPATCHED', 'IN_PROGRESS', 'DONE', 'NEEDS_INPUT', 'FAILED')),
  response TEXT,
  session_url TEXT,
  result_creative_id UUID REFERENCES creatives(id) ON DELETE SET NULL,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  dispatched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_adjustments_creative ON creative_adjustments(creative_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creative_adjustments_status ON creative_adjustments(status, is_demo);
