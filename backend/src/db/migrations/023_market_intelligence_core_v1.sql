-- Migration 023: NORQVA Market Intelligence Core V1 (7 MVP Tables)

-- 1. market_evidence (Imutabilidade & Auditoria de Proveniência)
CREATE TABLE IF NOT EXISTS market_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type VARCHAR(50) NOT NULL DEFAULT 'META_AD_LIBRARY_WEB',
    source_url TEXT NOT NULL,
    capture_method VARCHAR(50) NOT NULL CHECK (capture_method IN ('OPERATOR_ASSISTED', 'MANUAL_AUDIT', 'OFFICIAL_API')),
    content_hash VARCHAR(64) NOT NULL,
    captured_payload JSONB NOT NULL,
    captured_by UUID REFERENCES users(id) ON DELETE SET NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_market_evidence_content_hash UNIQUE (content_hash)
);

CREATE INDEX IF NOT EXISTS idx_market_evidence_observed ON market_evidence(observed_at);
CREATE INDEX IF NOT EXISTS idx_market_evidence_capture_method ON market_evidence(capture_method);

-- 2. market_advertisers (Anunciantes / Páginas Normalizadas)
CREATE TABLE IF NOT EXISTS market_advertisers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id VARCHAR(100) NOT NULL,
    page_name VARCHAR(255) NOT NULL,
    page_url TEXT,
    country VARCHAR(10) NOT NULL DEFAULT 'BR',
    category VARCHAR(100),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_market_advertisers_page_id UNIQUE (page_id)
);

CREATE INDEX IF NOT EXISTS idx_market_advertisers_category ON market_advertisers(category);
CREATE INDEX IF NOT EXISTS idx_market_advertisers_active ON market_advertisers(is_active);

