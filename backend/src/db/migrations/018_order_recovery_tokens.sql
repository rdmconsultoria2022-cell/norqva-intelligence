-- Migration 018: Order Recovery Tokens for Out-of-Band Paid Order Recovery

CREATE TABLE IF NOT EXISTS order_recovery_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_ip VARCHAR(64),
    use_count INT NOT NULL DEFAULT 0,
    CONSTRAINT chk_order_recovery_tokens_status CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED', 'REVOKED'))
);

CREATE INDEX IF NOT EXISTS idx_order_recovery_tokens_hash ON order_recovery_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_order_recovery_tokens_order_id ON order_recovery_tokens(order_id);
