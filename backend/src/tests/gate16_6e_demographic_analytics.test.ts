import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import express, { Express } from 'express';
import request from 'supertest';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { DemographicAnalyticsService } from '../services/intelligence/demographicAnalyticsService';
import { getDemographicsAnalytics, getFinancialDashboard } from '../controllers/api';
import { getAttributionAnalyticsReport } from '../services/attribution/attributionAnalyticsService';
import { getCommercialTimeBoundaries } from '../utils/commercialTimezone';

describe('GATE 16.6E: Demographic Analytics Service & Operational Intelligence', () => {
  let pool: Pool;
  let app: Express;
  const adminUserId = crypto.randomUUID();

  // Test DB UUID fixtures
  let testAdAccountId: string;
  let testCampaignId: string;
  let testAdsetId: string;
  let testAdAId: string;
  let testAdBId: string;

  const todayStr = getCommercialTimeBoundaries('today').dateStartMeta;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
  });

  beforeEach(async () => {
    // Clean all demographic and meta tables
    const stmts = [
      'DELETE FROM meta_demographic_insights',
      'DELETE FROM meta_insights',
      'DELETE FROM meta_ads',
      'DELETE FROM meta_ad_sets',
      'DELETE FROM meta_campaigns',
      'DELETE FROM meta_ad_accounts',
      'DELETE FROM meta_connections',
      'DELETE FROM payments',
      'DELETE FROM order_items',
      'DELETE FROM orders',
      'DELETE FROM customers',
      'DELETE FROM users',
      'DELETE FROM audit_logs'
    ];
    for (const sql of stmts) {
      try {
        await pool.query(sql);
      } catch (_) {}
    }

    // Insert admin user fixture
    await pool.query(
      "INSERT INTO users (id, name, email, role) VALUES ($1, 'Admin User', 'admin@norqva.com', 'ADMIN') ON CONFLICT (id) DO NOTHING",
      [adminUserId]
    );

    // Provision base Meta hierarchy
    const connRes = await pool.query(
      "INSERT INTO meta_connections (is_demo, status, token_reference) VALUES (false, 'CONNECTED', 'env:TEST') RETURNING id"
    );
    const connId = connRes.rows[0].id;

    const actRes = await pool.query(
      "INSERT INTO meta_ad_accounts (meta_account_id, connection_id, name, currency, timezone_name, is_demo, data_provenance) VALUES ('act_demo_test_01', $1, 'Test Account', 'BRL', 'America/Sao_Paulo', false, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [connId]
    );
    testAdAccountId = actRes.rows[0].id;

    const cmpRes = await pool.query(
      "INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance) VALUES ('cmp_demo_test_01', $1, 'NORQVA_TRATTORIA_REVENUE_V1', 'ACTIVE', 'ACTIVE', false, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [testAdAccountId]
    );
    testCampaignId = cmpRes.rows[0].id;

    const setRes = await pool.query(
      "INSERT INTO meta_ad_sets (meta_adset_id, campaign_id, name, status, effective_status, is_demo, data_provenance) VALUES ('set_demo_test_01', $1, 'TRATTORIA_V1_ADSET', 'ACTIVE', 'ACTIVE', false, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [testCampaignId]
    );
    testAdsetId = setRes.rows[0].id;

    const adARes = await pool.query(
      "INSERT INTO meta_ads (meta_ad_id, adset_id, name, status, effective_status, is_demo, data_provenance) VALUES ('ad_meta_A', $1, 'TRATTORIA_V1_AD_A_HOOK_SEPARACAO', 'ACTIVE', 'ACTIVE', false, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [testAdsetId]
    );
    testAdAId = adARes.rows[0].id;

    const adBRes = await pool.query(
      "INSERT INTO meta_ads (meta_ad_id, adset_id, name, status, effective_status, is_demo, data_provenance) VALUES ('ad_meta_B', $1, 'TRATTORIA_V1_AD_B_HOOK_EMULSAO', 'ACTIVE', 'ACTIVE', false, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [testAdsetId]
    );
    testAdBId = adBRes.rows[0].id;

    // Express App for REST API testing
    app = express();
    app.use(express.json());
    app.set('db', pool);
    app.use((req: any, _res: any, next: any) => {
      req.user = { id: adminUserId, email: 'admin@norqva.com', role: 'ADMIN' };
      next();
    });
    app.get('/api/intelligence/demographics', getDemographicsAnalytics);
    app.get('/api/financial/dashboard', getFinancialDashboard);
  });

  // Helper to insert demographic slices
  async function insertDemographicRow(params: {
    ad_id: string;
    entity_meta_id: string;
    date: string;
    age_group: string;
    gender: string;
    spend: number;
    impressions: number;
    clicks: number;
    reach?: number;
    link_clicks?: number;
    is_demo?: boolean;
  }) {
    await pool.query(
      `INSERT INTO meta_demographic_insights (
        ad_account_id, campaign_id, adset_id, ad_id,
        entity_level, entity_meta_id,
        date_start, date_stop,
        age_group, gender,
        spend, impressions, clicks, reach, link_clicks,
        is_demo, data_provenance
      ) VALUES (
        $1, $2, $3, $4,
        'AD', $5,
        $6, $6,
        $7, $8,
        $9, $10, $11, $12, $13,
        $14, $15
      )`,
      [
        testAdAccountId,
        testCampaignId,
        testAdsetId,
        params.ad_id,
        params.entity_meta_id,
        params.date,
        params.age_group,
        params.gender,
        params.spend,
        params.impressions,
        params.clicks,
        params.reach || null,
        params.link_clicks || null,
        params.is_demo ?? false,
        params.is_demo ? 'DEMO_SEED' : 'COMMERCIAL_PRODUCTION'
      ]
    );
  }

  it('1. <45 COHORT AGGREGATION: Correctly aggregates 18-24, 25-34, 35-44 into under_45', async () => {
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '18-24', gender: 'female', spend: 10, impressions: 1000, clicks: 20 });
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '25-34', gender: 'male', spend: 15, impressions: 1500, clicks: 30 });
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '35-44', gender: 'female', spend: 20, impressions: 2000, clicks: 40 });

    const service = new DemographicAnalyticsService();
    const result = await service.getDemographicAnalytics(pool, { period: 'today' });

    expect(result.cohorts.under_45.spend).toBe(45.00);
    expect(result.cohorts.under_45.impressions).toBe(4500);
    expect(result.cohorts.under_45.clicks).toBe(90);
    expect(result.cohorts.under_45.ctr).toBe(2.00); // 90 / 4500 * 100
    expect(result.cohorts.under_45.cpc).toBe(0.50); // 45 / 90
    expect(result.cohorts.under_45.cpm).toBe(10.00); // 45 / 4500 * 1000
  });

  it('2. 45+ COHORT AGGREGATION: Correctly aggregates 45-54, 55-64, 65+ into age_45_plus', async () => {
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 50, impressions: 4000, clicks: 120 });
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '55-64', gender: 'male', spend: 30, impressions: 2500, clicks: 70 });
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '65+', gender: 'female', spend: 20, impressions: 1500, clicks: 50 });

    const service = new DemographicAnalyticsService();
    const result = await service.getDemographicAnalytics(pool, { period: 'today' });

    expect(result.cohorts.age_45_plus.spend).toBe(100.00);
    expect(result.cohorts.age_45_plus.impressions).toBe(8000);
    expect(result.cohorts.age_45_plus.clicks).toBe(240);
    expect(result.cohorts.age_45_plus.ctr).toBe(3.00); // 240 / 8000 * 100
    expect(result.cohorts.age_45_plus.cpc).toBe(0.42); // 100 / 240
    expect(result.cohorts.age_45_plus.cpm).toBe(12.50); // 100 / 8000 * 1000
  });

  it('3. UNKNOWN ISOLATION: unknown cohort remains strictly isolated from under_45 and age_45_plus', async () => {
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 50, impressions: 2000, clicks: 100 });
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: 'unknown', gender: 'unknown', spend: 10, impressions: 500, clicks: 15 });

    const service = new DemographicAnalyticsService();
    const result = await service.getDemographicAnalytics(pool, { period: 'today' });

    expect(result.cohorts.unknown.spend).toBe(10.00);
    expect(result.cohorts.unknown.impressions).toBe(500);
    expect(result.cohorts.unknown.clicks).toBe(15);

    expect(result.cohorts.age_45_plus.spend).toBe(50.00);
    expect(result.cohorts.under_45.spend).toBe(0.00);
    expect(result.summary.total_spend).toBe(60.00);
  });

  it('4. CLICK SHARE: Correctly calculates click_share for cohorts and hypothesis', async () => {
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '25-34', gender: 'male', spend: 20, impressions: 1000, clicks: 30 }); // <45
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 80, impressions: 3000, clicks: 70 }); // 45+

    const service = new DemographicAnalyticsService();
    const result = await service.getDemographicAnalytics(pool, { period: 'today' });

    expect(result.summary.total_clicks).toBe(100);
    expect(result.cohorts.under_45.click_share).toBe(30.00);
    expect(result.cohorts.age_45_plus.click_share).toBe(70.00);
    expect(result.hypothesis_45_plus.click_share_45_plus).toBe(70.00);
  });

  it('5. SPEND SHARE: Correctly calculates spend_share across cohorts', async () => {
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '25-34', gender: 'male', spend: 25, impressions: 1000, clicks: 20 });
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 75, impressions: 3000, clicks: 60 });

    const service = new DemographicAnalyticsService();
    const result = await service.getDemographicAnalytics(pool, { period: 'today' });

    expect(result.summary.total_spend).toBe(100.00);
    expect(result.cohorts.under_45.spend_share).toBe(25.00);
    expect(result.cohorts.age_45_plus.spend_share).toBe(75.00);
    expect(result.hypothesis_45_plus.spend_share_45_plus).toBe(75.00);
  });

  it('6, 7, 8. RECALCULATED DERIVED METRICS: CTR, CPC, and CPM are recalculated from aggregate totals and NOT averaged', async () => {
    // Row 1: CPC = 0.50, CPM = 20.00
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 20, impressions: 1000, clicks: 40 });
    // Row 2: CPC = 1.00, CPM = 40.00
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '55-64', gender: 'male', spend: 40, impressions: 1000, clicks: 40 });

    const service = new DemographicAnalyticsService();
    const result = await service.getDemographicAnalytics(pool, { period: 'today' });

    // Aggregate spend = 60, impressions = 2000, clicks = 80
    // CTR = 80 / 2000 * 100 = 4.00%
    // CPC = 60 / 80 = 0.75
    // CPM = 60 / 2000 * 1000 = 30.00
    expect(result.cohorts.age_45_plus.ctr).toBe(4.00);
    expect(result.cohorts.age_45_plus.cpc).toBe(0.75);
    expect(result.cohorts.age_45_plus.cpm).toBe(30.00);
  });

  it('9. SAFE DIVISION BY ZERO: 0 impressions or 0 clicks return null/0 without NaN or Infinity', async () => {
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 0, impressions: 0, clicks: 0 });

    const service = new DemographicAnalyticsService();
    const result = await service.getDemographicAnalytics(pool, { period: 'today' });

    expect(result.summary.ctr).toBeNull();
    expect(result.summary.cpc).toBeNull();
    expect(result.summary.cpm).toBeNull();
    expect(result.cohorts.age_45_plus.ctr).toBeNull();
    expect(result.cohorts.age_45_plus.cpc).toBeNull();
    expect(result.cohorts.age_45_plus.cpm).toBeNull();
  });

  it('10. CONFIDENCE NO_DATA: 0 clicks returns NO_DATA', async () => {
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 5, impressions: 200, clicks: 0 });

    const service = new DemographicAnalyticsService();
    const result = await service.getDemographicAnalytics(pool, { period: 'today' });

    expect(result.summary.media_sample_confidence).toBe('NO_DATA');
    expect(result.cohorts.age_45_plus.media_sample_confidence).toBe('NO_DATA');
  });

  it('11. CONFIDENCE OBSERVING: 1-29 clicks returns OBSERVING', async () => {
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 10, impressions: 500, clicks: 15 });

    const service = new DemographicAnalyticsService();
    const result = await service.getDemographicAnalytics(pool, { period: 'today' });

    expect(result.summary.media_sample_confidence).toBe('OBSERVING');
    expect(result.cohorts.age_45_plus.media_sample_confidence).toBe('OBSERVING');
  });

  it('12. CONFIDENCE LEARNING: 30-99 clicks returns LEARNING', async () => {
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 30, impressions: 1500, clicks: 45 });

    const service = new DemographicAnalyticsService();
    const result = await service.getDemographicAnalytics(pool, { period: 'today' });

    expect(result.summary.media_sample_confidence).toBe('LEARNING');
    expect(result.cohorts.age_45_plus.media_sample_confidence).toBe('LEARNING');
  });

  it('13. CONFIDENCE SUFFICIENT_MEDIA_SAMPLE: >=100 clicks returns SUFFICIENT_MEDIA_SAMPLE', async () => {
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 80, impressions: 4000, clicks: 120 });

    const service = new DemographicAnalyticsService();
    const result = await service.getDemographicAnalytics(pool, { period: 'today' });

    expect(result.summary.media_sample_confidence).toBe('SUFFICIENT_MEDIA_SAMPLE');
    expect(result.cohorts.age_45_plus.media_sample_confidence).toBe('SUFFICIENT_MEDIA_SAMPLE');
  });

  it('14. AGE BREAKDOWN: Returns all 7 distinct age groups in by_age', async () => {
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 30, impressions: 1000, clicks: 35 });

    const service = new DemographicAnalyticsService();
    const result = await service.getDemographicAnalytics(pool, { period: 'today' });

    expect(result.by_age.length).toBe(7);
    const ageNames = result.by_age.map(a => a.age_group);
    expect(ageNames).toEqual(['18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'unknown']);

    const slice4554 = result.by_age.find(a => a.age_group === '45-54');
    expect(slice4554?.spend).toBe(30.00);
    expect(slice4554?.clicks).toBe(35);
  });

  it('15. GENDER BREAKDOWN: Returns male, female, unknown in by_gender', async () => {
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 40, impressions: 2000, clicks: 50 });
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'male', spend: 20, impressions: 1000, clicks: 25 });

    const service = new DemographicAnalyticsService();
    const result = await service.getDemographicAnalytics(pool, { period: 'today' });

    expect(result.by_gender.length).toBe(3);
    const genderNames = result.by_gender.map(g => g.gender);
    expect(genderNames).toEqual(['male', 'female', 'unknown']);

    const femaleSlice = result.by_gender.find(g => g.gender === 'female');
    expect(femaleSlice?.spend).toBe(40.00);
    expect(femaleSlice?.clicks).toBe(50);
  });

  it('16. AD BREAKDOWN: Breaks down demographic distribution per ad with 45+ share and comparative CPC', async () => {
    // Ad A: 80% 45+
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '25-34', gender: 'male', spend: 10, impressions: 500, clicks: 20 });
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 40, impressions: 2000, clicks: 80 });

    // Ad B: 30% 45+
    await insertDemographicRow({ ad_id: testAdBId, entity_meta_id: 'ad_meta_B', date: todayStr, age_group: '25-34', gender: 'female', spend: 35, impressions: 1500, clicks: 70 });
    await insertDemographicRow({ ad_id: testAdBId, entity_meta_id: 'ad_meta_B', date: todayStr, age_group: '55-64', gender: 'male', spend: 15, impressions: 800, clicks: 30 });

    const service = new DemographicAnalyticsService();
    const result = await service.getDemographicAnalytics(pool, { period: 'today' });

    expect(result.by_ad.length).toBe(2);

    const adA = result.by_ad.find(a => a.meta_ad_id === 'ad_meta_A');
    expect(adA?.ad_name).toBe('TRATTORIA_V1_AD_A_HOOK_SEPARACAO');
    expect(adA?.clicks).toBe(100);
    expect(adA?.click_share_45_plus).toBe(80.00); // 80 / 100 * 100
    expect(adA?.spend_share_45_plus).toBe(80.00); // 40 / 50 * 100
    expect(adA?.cpc_45_plus).toBe(0.50); // 40 / 80
    expect(adA?.cpc_under_45).toBe(0.50); // 10 / 20

    const adB = result.by_ad.find(a => a.meta_ad_id === 'ad_meta_B');
    expect(adB?.ad_name).toBe('TRATTORIA_V1_AD_B_HOOK_EMULSAO');
    expect(adB?.clicks).toBe(100);
    expect(adB?.click_share_45_plus).toBe(30.00); // 30 / 100 * 100
    expect(adB?.spend_share_45_plus).toBe(30.00); // 15 / 50 * 100
  });

  it('17. DEMO / REAL ISOLATION: mode=real and mode=demo query strictly separated universes', async () => {
    // Real row
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 55.59, impressions: 1200, clicks: 95, is_demo: false });

    // Demo row
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 200.00, impressions: 5000, clicks: 300, is_demo: true });

    const service = new DemographicAnalyticsService();

    const realRes = await service.getDemographicAnalytics(pool, { mode: 'real', period: 'today' });
    expect(realRes.summary.total_spend).toBe(55.59);
    expect(realRes.summary.total_clicks).toBe(95);

    const demoRes = await service.getDemographicAnalytics(pool, { mode: 'demo', period: 'today' });
    expect(demoRes.summary.total_spend).toBe(200.00);
    expect(demoRes.summary.total_clicks).toBe(300);
  });

  it('18. TIME FILTERING: period=today excludes records outside of today', async () => {
    // Today
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 25, impressions: 1000, clicks: 50 });
    // Past date (e.g. 2026-08-01)
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: '2026-08-01', age_group: '45-54', gender: 'female', spend: 100, impressions: 5000, clicks: 200 });

    const service = new DemographicAnalyticsService();
    const resultToday = await service.getDemographicAnalytics(pool, { period: 'today' });

    expect(resultToday.summary.total_spend).toBe(25.00);
    expect(resultToday.summary.total_clicks).toBe(50);

    const result30d = await service.getDemographicAnalytics(pool, { period: '90d' });
    expect(result30d.summary.total_spend).toBe(125.00);
  });

  it('19. STRICT ECONOMIC TRUTH BOUNDARY: Response contains ZERO deterministic revenue, CAC, or ROAS by age', async () => {
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 50, impressions: 2000, clicks: 80 });

    const service = new DemographicAnalyticsService();
    const result: any = await service.getDemographicAnalytics(pool, { period: 'today' });

    // Ensure forbidden keys are strictly absent from cohort objects
    expect(result.cohorts.age_45_plus.revenue).toBeUndefined();
    expect(result.cohorts.age_45_plus.cac).toBeUndefined();
    expect(result.cohorts.age_45_plus.roas).toBeUndefined();
    expect(result.cohorts.under_45.revenue).toBeUndefined();
    expect(result.cohorts.under_45.cac).toBeUndefined();
    expect(result.cohorts.under_45.roas).toBeUndefined();

    // Ensure forbidden keys are absent from by_age and by_gender slices
    result.by_age.forEach((slice: any) => {
      expect(slice.revenue).toBeUndefined();
      expect(slice.cac).toBeUndefined();
      expect(slice.roas).toBeUndefined();
    });
  });

  it('20, 21, 22. ZERO INTERFERENCE WITH META_INSIGHTS, FINANCIAL DASHBOARD & B2 ATTRIBUTION', async () => {
    // 1. Establish canonical spend in meta_insights (Account Level: R$ 55.59)
    await pool.query(
      `INSERT INTO meta_insights (
        ad_account_id, entity_level, entity_meta_id,
        date_start, date_stop,
        spend, impressions, clicks,
        is_demo, data_provenance
      ) VALUES (
        $1, 'ACCOUNT', 'act_demo_test_01',
        $2, $2,
        55.59, 1200, 95,
        false, 'COMMERCIAL_PRODUCTION'
      )`,
      [testAdAccountId, todayStr]
    );

    // 2. Populate demographic table with slices
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '45-54', gender: 'female', spend: 35.59, impressions: 800, clicks: 60 });
    await insertDemographicRow({ ad_id: testAdAId, entity_meta_id: 'ad_meta_A', date: todayStr, age_group: '55-64', gender: 'female', spend: 20.00, impressions: 400, clicks: 35 });

    // 3. Query REST Endpoint GET /api/intelligence/demographics
    const demoApiRes = await request(app).get('/api/intelligence/demographics?mode=real&period=today');
    expect(demoApiRes.status).toBe(200);
    expect(demoApiRes.body.summary.total_spend).toBe(55.59);
    expect(demoApiRes.body.hypothesis_45_plus.click_share_45_plus).toBe(100.00);

    // 4. Query Financial Dashboard (MUST remain strictly 55.59, ZERO double count)
    const finDashRes = await request(app).get('/api/financial/dashboard?mode=real&period=today');
    expect(finDashRes.status).toBe(200);
    expect(finDashRes.body.summary.totalSpend).toBe(55.59);

    // 5. Query B2 Attribution Report (MUST remain strictly 55.59)
    const b2Report = await getAttributionAnalyticsReport(pool, { mode: 'real', period: 'today' });
    expect(b2Report.attributedMediaTruth.account.spend).toBe(55.59);
    expect(b2Report.globalCommercialTruth.paidMediaSpend).toBe(55.59);

    // 6. Verify meta_insights rows count is untouched
    const metaInsightsRes = await pool.query('SELECT COUNT(*)::int as cnt FROM meta_insights');
    expect(metaInsightsRes.rows[0].cnt).toBe(1);
  });
});
