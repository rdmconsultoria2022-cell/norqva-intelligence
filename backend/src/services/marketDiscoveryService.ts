import crypto from 'crypto';

export interface ProvenanceField<T> {
  value: T;
  provenance: 'OBSERVED' | 'DERIVED' | 'INFERRED' | 'UNKNOWN' | 'MOCK_DATA' | 'URL_DERIVED';
  source?: string;
  raw_evidence_available: boolean;
  notes?: string;
}

export interface LiveEvidenceContract {
  source_type: 'META_AD_LIBRARY_WEB_MANUAL' | 'VERIFIED_OPERATOR_INGESTION' | 'META_GRAPH_API_OFFICIAL';
  source_identifier: string; // Ad Library ID
  source_url_or_official_reference: string;
  capture_timestamp: string; // ISO-8601 UTC
  capture_method: 'OPERATOR_VERIFIED_INGESTION';
  operator_confirmed: boolean;
  raw_capture_payload: {
    page_name: string;
    start_date: string;
    platforms: string[];
    media_type: 'VIDEO' | 'IMAGE' | 'CAROUSEL';
    primary_text: string;
    headline: string;
    cta_text: string;
    destination_url: string | null;
    explicit_price?: string | null;
  };
  evidence_hash: string; // SHA-256
}

export interface AdRecord {
  id: string; // Ad Library ID
  query_match: string;
  is_demo: boolean;
  evidence_contract: LiveEvidenceContract | null;
  raw_capture_payload: any | null;
  capture_timestamp: string | null;
  
  // Platform & Advertiser
  advertiser_name: ProvenanceField<string>;
  ad_library_url: ProvenanceField<string>;
  status: ProvenanceField<'ACTIVE' | 'INACTIVE'>;
  observed_start_date: ProvenanceField<string>;
  observed_end_date: ProvenanceField<string | null>;
  platforms: ProvenanceField<string[]>;
  media_type: ProvenanceField<'VIDEO' | 'IMAGE' | 'CAROUSEL'>;
  media_url?: ProvenanceField<string>;

  // Copy & Creative
  primary_text: ProvenanceField<string>;
  headline: ProvenanceField<string>;
  cta_button: ProvenanceField<string>;
  landing_destination_url: ProvenanceField<string | null>;
  observed_longevity_days: ProvenanceField<number>;

  // Product & Offer Analysis
  detected_product: ProvenanceField<string>;
  detected_category: ProvenanceField<string>;
  detected_offer: ProvenanceField<string>;
  detected_price: ProvenanceField<string | null>;

  // Qualitative Analysis
  creative_angle: ProvenanceField<string>;
  hook_type: ProvenanceField<string>;
  core_promise: ProvenanceField<string>;
  proof_mechanism: ProvenanceField<string>;
  cta_strategy: ProvenanceField<string>;

  // Commercial Signals & Risks
  positive_signals: string[];
  risks: string[];
  missing_evidence: string[];

  // Unobserved Competitor Metrics (UNKNOWN)
  competitor_spend: ProvenanceField<string | null>;
  competitor_cac: ProvenanceField<string | null>;
  competitor_roas: ProvenanceField<string | null>;
  competitor_sales_count: ProvenanceField<string | null>;

  // Scores
  market_signal_score: number;
  creative_signal_score: number;
  offer_signal_score: number;
  execution_feasibility_score: number;
  evidence_confidence: number;
  norqva_opportunity_score: number;
  opportunity_rank: number;
}

export interface OpportunityCluster {
  cluster_id: string;
  category_name: string;
  query_key: string;
  total_ads_observed: number;
  unique_advertisers_count: number;
  format_breakdown: { video: number; image: number; carousel: number };
  longest_observed_longevity_days: number;
  average_opportunity_score: number;
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW';
  top_ad_id: string;
  ads: AdRecord[];
}

