import { describe, it, expect } from 'vitest';
import {
  resolveOrderAttribution,
  calculatePerformanceMetrics,
  MetaHierarchyContext
} from '../services/attribution/deterministicAttributionResolver';

describe('NORQVA — Phase B1: Deterministic Attribution Foundation Test Suite (A - O)', () => {
  const sampleHierarchy: MetaHierarchyContext = {
    campaigns: [
      { id: 'camp-db-001', meta_campaign_id: '120249269452820001', name: 'Campanha Trattoria Alpha', status: 'ACTIVE' },
      { id: 'camp-db-002', meta_campaign_id: '120249269452820002', name: 'Campanha Trattoria Beta', status: 'ACTIVE' },
      { id: 'camp-db-003', meta_campaign_id: '120249269452820003', name: 'Campanha Duplicada', status: 'ACTIVE' },
      { id: 'camp-db-004', meta_campaign_id: '120249269452820004', name: 'Campanha Duplicada', status: 'PAUSED' }
    ],
    adSets: [
      { id: 'adset-db-001', meta_adset_id: '2384910001', name: 'Conjunto Brasil 25-45', campaign_id: 'camp-db-001', meta_campaign_id: '120249269452820001' },
      { id: 'adset-db-002', meta_adset_id: '2384910002', name: 'Conjunto SP Retargeting', campaign_id: 'camp-db-002', meta_campaign_id: '120249269452820002' }
    ],
    ads: [
      { id: 'ad-db-001', meta_ad_id: '3495810001', name: 'Anuncio Video Pitch V1', adset_id: 'adset-db-001', meta_adset_id: '2384910001', campaign_id: 'camp-db-001', meta_campaign_id: '120249269452820001' },
      { id: 'ad-db-002', meta_ad_id: '3495810002', name: 'Anuncio Carrossel V2', adset_id: 'adset-db-002', meta_adset_id: '2384910002', campaign_id: 'camp-db-002', meta_campaign_id: '120249269452820002' }
    ]
  };

  // A. Direct campaign_id valid
  it('Scenario A: resolves LEVEL 2 Direct Campaign ID with high confidence', () => {
    const order = {
      id: 'ord-001',
      total_amount: '47.00',
      attribution_metadata: { campaign_id: '120249269452820001' }
    };
    const result = resolveOrderAttribution(order, sampleHierarchy);

    expect(result.attribution_status).toBe('ATTRIBUTED');
    expect(result.attribution_method).toBe('DIRECT_CAMPAIGN_ID');
    expect(result.confidence).toBe('HIGH');
    expect(result.meta_campaign_id).toBe('120249269452820001');
    expect(result.campaign_name).toBe('Campanha Trattoria Alpha');
    expect(result.matched_campaign_db_id).toBe('camp-db-001');
    expect(result.is_financially_creditable).toBe(true);
  });

  // B. Direct ad_id valid
  it('Scenario B: resolves LEVEL 1 Direct Ad ID and cascades to AdSet and Campaign', () => {
    const order = {
      id: 'ord-002',
      total_amount: '47.00',
      attribution_metadata: { ad_id: '3495810001' }
    };
    const result = resolveOrderAttribution(order, sampleHierarchy);

    expect(result.attribution_status).toBe('ATTRIBUTED');
    expect(result.attribution_method).toBe('DIRECT_AD_ID');
    expect(result.confidence).toBe('HIGH');
    expect(result.meta_ad_id).toBe('3495810001');
    expect(result.matched_ad_db_id).toBe('ad-db-001');
    expect(result.meta_adset_id).toBe('2384910001');
    expect(result.matched_adset_db_id).toBe('adset-db-001');
    expect(result.meta_campaign_id).toBe('120249269452820001');
    expect(result.matched_campaign_db_id).toBe('camp-db-001');
    expect(result.is_financially_creditable).toBe(true);
  });

  // C. utm_campaign containing Meta campaign ID
  it('Scenario C: resolves LEVEL 3 Exact UTM Meta Campaign ID with high confidence', () => {
    const order = {
      id: 'ord-003',
      total_amount: '47.00',
      utm_source: 'meta',
      utm_medium: 'cpc',
      utm_campaign: '120249269452820002'
    };
    const result = resolveOrderAttribution(order, sampleHierarchy);

    expect(result.attribution_status).toBe('ATTRIBUTED');
    expect(result.attribution_method).toBe('UTM_CAMPAIGN_ID');
    expect(result.confidence).toBe('HIGH');
    expect(result.meta_campaign_id).toBe('120249269452820002');
    expect(result.campaign_name).toBe('Campanha Trattoria Beta');
    expect(result.matched_campaign_db_id).toBe('camp-db-002');
    expect(result.is_financially_creditable).toBe(true);
  });

  // D. utm_campaign containing exact name
  it('Scenario D: resolves LEVEL 4 Exact Campaign Name with medium confidence when match is unique', () => {
    const order = {
      id: 'ord-004',
      total_amount: '47.00',
      utm_source: 'meta',
      utm_medium: 'cpc',
      utm_campaign: 'Campanha Trattoria Alpha'
    };
    const result = resolveOrderAttribution(order, sampleHierarchy);

    expect(result.attribution_status).toBe('ATTRIBUTED');
    expect(result.attribution_method).toBe('UTM_CAMPAIGN_NAME');
    expect(result.confidence).toBe('MEDIUM');
    expect(result.meta_campaign_id).toBe('120249269452820001');
    expect(result.campaign_name).toBe('Campanha Trattoria Alpha');
    expect(result.matched_campaign_db_id).toBe('camp-db-001');
    expect(result.is_financially_creditable).toBe(true);
  });

  // E. Missing parameters (safe handling)
  it('Scenario E: gracefully handles missing optional attribution parameters without throwing', () => {
    const order = {
      id: 'ord-005',
      total_amount: '47.00',
      utm_source: 'meta',
      utm_campaign: null,
      attribution_metadata: null
    };
    const result = resolveOrderAttribution(order, sampleHierarchy);

    expect(result.attribution_status).toBe('UNATTRIBUTED');
    expect(result.attribution_method).toBe('NONE');
    expect(result.is_financially_creditable).toBe(false);
  });

  // F. Non-existent campaign
  it('Scenario F: marks order as UNATTRIBUTED when campaign ID does not match any known Meta campaign', () => {
    const order = {
      id: 'ord-006',
      total_amount: '47.00',
      utm_campaign: 'non_existent_999999999'
    };
    const result = resolveOrderAttribution(order, sampleHierarchy);

    expect(result.attribution_status).toBe('UNATTRIBUTED');
    expect(result.attribution_method).toBe('NONE');
    expect(result.is_financially_creditable).toBe(false);
  });

  // G. Ambiguous matches (multiple campaigns matching same name or conflicting levels)
  it('Scenario G: marks order as AMBIGUOUS with zero financial credit when name matches multiple campaigns or IDs conflict', () => {
    // Case 1: Name matches two campaigns (camp-db-003 and camp-db-004)
    const ambiguousNameOrder = {
      id: 'ord-007a',
      total_amount: '47.00',
      utm_campaign: 'Campanha Duplicada'
    };
    const result1 = resolveOrderAttribution(ambiguousNameOrder, sampleHierarchy);

    expect(result1.attribution_status).toBe('AMBIGUOUS');
    expect(result1.attribution_method).toBe('NONE');
    expect(result1.is_financially_creditable).toBe(false);

    // Case 2: Conflict between direct campaign_id and utm_campaign pointing to different campaigns
    const conflictOrder = {
      id: 'ord-007b',
      total_amount: '47.00',
      utm_campaign: '120249269452820001',
      attribution_metadata: { campaign_id: '120249269452820002' }
    };
    const result2 = resolveOrderAttribution(conflictOrder, sampleHierarchy);

    expect(result2.attribution_status).toBe('AMBIGUOUS');
    expect(result2.attribution_method).toBe('NONE');
    expect(result2.is_financially_creditable).toBe(false);
  });

  // H. Organic traffic
  it('Scenario H: marks order as ORGANIC when zero UTMs, fbclid, or attribution metadata are present', () => {
    const order = {
      id: 'ord-008',
      total_amount: '47.00',
      visitor_id: 'vis-123',
      session_id: 'ses-456',
      fbclid: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      attribution_metadata: null
    };
    const result = resolveOrderAttribution(order, sampleHierarchy);

    expect(result.attribution_status).toBe('ORGANIC');
    expect(result.attribution_method).toBe('NONE');
    expect(result.confidence).toBe('NONE');
    expect(result.is_financially_creditable).toBe(false);
  });

  // I. Unpaid order
  it('Scenario I: performance metrics calculation only accepts paid orders and excludes unpaid orders from revenue/CAC', () => {
    const metrics = calculatePerformanceMetrics({
      spend: 100.00,
      revenue: 200.00,
      paidOrders: 4,
      uniqueVisitors: 100
    });

    expect(metrics.spend).toBe(100.00);
    expect(metrics.revenue).toBe(200.00);
    expect(metrics.paidOrders).toBe(4);
    expect(metrics.uniqueVisitors).toBe(100);
    expect(metrics.conversionRate).toBe(4.0);
    expect(metrics.cac).toBe(25.00);
    expect(metrics.roas).toBe(2.0);
    expect(metrics.aov).toBe(50.00);
    expect(metrics.netResultAfterMedia).toBe(100.00);
  });

  // J. DEMO order vs REAL order provenance segregation
  it('Scenario J: preserves visitor and session context while respecting attribution segregation', () => {
    const demoOrder = {
      id: 'ord-demo-001',
      total_amount: '0.00',
      is_demo: true,
      data_provenance: 'DEMO_SEED',
      attribution_metadata: { campaign_id: '120249269452820001' }
    };
    const result = resolveOrderAttribution(demoOrder, sampleHierarchy);

    expect(result.attribution_status).toBe('ATTRIBUTED');
    expect(result.matched_campaign_db_id).toBe('camp-db-001');
  });

  // K. Non-COMMERCIAL_PRODUCTION order
  it('Scenario K: attribution resolver operates purely on factual identifiers without mutating provenance', () => {
    const stagingOrder = {
      id: 'ord-staging-001',
      total_amount: '19.90',
      is_demo: false,
      data_provenance: 'STAGING_SANDBOX_QA',
      attribution_metadata: { ad_id: '3495810002' }
    };
    const result = resolveOrderAttribution(stagingOrder, sampleHierarchy);

    expect(result.attribution_status).toBe('ATTRIBUTED');
    expect(result.meta_ad_id).toBe('3495810002');
    expect(result.matched_ad_db_id).toBe('ad-db-002');
  });

  // L. Spend = 0 division-by-zero protection
  it('Scenario L: Spend = 0 returns roas=null and cac=0 without NaN or Infinity', () => {
    const metrics = calculatePerformanceMetrics({
      spend: 0,
      revenue: 150.00,
      paidOrders: 3,
      uniqueVisitors: 50
    });

    expect(metrics.roas).toBeNull();
    expect(metrics.cac).toBe(0.00);
    expect(metrics.netResultAfterMedia).toBe(150.00);
    expect(metrics.aov).toBe(50.00);
  });

  // M. Paid orders = 0 division-by-zero protection
  it('Scenario M: Paid orders = 0 returns cac=null, aov=null, and conversionRate=0 without NaN or Infinity', () => {
    const metrics = calculatePerformanceMetrics({
      spend: 250.00,
      revenue: 0.00,
      paidOrders: 0,
      uniqueVisitors: 100
    });

    expect(metrics.cac).toBeNull();
    expect(metrics.aov).toBeNull();
    expect(metrics.roas).toBe(0.00);
    expect(metrics.conversionRate).toBe(0.00);
    expect(metrics.netResultAfterMedia).toBe(-250.00);
  });

  // N. Malformed attribution metadata
  it('Scenario N: handles malformed JSON or unexpected non-object metadata safely without throwing', () => {
    const malformedOrder1 = {
      id: 'ord-malformed-001',
      total_amount: '47.00',
      attribution_metadata: 'invalid_json{{"'
    };
    const result1 = resolveOrderAttribution(malformedOrder1, sampleHierarchy);
    expect(result1.attribution_status).toBe('ORGANIC');

    const malformedOrder2 = {
      id: 'ord-malformed-002',
      total_amount: '47.00',
      utm_campaign: '120249269452820001',
      attribution_metadata: ['array', 'is', 'not', 'valid'] as any
    };
    const result2 = resolveOrderAttribution(malformedOrder2, sampleHierarchy);
    expect(result2.attribution_status).toBe('ATTRIBUTED');
    expect(result2.attribution_method).toBe('UTM_CAMPAIGN_ID');
  });

  // O. Complete absence of attribution context
  it('Scenario O: total absence of attribution context produces ORGANIC status with zero credit', () => {
    const bareOrder = {};
    const result = resolveOrderAttribution(bareOrder, sampleHierarchy);

    expect(result.attribution_status).toBe('ORGANIC');
    expect(result.attribution_method).toBe('NONE');
    expect(result.confidence).toBe('NONE');
    expect(result.is_financially_creditable).toBe(false);
  });

  // Mandatory Guardrail: Single campaign + fbclid does NOT attribute revenue
  it('Mandatory Guardrail: single campaign + fbclid with no campaign identifier does NOT attribute revenue', () => {
    const singleCampaignHierarchy: MetaHierarchyContext = {
      campaigns: [
        { id: 'camp-db-001', meta_campaign_id: '120249269452820001', name: 'Campanha Unica', status: 'ACTIVE' }
      ]
    };

    const orderWithFbclidOnly = {
      id: 'ord-fbclid-only',
      total_amount: '47.00',
      fbclid: 'IwAR1234567890abcdef'
    };

    const result = resolveOrderAttribution(orderWithFbclidOnly, singleCampaignHierarchy);

    expect(result.attribution_status).toBe('UNATTRIBUTED');
    expect(result.attribution_method).toBe('NONE');
    expect(result.is_financially_creditable).toBe(false);
  });
});
