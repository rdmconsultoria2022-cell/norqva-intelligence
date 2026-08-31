-- Migration 010: High-Performance Database Indexes for Low-Latency Operations

-- 1. Orders & Order Items Indexes
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id, is_demo);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, is_demo);
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_offer_id ON order_items(offer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- 2. Payments & Webhooks Indexes
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_id ON payments(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_payment ON payment_webhook_events(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_payment_id ON payment_webhook_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON payment_webhook_events(processing_status);

-- 3. Deliveries & Assets Indexes
CREATE INDEX IF NOT EXISTS idx_order_deliveries_order_id ON order_deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_order_deliveries_status ON order_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_offer_digital_assets_offer ON offer_digital_assets(offer_id);

-- 4. Products, Offers & Creatives Indexes
CREATE INDEX IF NOT EXISTS idx_offers_human_id ON offers(human_id, is_demo);
CREATE INDEX IF NOT EXISTS idx_offers_product_id ON offers(product_id, is_demo);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status, is_demo);
CREATE INDEX IF NOT EXISTS idx_products_human_id ON products(human_id, is_demo);
CREATE INDEX IF NOT EXISTS idx_creatives_product_id ON creatives(product_id, is_demo);

-- 5. Governance & Audit Logs Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_entity ON decisions(related_entity_id, related_entity_type);
CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status, is_demo);