export const SOURCE_CAPABILITY_PROBE = [
  {
    source_name: "Meta Graph API (/ads_archive)",
    access_method: "Official REST API (App Token + ID Verification)",
    authorized: true,
    country_coverage: "EU, UK (Commercial) | Global (Political / Social Issues)",
    commercial_ad_coverage: "UNSUPPORTED for Brazil commercial ads. Supported for EU/UK under DSA regulations.",
    available_fields: [
      "ad_library_id",
      "ad_creation_time",
      "ad_delivery_start_time",
      "page_id",
      "page_name",
      "ad_creative_bodies",
      "ad_creative_link_titles",
      "ad_creative_link_descriptions",
      "publisher_platforms"
    ],
    limitations: "Commercial ads in Brazil are NOT returned by the official API; no spend, conversion or sales data for commercial ads.",
    reliability: "HIGH for EU/UK/Political; ZERO for Brazilian commercial ads.",
    status: "PARTIALLY_SUPPORTED"
  },
  {
    source_name: "Meta Ad Library Public Web Interface (Web UI)",
    access_method: "Public Web Browser (Manual Navigation)",
    authorized: true,
    country_coverage: "Brazil (BR) + Worldwide",
    commercial_ad_coverage: "anúncios comerciais ativos disponibilizados publicamente pela Meta Ad Library, sujeitos às regras, disponibilidade e atualização da própria plataforma.",
    available_fields: [
      "ad_library_id",
      "page_name",
      "start_date",
      "platforms",
      "media_preview_asset",
      "primary_text",
      "headline",
      "cta_button_text",
      "landing_destination_url"
    ],
    limitations: "Automated scraping violates Meta Terms of Service; manual/assisted inspection is 100% compliant; zero private financial metrics.",
    reliability: "HIGH for visual and structural ad inspection via operator verification.",
    status: "SUPPORTED (Assisted Ingestion / Hybrid)"
  },
  {
    source_name: "Third-Party AdSpy / Intelligence SaaS",
    access_method: "Proprietary Scraped Aggregator APIs",
    authorized: false,
    country_coverage: "Global / Selected countries",
    commercial_ad_coverage: "PARTIAL (Indexed historical ads)",
    available_fields: ["historical_creative", "estimated_longevity", "platform_tags"],
    limitations: "Fabricated / estimated revenue, ROAS, and orders that violate NORQVA Truthful Evidence Policy; high monthly API cost; volatile availability.",
    reliability: "LOW for commercial decision making; UNSUPPORTED for financial estimation.",
    status: "UNSUPPORTED"
  }
];

