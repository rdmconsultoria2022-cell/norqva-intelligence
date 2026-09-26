import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import express, { Express } from 'express';
import request from 'supertest';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { MetaClient, MetaDemographicInsightPayload } from '../services/meta/metaClient';
import { MetaDemographicIngestionService } from '../services/meta/metaDemographicIngestionService';
import { getFinancialDashboard } from '../controllers/api';
import { getAttributionAnalyticsReport } from '../services/attribution/attributionAnalyticsService';
import { getCommercialTimeBoundaries } from '../utils/commercialTimezone';

describe('GATE 16.6D: Meta Demographic Ingestion Engine', () => {
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

    // Express App for financial isolation testing
    app = express();
    app.use(express.json());
    app.set('db', pool);
    app.use((req: any, _res: any, next: any) => {
      req.user = { id: adminUserId, email: 'admin@norqva.com', role: 'ADMIN' };
      next();
    });
    app.get('/api/financial/dashboard', getFinancialDashboard);
  });

  it('1. REALISTIC META PAYLOAD: Persists 4 distinct cohorts from AD A and AD B accurately into meta_demographic_insights', async () => {
    const mockClient = new MetaClient();
    const realisticPayload: MetaDemographicInsightPayload[] = [
      {
        ad_meta_id: 'ad_meta_A',
        ad_name: 'TRATTORIA_V1_AD_A_HOOK_SEPARACAO',
        campaign_meta_id: 'cmp_demo_test_01',
        adset_meta_id: 'set_demo_test_01',
        date_start: todayStr,
        date_stop: todayStr,
        age: '45-54',
        gender: 'male',
        spend: 10.00,
        impressions: 1000,
        clicks: 30,
        link_clicks: 25,
        cpc: 0.3333,
        cpm: 10.00,
        ctr: 3.00
      },
      {
        ad_meta_id: 'ad_meta_A',
        ad_name: 'TRATTORIA_V1_AD_A_HOOK_SEPARACAO',
        campaign_meta_id: 'cmp_demo_test_01',
        adset_meta_id: 'set_demo_test_01',
        date_start: todayStr,
        date_stop: todayStr,
        age: '45-54',
        gender: 'female',
        spend: 12.00,
        impressions: 1200,
        clicks: 40,
        link_clicks: 35,
        cpc: 0.3000,
        cpm: 10.00,
        ctr: 3.33
      },
      {
        ad_meta_id: 'ad_meta_A',
        ad_name: 'TRATTORIA_V1_AD_A_HOOK_SEPARACAO',
        campaign_meta_id: 'cmp_demo_test_01',
        adset_meta_id: 'set_demo_test_01',
        date_start: todayStr,
        date_stop: todayStr,
        age: '55-64',
        gender: 'male',
        spend: 8.00,
        impressions: 800,
        clicks: 20,
        link_clicks: 18,
        cpc: 0.4000,
        cpm: 10.00,
        ctr: 2.50
      },
      {
        ad_meta_id: 'ad_meta_B',
        ad_name: 'TRATTORIA_V1_AD_B_HOOK_EMULSAO',
        campaign_meta_id: 'cmp_demo_test_01',
        adset_meta_id: 'set_demo_test_01',
        date_start: todayStr,
        date_stop: todayStr,
        age: '18-24',
        gender: 'female',
        spend: 5.00,
        impressions: 500,
        clicks: 10,
        link_clicks: 8,
        cpc: 0.5000,
        cpm: 10.00,
        ctr: 2.00
      }
    ];

    vi.spyOn(mockClient, 'getAdAccounts').mockResolvedValue([
      { id: 'act_demo_test_01', name: 'Test Account', currency: 'BRL', timezone_name: 'America/Sao_Paulo', account_status: 1 }
    ]);
    vi.spyOn(mockClient, 'getDemographicInsights').mockResolvedValue(realisticPayload);

    const service = new MetaDemographicIngestionService(mockClient);
    const summary = await service.ingestDemographics(pool, adminUserId, false, { datePreset: 'today' });

    expect(summary.rowsFetched).toBe(4);
    expect(summary.rowsNormalized).toBe(4);
    expect(summary.rowsPersisted).toBe(4);
    expect(summary.rowsSkipped).toBe(0);
    expect(summary.unresolvedEntityRows).toBe(0);

    const res = await pool.query(
      'SELECT entity_meta_id, age_group, gender, spend, impressions, clicks, link_clicks FROM meta_demographic_insights ORDER BY entity_meta_id, age_group, gender'
    );

    expect(res.rows.length).toBe(4);
    expect(res.rows[0]).toMatchObject({
      entity_meta_id: 'ad_meta_A',
      age_group: '45-54',
      gender: 'female'
    });
    expect(parseFloat(res.rows[0].spend)).toBe(12.00);
    expect(parseInt(res.rows[0].clicks, 10)).toBe(40);
    expect(parseInt(res.rows[0].link_clicks, 10)).toBe(35);

    expect(res.rows[1]).toMatchObject({
      entity_meta_id: 'ad_meta_A',
      age_group: '45-54',
      gender: 'male'
    });
    expect(parseFloat(res.rows[1].spend)).toBe(10.00);

    expect(res.rows[2]).toMatchObject({
      entity_meta_id: 'ad_meta_A',
      age_group: '55-64',
      gender: 'male'
    });
    expect(parseFloat(res.rows[2].spend)).toBe(8.00);

    expect(res.rows[3]).toMatchObject({
      entity_meta_id: 'ad_meta_B',
      age_group: '18-24',
      gender: 'female'
    });
    expect(parseFloat(res.rows[3].spend)).toBe(5.00);
  });

  it('2. IDEMPOTENT RESYNC: Re-executing same day/cohorts updates metric values with ZERO duplicates', async () => {
    const mockClient = new MetaClient();
    const initialPayload: MetaDemographicInsightPayload[] = [
      {
        ad_meta_id: 'ad_meta_A',
        date_start: todayStr,
        date_stop: todayStr,
        age: '45-54',
        gender: 'male',
        spend: 10.00,
        impressions: 1000,
        clicks: 30
      }
    ];

    vi.spyOn(mockClient, 'getAdAccounts').mockResolvedValue([
      { id: 'act_demo_test_01', name: 'Test Account', currency: 'BRL', timezone_name: 'America/Sao_Paulo', account_status: 1 }
    ]);
    const insightSpy = vi.spyOn(mockClient, 'getDemographicInsights').mockResolvedValue(initialPayload);

    const service = new MetaDemographicIngestionService(mockClient);
    await service.ingestDemographics(pool, adminUserId, false, { datePreset: 'today' });

    let countRes = await pool.query('SELECT COUNT(*)::int as cnt FROM meta_demographic_insights');
    expect(countRes.rows[0].cnt).toBe(1);

    // Resync with updated metrics
    const updatedPayload: MetaDemographicInsightPayload[] = [
      {
        ad_meta_id: 'ad_meta_A',
        date_start: todayStr,
        date_stop: todayStr,
        age: '45-54',
        gender: 'male',
        spend: 18.50,
        impressions: 1500,
        clicks: 45
      }
    ];
    insightSpy.mockResolvedValue(updatedPayload);

    const resyncSummary = await service.ingestDemographics(pool, adminUserId, false, { datePreset: 'today' });
    expect(resyncSummary.rowsPersisted).toBe(1);

    countRes = await pool.query('SELECT COUNT(*)::int as cnt FROM meta_demographic_insights');
    expect(countRes.rows[0].cnt).toBe(1); // ZERO DUPLICATE ROWS

    const row = (await pool.query('SELECT spend, impressions, clicks FROM meta_demographic_insights')).rows[0];
    expect(parseFloat(row.spend)).toBe(18.50);
    expect(parseInt(row.impressions, 10)).toBe(1500);
    expect(parseInt(row.clicks, 10)).toBe(45);
  });

  it('3. CURRENT DAY: Accurately persists current commercial date when returned by Meta', async () => {
    const mockClient = new MetaClient();
    vi.spyOn(mockClient, 'getAdAccounts').mockResolvedValue([
      { id: 'act_demo_test_01', name: 'Test Account', currency: 'BRL', timezone_name: 'America/Sao_Paulo', account_status: 1 }
    ]);
    vi.spyOn(mockClient, 'getDemographicInsights').mockResolvedValue([
      {
        ad_meta_id: 'ad_meta_A',
        date_start: todayStr,
        date_stop: todayStr,
        age: '45-54',
        gender: 'female',
        spend: 20.00,
        impressions: 1500,
        clicks: 50
      }
    ]);

    const service = new MetaDemographicIngestionService(mockClient);
    const summary = await service.ingestDemographics(pool, adminUserId, false, { datePreset: 'today' });

    expect(summary.rowsPersisted).toBe(1);

    const row = (await pool.query('SELECT date_start, date_stop FROM meta_demographic_insights')).rows[0];
    expect(row.date_start.toISOString().slice(0, 10)).toBe(todayStr);
    expect(row.date_stop.toISOString().slice(0, 10)).toBe(todayStr);
  });

  it('4. FINANCIAL ISOLATION & ZERO DOUBLE COUNTING: Ingestion strictly isolates demographic slices and leaves canonical spend untouched', async () => {
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

    // Capture initial canonical spend before demographic ingestion
    const dashBefore = await request(app).get('/api/financial/dashboard?mode=real&period=today');
    expect(dashBefore.status).toBe(200);
    const spendBefore = dashBefore.body.summary.totalSpend;
    expect(spendBefore).toBe(55.59);

    const b2Before = await getAttributionAnalyticsReport(pool, { mode: 'real', period: 'today' });
    expect(b2Before.attributedMediaTruth.account.spend).toBe(55.59);

    // 2. Execute Demographic Ingestion (Summing to R$ 55.59 in demographic breakdowns)
    const mockClient = new MetaClient();
    vi.spyOn(mockClient, 'getAdAccounts').mockResolvedValue([
      { id: 'act_demo_test_01', name: 'Test Account', currency: 'BRL', timezone_name: 'America/Sao_Paulo', account_status: 1 }
    ]);
    vi.spyOn(mockClient, 'getDemographicInsights').mockResolvedValue([
      {
        ad_meta_id: 'ad_meta_A',
        date_start: todayStr,
        date_stop: todayStr,
        age: '45-54',
        gender: 'female',
        spend: 35.59,
        impressions: 800,
        clicks: 60
      },
      {
        ad_meta_id: 'ad_meta_A',
        date_start: todayStr,
        date_stop: todayStr,
        age: '55-64',
        gender: 'female',
        spend: 20.00,
        impressions: 400,
        clicks: 35
      }
    ]);

    const service = new MetaDemographicIngestionService(mockClient);
    await service.ingestDemographics(pool, adminUserId, false, { datePreset: 'today' });

    // 3. Verify canonical spend AFTER demographic ingestion
    const dashAfter = await request(app).get('/api/financial/dashboard?mode=real&period=today');
    expect(dashAfter.status).toBe(200);
    const spendAfter = dashAfter.body.summary.totalSpend;

    // SPEND_BEFORE MUST EQUAL SPEND_AFTER (ZERO DOUBLE COUNTING)
    expect(spendAfter).toBe(55.59);
    expect(spendAfter).toBe(spendBefore);

    const b2After = await getAttributionAnalyticsReport(pool, { mode: 'real', period: 'today' });
    expect(b2After.attributedMediaTruth.account.spend).toBe(55.59);

    // Verify zero writes to meta_insights
    const metaInsightsCount = await pool.query('SELECT COUNT(*)::int as cnt FROM meta_insights');
    expect(metaInsightsCount.rows[0].cnt).toBe(1); // exactly the initial 1 row
  });

  it('5. ENTITY RESOLUTION & SKIPPING: Skips unmapped Meta ad IDs without creating entities or failing transaction', async () => {
    const mockClient = new MetaClient();
    vi.spyOn(mockClient, 'getAdAccounts').mockResolvedValue([
      { id: 'act_demo_test_01', name: 'Test Account', currency: 'BRL', timezone_name: 'America/Sao_Paulo', account_status: 1 }
    ]);
    vi.spyOn(mockClient, 'getDemographicInsights').mockResolvedValue([
      {
        ad_meta_id: 'ad_meta_A',
        date_start: todayStr,
        date_stop: todayStr,
        age: '45-54',
        gender: 'male',
        spend: 10.00,
        impressions: 1000,
        clicks: 30
      },
      {
        ad_meta_id: 'ad_unknown_non_existent',
        date_start: todayStr,
        date_stop: todayStr,
        age: '45-54',
        gender: 'male',
        spend: 50.00,
        impressions: 5000,
        clicks: 100
      }
    ]);

    const service = new MetaDemographicIngestionService(mockClient);
    const summary = await service.ingestDemographics(pool, adminUserId, false, { datePreset: 'today' });

    expect(summary.rowsFetched).toBe(2);
    expect(summary.rowsPersisted).toBe(1);
    expect(summary.rowsSkipped).toBe(1);
    expect(summary.unresolvedEntityRows).toBe(1);

    // Verify no phantom ads were inserted into meta_ads
    const adsCount = await pool.query('SELECT COUNT(*)::int as cnt FROM meta_ads');
    expect(adsCount.rows[0].cnt).toBe(2); // exactly ad_meta_A and ad_meta_B
  });

  it('6. VALUE NORMALIZATION: Normalizes unknown age groups and genders safely without throwing', async () => {
    const mockClient = new MetaClient();
    vi.spyOn(mockClient, 'getAdAccounts').mockResolvedValue([
      { id: 'act_demo_test_01', name: 'Test Account', currency: 'BRL', timezone_name: 'America/Sao_Paulo', account_status: 1 }
    ]);
    vi.spyOn(mockClient, 'getDemographicInsights').mockResolvedValue([
      {
        ad_meta_id: 'ad_meta_A',
        date_start: todayStr,
        date_stop: todayStr,
        age: '13-17_unsupported',
        gender: 'non_binary_unsupported',
        spend: 5.00,
        impressions: 200,
        clicks: 5
      }
    ]);

    const service = new MetaDemographicIngestionService(mockClient);
    const summary = await service.ingestDemographics(pool, adminUserId, false, { datePreset: 'today' });

    expect(summary.rowsPersisted).toBe(1);
    expect(summary.unknownAgeRows).toBe(1);
    expect(summary.unknownGenderRows).toBe(1);

    const row = (await pool.query('SELECT age_group, gender FROM meta_demographic_insights')).rows[0];
    expect(row.age_group).toBe('unknown');
    expect(row.gender).toBe('unknown');
  });

  it('7. DEMO VS REAL PROVENANCE ISOLATION: Preserves strict separation between DEMO_SEED and COMMERCIAL_PRODUCTION', async () => {
    // 1. Provision Demo Account and hierarchy
    const connDemoRes = await pool.query(
      "INSERT INTO meta_connections (is_demo, status, token_reference) VALUES (true, 'CONNECTED', 'env:TEST_DEMO') RETURNING id"
    );
    const demoConnId = connDemoRes.rows[0].id;

    const actDemoRes = await pool.query(
      "INSERT INTO meta_ad_accounts (meta_account_id, connection_id, name, currency, timezone_name, is_demo, data_provenance) VALUES ('act_demo_12345678', $1, 'Demo Account', 'BRL', 'America/Sao_Paulo', true, 'DEMO_SEED') RETURNING id",
      [demoConnId]
    );
    const demoActId = actDemoRes.rows[0].id;

    const cmpDemoRes = await pool.query(
      "INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance) VALUES ('cmp_demo_001', $1, 'Demo Campaign', 'ACTIVE', 'ACTIVE', true, 'DEMO_SEED') RETURNING id",
      [demoActId]
    );
    const demoCmpId = cmpDemoRes.rows[0].id;

    const setDemoRes = await pool.query(
      "INSERT INTO meta_ad_sets (meta_adset_id, campaign_id, name, status, effective_status, is_demo, data_provenance) VALUES ('adset_demo_001', $1, 'Demo Adset', 'ACTIVE', 'ACTIVE', true, 'DEMO_SEED') RETURNING id",
      [demoCmpId]
    );
    const demoSetId = setDemoRes.rows[0].id;

    await pool.query(
      "INSERT INTO meta_ads (meta_ad_id, adset_id, name, status, effective_status, is_demo, data_provenance) VALUES ('ad_demo_001', $1, 'Demo Ad', 'ACTIVE', 'ACTIVE', true, 'DEMO_SEED') RETURNING id",
      [demoSetId]
    );

    // Ingest Real
    const mockClient = new MetaClient();
    vi.spyOn(mockClient, 'getAdAccounts').mockImplementation(async (isDemo) => {
      if (isDemo) {
        return [{ id: 'act_demo_12345678', name: 'Demo Account', currency: 'BRL', timezone_name: 'America/Sao_Paulo', account_status: 1 }];
      }
      return [{ id: 'act_demo_test_01', name: 'Test Account', currency: 'BRL', timezone_name: 'America/Sao_Paulo', account_status: 1 }];
    });

    vi.spyOn(mockClient, 'getDemographicInsights').mockImplementation(async (_actId, _opts, isDemo) => {
      if (isDemo) {
        return [{
          ad_meta_id: 'ad_demo_001',
          date_start: todayStr,
          date_stop: todayStr,
          age: '45-54',
          gender: 'female',
          spend: 35.50,
          impressions: 1200,
          clicks: 40
        }];
      }
      return [{
        ad_meta_id: 'ad_meta_A',
        date_start: todayStr,
        date_stop: todayStr,
        age: '45-54',
        gender: 'female',
        spend: 50.00,
        impressions: 2000,
        clicks: 70
      }];
    });

    const service = new MetaDemographicIngestionService(mockClient);

    // Ingest Real
    await service.ingestDemographics(pool, adminUserId, false, { datePreset: 'today' });
    // Ingest Demo
    await service.ingestDemographics(pool, adminUserId, true, { datePreset: 'today' });

    const realRows = await pool.query("SELECT * FROM meta_demographic_insights WHERE is_demo = false");
    const demoRows = await pool.query("SELECT * FROM meta_demographic_insights WHERE is_demo = true");

    expect(realRows.rows.length).toBe(1);
    expect(realRows.rows[0].data_provenance).toBe('COMMERCIAL_PRODUCTION');
    expect(parseFloat(realRows.rows[0].spend)).toBe(50.00);

    expect(demoRows.rows.length).toBe(1);
    expect(demoRows.rows[0].data_provenance).toBe('DEMO_SEED');
    expect(parseFloat(demoRows.rows[0].spend)).toBe(35.50);
  });
});
