-- Migration 074 (NORQVA-0110): vendas feitas fora do NORQVA (Kiwify) para Vendas e Financeiro.
-- Aprovado pelo Ricardo em 21/10/2026 20h52 ("Aprovado").
-- Uma linha por pedido da plataforma. Sem CPF, sem telefone e sem endereço. Só aditiva.

CREATE TABLE IF NOT EXISTS external_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(20) NOT NULL DEFAULT 'KIWIFY',
  external_order_id VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('PAID', 'REFUNDED', 'CHARGEBACK')),
  product_name VARCHAR(255),
  gross_amount NUMERIC(12,2),
  net_amount NUMERIC(12,2),
  fee_amount NUMERIC(12,2),
  currency VARCHAR(10),
  payment_method VARCHAR(40),
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(500),
  utm_content VARCHAR(500),
  utm_term VARCHAR(500),
  approved_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  data_provenance VARCHAR(50) NOT NULL DEFAULT 'COMMERCIAL_PRODUCTION',
  raw_event JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_external_sales_source_order UNIQUE (source, external_order_id)
);

CREATE INDEX IF NOT EXISTS idx_external_sales_approved_at ON external_sales (approved_at);