// PROTOTYPE MOCK FIXTURES (Explicitly classified as MOCK_DATA)
const PROTOTYPE_MOCK_ADS: AdRecord[] = [
  {
    id: "2105156463738036",
    query_match: "receitas italianas",
    is_demo: true,
    evidence_contract: null,
    raw_capture_payload: null,
    capture_timestamp: null,
    advertiser_name: { value: "Chef Roberto — Cucina Autentica", provenance: "MOCK_DATA", raw_evidence_available: false },
    ad_library_url: { value: "https://www.facebook.com/ads/library/?id=2105156463738036", provenance: "MOCK_DATA", raw_evidence_available: false },
    status: { value: "ACTIVE", provenance: "MOCK_DATA", raw_evidence_available: false },
    observed_start_date: { value: "2026-06-12", provenance: "MOCK_DATA", raw_evidence_available: false },
    observed_end_date: { value: null, provenance: "MOCK_DATA", raw_evidence_available: false },
    platforms: { value: ["Instagram", "Facebook"], provenance: "MOCK_DATA", raw_evidence_available: false },
    media_type: { value: "VIDEO", provenance: "MOCK_DATA", raw_evidence_available: false },
    primary_text: {
      value: "Descubra os segredos da verdadeira massa italiana fresca feita em casa, sem máquinas caras. Domine 28 receitas clássicas de trattoria direto na sua cozinha.",
      provenance: "MOCK_DATA",
      raw_evidence_available: false
    },
    headline: { value: "Guia Completo de Massas & Molhos Italianos", provenance: "MOCK_DATA", raw_evidence_available: false },
    cta_button: { value: "Saiba Mais", provenance: "MOCK_DATA", raw_evidence_available: false },
    landing_destination_url: { value: "https://cucinaautentica.com.br/guia-massas", provenance: "MOCK_DATA", raw_evidence_available: false },
    observed_longevity_days: { value: 83, provenance: "DERIVED", raw_evidence_available: false, notes: "Calculado a partir de data sintética" },

    detected_product: { value: "E-book / Guia Digital de Culinária Italiana", provenance: "INFERRED", raw_evidence_available: false },
    detected_category: { value: "Culinária & Gastronomia", provenance: "INFERRED", raw_evidence_available: false },
    detected_offer: { value: "Acesso Imediato + Guia de Harmonização", provenance: "INFERRED", raw_evidence_available: false },
    detected_price: { value: "R$ 47,00", provenance: "MOCK_DATA", raw_evidence_available: false },

    creative_angle: { value: "Storytelling de Autoridade & Simplicidade Artesanal", provenance: "INFERRED", raw_evidence_available: false },
    hook_type: { value: "Massa fresca cortada no cilindro manual", provenance: "INFERRED", raw_evidence_available: false },
    core_promise: { value: "Resultado de trattoria com ingredientes simples", provenance: "INFERRED", raw_evidence_available: false },
    proof_mechanism: { value: "Demonstração técnica passo a passo", provenance: "INFERRED", raw_evidence_available: false },
    cta_strategy: { value: "Desconto de Lançamento", provenance: "INFERRED", raw_evidence_available: false },

    positive_signals: ["Longevidade sintética de benchmark (83 dias)", "Modelo de criativo em vídeo de alta retenção"],
    risks: ["Registro MOCK: Requer substituição por evidência live ingerida pelo operador"],
    missing_evidence: ["Captura primária de rede não anexada", "CAC e ROAS reais desconhecidos"],

    competitor_spend: { value: null, provenance: "UNKNOWN", raw_evidence_available: false },
    competitor_cac: { value: null, provenance: "UNKNOWN", raw_evidence_available: false },
    competitor_roas: { value: null, provenance: "UNKNOWN", raw_evidence_available: false },
    competitor_sales_count: { value: null, provenance: "UNKNOWN", raw_evidence_available: false },

    market_signal_score: 88,
    creative_signal_score: 92,
    offer_signal_score: 85,
    execution_feasibility_score: 95,
    evidence_confidence: 65,
    norqva_opportunity_score: 82,
    opportunity_rank: 1
  }
];

// LIVE INGESTED STORE (Stores records with verified operator primary evidence)
let LIVE_INGESTED_ADS_STORE: AdRecord[] = [];

let TEST_QUEUE_STORE: Array<{
  queue_id: string;
  ad_id: string;
  opportunity_title: string;
  category: string;
  score: number;
  added_at: string;
  notes: string;
}> = [];

export class MarketDiscoveryService {
  public static getCapabilityProbe() {
    return {
      timestamp: new Date().toISOString(),
      policy: "READ ONLY — ZERO META WRITE — TRUTHFUL PROVENANCE MODEL",
      sources: SOURCE_CAPABILITY_PROBE,
      live_evidence_audit: {
        total_live_records: LIVE_INGESTED_ADS_STORE.length,
        total_mock_records: PROTOTYPE_MOCK_ADS.length,
        status: LIVE_INGESTED_ADS_STORE.length > 0 ? "HYBRID_LIVE_AND_MOCK_DATA" : "ASSISTED_LIVE_INGESTION_READY_FOR_REAL_EVIDENCE",
        primary_evidence_rule: "Nenhum dado recebe OBSERVED sem confirmação e evidência do operador com hash SHA-256."
      }
    };
  }

