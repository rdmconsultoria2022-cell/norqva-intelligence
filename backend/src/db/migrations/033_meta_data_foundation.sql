-- NORQVA-0017 (fase 1): base de dados de campanhas Meta. Somente aditiva.

-- Funil e vídeo extraídos de actions / action_values / video_*_actions
ALTER TABLE meta_insights
  ADD COLUMN IF NOT EXISTS purchases NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS landing_page_views NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initiate_checkouts NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS add_to_carts NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outbound_clicks NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_3s_views NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS thruplays NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p25 NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p50 NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p75 NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p100 NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Conteúdo do criativo de cada anúncio
ALTER TABLE meta_ads
  ADD COLUMN IF NOT EXISTS creative_title TEXT,
  ADD COLUMN IF NOT EXISTS creative_body TEXT,
  ADD COLUMN IF NOT EXISTS creative_cta VARCHAR(60),
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS video_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS url_tags TEXT,
  ADD COLUMN IF NOT EXISTS meta_created_time TIMESTAMPTZ;

-- Resumo do público do conjunto (idade, gênero, países, interesses, Advantage+)
ALTER TABLE meta_ad_sets
  ADD COLUMN IF NOT EXISTS targeting_summary JSONB;

-- Consultas do ranking por período e nível
CREATE INDEX IF NOT EXISTS idx_meta_insights_level_date ON meta_insights (entity_level, date_start, is_demo);
