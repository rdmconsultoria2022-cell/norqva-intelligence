-- Migration 005: Sprint 2.5 Commercial Structures

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_customers_email_is_demo UNIQUE(email, is_demo)
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  total_amount NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0),
  status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING', 'PAID', 'CANCELLED', 'REFUNDED')) DEFAULT 'PENDING',
  idempotency_key VARCHAR(255) NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_orders_idempotency_is_demo UNIQUE(idempotency_key, is_demo),
  CONSTRAINT chk_real_order_value CHECK (is_demo = TRUE OR total_amount > 0)
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  
  -- Historical Snapshot fields
  product_name_snapshot VARCHAR(255) NOT NULL,
  offer_name_snapshot VARCHAR(255) NOT NULL,
  offer_description_snapshot TEXT,
  
  unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 1000), -- Operational limit of 1000 quantity per item
  total_price NUMERIC(14, 2) NOT NULL CHECK (total_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