  // GATE 07.7D: Deterministic Source & URL/ID Resolver (Phase A: Read-Only / Provisional)
  public static resolveSourceUrlOrId(input: string) {
    if (!input || input.trim() === '') {
      throw new Error("Entrada inválida: forneça uma URL da Meta Ad Library ou um Ad Library ID.");
    }

    const rawInput = input.trim();
    let parsedId = '';
    let parsedCountry = 'NOT_SPECIFIED';
    let parsedSearchType = '';
    let parsedMediaType = '';
    let parsedStatus = '';

    // Deterministic URL extraction
    if (rawInput.includes('id=')) {
      const match = rawInput.match(/id=([0-9]+)/);
      if (match) parsedId = match[1];
    } else if (/^[0-9]+$/.test(rawInput)) {
      parsedId = rawInput;
    } else if (rawInput.includes('/')) {
      const parts = rawInput.split('?')[0].split('/');
      const lastNumeric = parts.reverse().find(p => /^[0-9]+$/.test(p));
      if (lastNumeric) parsedId = lastNumeric;
    }

    if (!parsedId) {
      // Fallback extract numbers from string
      const match = rawInput.match(/([0-9]{10,20})/);
      if (match) parsedId = match[1];
    }

    if (!parsedId) {
      throw new Error("Não foi possível extrair um Ad Library ID numérico válido a partir da URL/entrada fornecida.");
    }

    // Extract exact URL parameters if present
    try {
      if (rawInput.startsWith('http')) {
        const urlObj = new URL(rawInput);
        const countryParam = urlObj.searchParams.get('country');
        if (countryParam !== null) {
          parsedCountry = countryParam;
        }
        parsedSearchType = urlObj.searchParams.get('search_type') || '';
        parsedMediaType = urlObj.searchParams.get('media_type') || '';
        parsedStatus = urlObj.searchParams.get('active_status') || '';
      }
    } catch (e) {
      // Not a full URL
    }

    const canonicalSourceReference = `https://www.facebook.com/ads/library/?id=${parsedId}`;

    return {
      resolution_status: "PARTIAL_MANUAL_REQUIRED",
      source_identifier: parsedId,
      canonical_source_reference: canonicalSourceReference,
      original_input: rawInput,
      scraping_used: false,
      db_mutated: false,
      record_ingested: false,
      observed_created: false,
      test_queue_mutated: false,

      auto_verified_fields: [
        {
          field: "ad_library_id",
          label: "Ad Library ID",
          value: parsedId,
          provenance: "URL_DERIVED",
          status: "AUTO_VERIFIED",
          notes: "Extraído deterministamente dos parâmetros da URL / entrada."
        },
        {
          field: "canonical_source_reference",
          label: "Referência Canônica da Fonte",
          value: canonicalSourceReference,
          provenance: "URL_DERIVED",
          status: "AUTO_VERIFIED",
          notes: "Link oficial padronizado para inspeção pública na Meta."
        },
        {
          field: "platform_ecosystem",
          label: "Ecossistema de Origem",
          value: "Meta Ad Library (Facebook / Instagram)",
          provenance: "URL_DERIVED",
          status: "AUTO_VERIFIED",
          notes: "Plataforma oficial pública de transparência da Meta."
        },
        {
          field: "country_context",
          label: "País / Jurisdição",
          value: parsedCountry,
          provenance: "URL_DERIVED",
          status: "AUTO_VERIFIED",
          notes: parsedCountry === 'NOT_SPECIFIED' 
            ? "Parâmetro country ausente na URL original." 
            : `Parâmetro country=${parsedCountry} extraído deterministicamente da URL sem inferência externa.`
        }
      ],

      manual_required_fields: [
        {
          field: "page_name",
          label: "Nome da Página / Anunciante",
          value: "",
          provenance: "OPERATOR_OBSERVED",
          status: "MANUAL_REQUIRED",
          reason: "Identidade comercial visível na página pública da Meta."
        },
        {
          field: "start_date",
          label: "Data de Início da Veiculação",
          value: "",
          provenance: "OPERATOR_OBSERVED",
          status: "MANUAL_REQUIRED",
          reason: "Data em que o anúncio começou a veicular na Meta Ad Library."
        },
        {
          field: "media_type",
          label: "Formato de Mídia",
          value: "VIDEO",
          provenance: "OPERATOR_OBSERVED",
          status: "MANUAL_REQUIRED",
          reason: "Classificação visual (Vídeo, Imagem, Carrossel) observada no criativo."
        },
        {
          field: "headline",
          label: "Headline / Título do Anúncio",
          value: "",
          provenance: "OPERATOR_OBSERVED",
          status: "MANUAL_REQUIRED",
          reason: "Título de chamada do anúncio presente no criativo."
        },
        {
          field: "primary_text",
          label: "Texto Principal (Primary Copy)",
          value: "",
          provenance: "OPERATOR_OBSERVED",
          status: "MANUAL_REQUIRED",
          reason: "Texto integral da cópia veiculada no anúncio."
        },
        {
          field: "cta_text",
          label: "Botão de Ação (CTA)",
          value: "Saiba Mais",
          provenance: "OPERATOR_OBSERVED",
          status: "MANUAL_REQUIRED",
          reason: "Texto do botão de chamada para ação (ex: Saiba Mais, Comprar Agora)."
        },
        {
          field: "destination_url",
          label: "URL de Destino (Landing Page)",
          value: "",
          provenance: "OPERATOR_OBSERVED",
          status: "MANUAL_REQUIRED",
          reason: "Página de vendas ou destino configurada no criativo."
        }
      ],

      unavailable_fields: [
        {
          field: "competitor_spend",
          label: "Gasto de Anúncios Concorrente",
          value: null,
          provenance: "UNKNOWN",
          status: "UNAVAILABLE",
          reason: "Métrica privada do anunciante não exposta para anúncios comerciais no Brasil."
        },
        {
          field: "competitor_cac",
          label: "CAC do Concorrente",
          value: null,
          provenance: "UNKNOWN",
          status: "UNAVAILABLE",
          reason: "Dado financeiro proprietário não mensurável externamente."
        },
        {
          field: "competitor_roas",
          label: "ROAS do Concorrente",
          value: null,
          provenance: "UNKNOWN",
          status: "UNAVAILABLE",
          reason: "Dado financeiro proprietário não mensurável externamente."
        },
        {
          field: "competitor_sales_count",
          label: "Volume Real de Vendas",
          value: null,
          provenance: "UNKNOWN",
          status: "UNAVAILABLE",
          reason: "Dado transacional do checkout do concorrente."
        }
      ],

      metrics: {
        total_auto_verified: 4,
        total_manual_required: 7,
        total_unavailable: 4,
        total_observable_fields: 11,
        human_fields_required: 7,
        automation_ratio: "4 / 11 (36.4%)",
        compliance_check: "100% CONFORME (Zero scraping, zero chamadas ilegítimas)"
      }
    };
  }