-- 3. market_offers (Ofertas / Produtos Comerciais do Concorrente)
CREATE TABLE IF NOT EXISTS market_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advertiser_id UUID NOT NULL REFERENCES market_advertisers(id) ON DELETE CASCADE,
    offer_name VARCHAR(255) NOT NULL,
    offer_category VARCHAR(100) NOT NULL,
    destination_url TEXT NOT NULL,
    observed_price NUMERIC(12, 2),
    currency VARCHAR(10) NOT NULL DEFAULT 'BRL',
    offer_type VARCHAR(50) NOT NULL DEFAULT 'DIGITAL_PRODUCT' 
        CHECK (offer_type IN ('DIGITAL_PRODUCT', 'EBOOK', 'COURSE', 'COMMUNITY', 'SOFTWARE', 'BUNDLE', 'PHYSICAL', 'OTHER')),
    evidence_id UUID REFERENCES market_evidence(id) ON DELETE SET NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_offers_advertiser ON market_offers(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_market_offers_category ON market_offers(offer_category);

-- 4. market_ads (Peças de Anúncio da Meta Ad Library)
CREATE TABLE IF NOT EXISTS market_ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_library_id VARCHAR(100) NOT NULL,
    advertiser_id UUID NOT NULL REFERENCES market_advertisers(id) ON DELETE CASCADE,
    offer_id UUID REFERENCES market_offers(id) ON DELETE SET NULL,
    
    primary_text TEXT,
    headline TEXT,
    description TEXT,
    cta VARCHAR(50),
    
    ad_start_date DATE,
    ad_end_date DATE,
    active_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' 
        CHECK (active_status IN ('ACTIVE', 'INACTIVE', 'UNKNOWN')),
    
    publisher_platforms TEXT[] NOT NULL DEFAULT '{}',
    snapshot_url TEXT,
    destination_url TEXT,
    multiple_versions_observed BOOLEAN NOT NULL DEFAULT FALSE,
    
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    evidence_id UUID REFERENCES market_evidence(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_market_ads_library_id UNIQUE (ad_library_id)
);

CREATE INDEX IF NOT EXISTS idx_market_ads_advertiser ON market_ads(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_market_ads_offer ON market_ads(offer_id);
CREATE INDEX IF NOT EXISTS idx_market_ads_status ON market_ads(active_status);
CREATE INDEX IF NOT EXISTS idx_market_ads_dates ON market_ads(ad_start_date, first_seen_at, last_seen_at);

-- 5. market_observations (Série Temporal de Observação Diária & Versionamento de Conteúdo)
CREATE TABLE IF NOT EXISTS market_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_id UUID NOT NULL REFERENCES market_ads(id) ON DELETE CASCADE,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    observed_date DATE NOT NULL DEFAULT CURRENT_DATE,
    observed_status VARCHAR(20) NOT NULL CHECK (observed_status IN ('ACTIVE', 'INACTIVE')),
    
    content_fingerprint VARCHAR(64) NOT NULL,
    content_changed BOOLEAN NOT NULL DEFAULT FALSE,
    change_fields TEXT[] NOT NULL DEFAULT '{}',
    
    evidence_id UUID NOT NULL REFERENCES market_evidence(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_market_observations_ad_date UNIQUE (ad_id, observed_date)
);

CREATE INDEX IF NOT EXISTS idx_market_obs_ad_status ON market_observations(ad_id, observed_status);
CREATE INDEX IF NOT EXISTS idx_market_obs_fingerprint ON market_observations(ad_id, content_fingerprint);
CREATE INDEX IF NOT EXISTS idx_market_obs_changed ON market_observations(content_changed);

-- 6. market_creatives (Decomposição Semântica & Provenance Granular)
CREATE TABLE IF NOT EXISTS market_creatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_id UUID NOT NULL REFERENCES market_ads(id) ON DELETE CASCADE,
    
    -- Dados Observados
    creative_type VARCHAR(20) NOT NULL CHECK (creative_type IN ('VIDEO', 'IMAGE', 'CAROUSEL', 'TEXT_ONLY')),
    aspect_ratio VARCHAR(20) DEFAULT '9:16',
    duration_seconds INTEGER,
    asset_reference TEXT,
    
    -- Dados Classificados (Top-level queryable)
    hook_text TEXT,
    hook_visual TEXT,
    angle VARCHAR(100),
    promise TEXT,
    pain_point TEXT,
    desire TEXT,
    mechanism TEXT,
    cta_type VARCHAR(50),
    
    -- Classifications Metadata Granular (JSONB Provenance)
    classifications JSONB NOT NULL DEFAULT '{}',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_creatives_ad ON market_creatives(ad_id);
CREATE INDEX IF NOT EXISTS idx_market_creatives_type ON market_creatives(creative_type);
CREATE INDEX IF NOT EXISTS idx_market_creatives_angle ON market_creatives(angle);

-- 7. market_hypotheses (Governança de Hipóteses & Closed-Loop)
CREATE TABLE IF NOT EXISTS market_hypotheses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    human_id VARCHAR(50) NOT NULL,
    category VARCHAR(100) NOT NULL,
    hypothesis_title VARCHAR(255) NOT NULL,
    rationale TEXT NOT NULL,
    
    reference_creative_id UUID REFERENCES market_creatives(id) ON DELETE SET NULL,
    reference_offer_id UUID REFERENCES market_offers(id) ON DELETE SET NULL,
    supporting_signals JSONB NOT NULL DEFAULT '{}',
    
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' 
        CHECK (status IN ('DRAFT', 'APPROVED_FOR_TEST', 'IN_TESTING', 'VALIDATED', 'REJECTED', 'ABANDONED')),
    status_reason VARCHAR(100),
    
    -- Critérios de Validação Fail-Closed (Default '{}' sem thresholds implícitos)
    validation_criteria JSONB NOT NULL DEFAULT '{}',
    
    -- Evidência Real Atingida no Teste Próprio NORQVA
    evaluation_evidence JSONB NOT NULL DEFAULT '{}',
    
    norqva_creative_id UUID,
    norqva_campaign_id UUID,
    validation_notes TEXT,
    
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_market_hypotheses_human_id UNIQUE (human_id)
);

CREATE INDEX IF NOT EXISTS idx_market_hypotheses_status ON market_hypotheses(status);
CREATE INDEX IF NOT EXISTS idx_market_hypotheses_category ON market_hypotheses(category);
