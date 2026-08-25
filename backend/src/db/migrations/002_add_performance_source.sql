-- Create performance_entries table with source field and unique constraint

CREATE TABLE IF NOT EXISTS performance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  source VARCHAR(50) NOT NULL CHECK (source IN ('MANUAL', 'META', 'IMPORT')) DEFAULT 'MANUAL',
  investment NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (investment >= 0),
  impressions INTEGER NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  cliques INTEGER NOT NULL DEFAULT 0 CHECK (cliques >= 0),
  conversas INTEGER NOT NULL DEFAULT 0 CHECK (conversas >= 0),
  pedidos INTEGER NOT NULL DEFAULT 0 CHECK (pedidos >= 0),
  vendas INTEGER NOT NULL DEFAULT 0 CHECK (vendas >= 0),
  receita NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (receita >= 0),
  reembolsos NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (reembolsos >= 0),
  taxas NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (taxas >= 0),
  outros_custos NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (outros_custos >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_experiment_date_source UNIQUE (experiment_id, date, source)
);