  public static ingestOperatorLiveAd(input: {
    source_url_or_id: string;
    page_name: string;
    start_date: string;
    platforms: string[];
    media_type: 'VIDEO' | 'IMAGE' | 'CAROUSEL';
    headline: string;
    primary_text: string;
    cta_text: string;
    destination_url?: string | null;
    explicit_price?: string | null;
    operator_confirmed: boolean;
    inferred_category?: string;
    inferred_angle?: string;
    inferred_hook?: string;
    inferred_promise?: string;
  }): AdRecord {
    if (!input.operator_confirmed) {
      throw new Error("CONFIRMAÇÃO OBRIGATÓRIA: O operador deve confirmar que inspecionou a página da Meta Ad Library antes de homologar como OBSERVED.");
    }

    if (!input.source_url_or_id || !input.page_name || !input.start_date || !input.primary_text) {
      throw new Error("Campos obrigatórios ausentes: source_url_or_id, page_name, start_date, primary_text.");
    }

    // Extract ID if URL is passed
    let adId = input.source_url_or_id.trim();
    if (adId.includes('id=')) {
      const match = adId.match(/id=([0-9]+)/);
      if (match) adId = match[1];
    } else if (adId.includes('/')) {
      const parts = adId.split('/');
      adId = parts[parts.length - 1] || parts[parts.length - 2];
    }

    const captureTimestamp = new Date().toISOString();
    
    // Construct Raw Payload for Evidence Hashing
    const rawPayload = {
      page_name: input.page_name.trim(),
      start_date: input.start_date.trim(),
      platforms: input.platforms,
      media_type: input.media_type,
      primary_text: input.primary_text.trim(),
      headline: (input.headline || '').trim(),
      cta_text: (input.cta_text || '').trim(),
      destination_url: input.destination_url ? input.destination_url.trim() : null,
      explicit_price: input.explicit_price ? input.explicit_price.trim() : null
    };

    const evidenceHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(rawPayload) + captureTimestamp + adId)
      .digest('hex');

