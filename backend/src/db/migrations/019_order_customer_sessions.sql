-- Migration 019: Order Customer Sessions Architecture
-- Supports multi-session customer access and durable recovery without mutating orders.checkout_token_hash

CREATE TABLE IF NOT EXISTS order_customer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  session_token_hash VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_ip VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_order_customer_sessions_hash ON order_customer_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_order_customer_sessions_order_id ON order_customer_sessions(order_id);