    const evidenceContract: LiveEvidenceContract = {
      source_type: 'VERIFIED_OPERATOR_INGESTION',
      source_identifier: adId,
      source_url_or_official_reference: input.source_url_or_id.startsWith('http') 
        ? input.source_url_or_id 
        : `https://www.facebook.com/ads/library/?id=${adId}`,
      capture_timestamp: captureTimestamp,
      capture_method: 'OPERATOR_VERIFIED_INGESTION',
      operator_confirmed: true,
      raw_capture_payload: rawPayload,
      evidence_hash: evidenceHash
    };

    // Calculate DERIVED: Observed Longevity
    const startDateObj = new Date(input.start_date);
    const nowObj = new Date();
    const diffMs = nowObj.getTime() - startDateObj.getTime();
    const calculatedLongevity = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

    // Calculate INFERRED: Sub-scores & Opportunity Score
    const marketScore = 85;
    const creativeScore = input.media_type === 'VIDEO' ? 90 : (input.media_type === 'CAROUSEL' ? 82 : 75);
    const offerScore = input.explicit_price ? 85 : 70;
    const feasibilityScore = 90;
    const confidence = 85; // High confidence due to verified operator primary evidence

    const baseScore = (marketScore * 0.25) + (creativeScore * 0.25) + (offerScore * 0.25) + (feasibilityScore * 0.25);
    const opportunityScore = Math.round(baseScore * Math.pow(confidence / 100, 0.3));

    const newLiveRecord: AdRecord = {
      id: adId,
      query_match: input.inferred_category || 'mercado verificado',
      is_demo: false, // VERIFIED LIVE RECORD
      evidence_contract: evidenceContract,
      raw_capture_payload: rawPayload,
      capture_timestamp: captureTimestamp,

      advertiser_name: { value: input.page_name, provenance: 'OBSERVED', raw_evidence_available: true, source: 'Meta Ad Library Web' },
      ad_library_url: { value: evidenceContract.source_url_or_official_reference, provenance: 'OBSERVED', raw_evidence_available: true },
      status: { value: 'ACTIVE', provenance: 'OBSERVED', raw_evidence_available: true },
      observed_start_date: { value: input.start_date, provenance: 'OBSERVED', raw_evidence_available: true },
      observed_end_date: { value: null, provenance: 'OBSERVED', raw_evidence_available: true },
      platforms: { value: input.platforms.length > 0 ? input.platforms : ['Facebook', 'Instagram'], provenance: 'OBSERVED', raw_evidence_available: true },
      media_type: { value: input.media_type, provenance: 'OBSERVED', raw_evidence_available: true },

      primary_text: { value: input.primary_text, provenance: 'OBSERVED', raw_evidence_available: true },
      headline: { value: input.headline || 'Sem título explícito', provenance: 'OBSERVED', raw_evidence_available: true },
      cta_button: { value: input.cta_text || 'Saiba Mais', provenance: 'OBSERVED', raw_evidence_available: true },
      landing_destination_url: { value: input.destination_url || null, provenance: 'OBSERVED', raw_evidence_available: !!input.destination_url },
      observed_longevity_days: { value: calculatedLongevity, provenance: 'DERIVED', raw_evidence_available: true, notes: `Calculado: ${captureTimestamp.split('T')[0]} - ${input.start_date}` },

      detected_product: { value: input.inferred_category || 'Produto Comercial Identificado', provenance: 'INFERRED', raw_evidence_available: true },
      detected_category: { value: input.inferred_category || 'Comércio & Infoprodutos', provenance: 'INFERRED', raw_evidence_available: true },
      detected_offer: { value: 'Oferta Comercial Ingerida', provenance: 'INFERRED', raw_evidence_available: true },
      detected_price: { value: input.explicit_price || null, provenance: input.explicit_price ? 'OBSERVED' : 'UNKNOWN', raw_evidence_available: !!input.explicit_price },

      creative_angle: { value: input.inferred_angle || 'Ângulo de Solução Direta', provenance: 'INFERRED', raw_evidence_available: true },
      hook_type: { value: input.inferred_hook || 'Gancho de Curiosidade / Demonstração', provenance: 'INFERRED', raw_evidence_available: true },
      core_promise: { value: input.inferred_promise || 'Promessa Central de Transformação', provenance: 'INFERRED', raw_evidence_available: true },
      proof_mechanism: { value: 'Demonstração de Produto / Autoridade', provenance: 'INFERRED', raw_evidence_available: true },
      cta_strategy: { value: 'Chamada Direta para Ação', provenance: 'INFERRED', raw_evidence_available: true },

      positive_signals: [
        `Longevidade real observada de ${calculatedLongevity} dias`,
        `Formato verificado: ${input.media_type}`,
        `Evidência primária criptografada (SHA-256: ${evidenceHash.substring(0, 12)}...)`
      ],
      risks: [
        "Métricas de performance financeira permanecem estritamente UNKNOWN (privadas do concorrente)"
      ],
      missing_evidence: [
        "Gasto diário de anúncios não disponível na Meta",
        "CAC e ROAS reais desconhecidos",
        "Volume real de vendas não auditável externamente"
      ],

      competitor_spend: { value: null, provenance: 'UNKNOWN', raw_evidence_available: false },
      competitor_cac: { value: null, provenance: 'UNKNOWN', raw_evidence_available: false },
      competitor_roas: { value: null, provenance: 'UNKNOWN', raw_evidence_available: false },
      competitor_sales_count: { value: null, provenance: 'UNKNOWN', raw_evidence_available: false },

      market_signal_score: marketScore,
      creative_signal_score: creativeScore,
      offer_signal_score: offerScore,
      execution_feasibility_score: feasibilityScore,
      evidence_confidence: confidence,
      norqva_opportunity_score: opportunityScore,
      opportunity_rank: LIVE_INGESTED_ADS_STORE.length + 1
    };

    // Remove existing if matching ID
    LIVE_INGESTED_ADS_STORE = LIVE_INGESTED_ADS_STORE.filter(a => a.id !== adId);
    LIVE_INGESTED_ADS_STORE.unshift(newLiveRecord);

    return newLiveRecord;
  }

  public static getLiveIngestedAds(): AdRecord[] {
    return LIVE_INGESTED_ADS_STORE;
  }

  public static searchAds(filters: {
    query?: string;
    country?: string;
    status?: string;
    media_type?: string;
    min_longevity?: number;
    sort?: string;
  }) {
    // Combine Live records and Mock records (clearly partitioned)
    let allRecords = [...LIVE_INGESTED_ADS_STORE, ...PROTOTYPE_MOCK_ADS];

    if (filters.query && filters.query.trim() !== '') {
      const q = filters.query.toLowerCase().trim();
      allRecords = allRecords.filter(ad => 
        ad.query_match.toLowerCase().includes(q) ||
        ad.advertiser_name.value.toLowerCase().includes(q) ||
        ad.headline.value.toLowerCase().includes(q) ||
        ad.primary_text.value.toLowerCase().includes(q)
      );
    }

    if (filters.media_type && filters.media_type !== 'ALL') {
      allRecords = allRecords.filter(ad => ad.media_type.value === filters.media_type);
    }

    if (filters.min_longevity && Number(filters.min_longevity) > 0) {
      const minL = Number(filters.min_longevity);
      allRecords = allRecords.filter(ad => ad.observed_longevity_days.value >= minL);
    }

    if (filters.sort === 'longevity_desc') {
      allRecords.sort((a, b) => b.observed_longevity_days.value - a.observed_longevity_days.value);
    } else if (filters.sort === 'score_desc') {
      allRecords.sort((a, b) => b.norqva_opportunity_score - a.norqva_opportunity_score);
    }

    return {
      total_found: allRecords.length,
      live_records_count: LIVE_INGESTED_ADS_STORE.length,
      mock_records_count: PROTOTYPE_MOCK_ADS.length,
      filters_applied: filters,
      ads: allRecords
    };
  }

  public static getClusters(): OpportunityCluster[] {
    const allRecords = [...LIVE_INGESTED_ADS_STORE, ...PROTOTYPE_MOCK_ADS];
    const groups: { [key: string]: AdRecord[] } = {
      'Culinária & Gastronomia': [],
      'Artesanato & Hobbies': [],
      'Outras Oportunidades': []
    };

    allRecords.forEach(ad => {
      const cat = ad.detected_category.value;
      if (cat.includes('Culinária') || cat.includes('Gastronomia')) {
        groups['Culinária & Gastronomia'].push(ad);
      } else if (cat.includes('Artesanato') || cat.includes('Crochê')) {
        groups['Artesanato & Hobbies'].push(ad);
      } else {
        groups['Outras Oportunidades'].push(ad);
      }
    });

    const clusters: OpportunityCluster[] = Object.keys(groups)
      .filter(k => groups[k].length > 0)
      .map((k, idx) => ({
        cluster_id: `CLUS-0${idx + 1}`,
        category_name: k,
        query_key: k.toLowerCase(),
        total_ads_observed: groups[k].length,
        unique_advertisers_count: new Set(groups[k].map(a => a.advertiser_name.value)).size,
        format_breakdown: {
          video: groups[k].filter(a => a.media_type.value === 'VIDEO').length,
          image: groups[k].filter(a => a.media_type.value === 'IMAGE').length,
          carousel: groups[k].filter(a => a.media_type.value === 'CAROUSEL').length
        },
        longest_observed_longevity_days: Math.max(...groups[k].map(a => a.observed_longevity_days.value)),
        average_opportunity_score: Math.round(groups[k].reduce((acc, a) => acc + a.norqva_opportunity_score, 0) / (groups[k].length || 1)),
        confidence_level: groups[k].some(a => !a.is_demo) ? 'HIGH' : 'MEDIUM',
        top_ad_id: groups[k][0]?.id || 'N/A',
        ads: groups[k]
      }));

    return clusters;
  }

  public static getAdById(adId: string) {
    const found = [...LIVE_INGESTED_ADS_STORE, ...PROTOTYPE_MOCK_ADS].find(a => a.id === adId);
    return found || null;
  }

  public static getTestQueue() {
    return TEST_QUEUE_STORE;
  }

  public static addToTestQueue(item: { ad_id: string; notes?: string }) {
    const ad = this.getAdById(item.ad_id);
    if (!ad) throw new Error("Anúncio não localizado.");

    const existing = TEST_QUEUE_STORE.find(q => q.ad_id === item.ad_id);
    if (existing) return existing;

    const entry = {
      queue_id: `QUEUE-${Date.now()}`,
      ad_id: ad.id,
      opportunity_title: ad.headline.value,
      category: ad.detected_category.value,
      score: ad.norqva_opportunity_score,
      added_at: new Date().toISOString(),
      notes: item.notes || "Adicionado via painel Market Discovery para revisão humana."
    };

    TEST_QUEUE_STORE.push(entry);
    return entry;
  }

  public static removeFromTestQueue(queueId: string) {
    TEST_QUEUE_STORE = TEST_QUEUE_STORE.filter(q => q.queue_id !== queueId && q.ad_id !== queueId);
    return { success: true, remaining: TEST_QUEUE_STORE.length };
  }
}
