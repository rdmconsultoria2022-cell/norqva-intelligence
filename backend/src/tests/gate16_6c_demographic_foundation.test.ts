import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { getFinancialDashboard } from '../controllers/api';
import { getAttributionAnalyticsReport } from '../services/attribution/attributionAnalyticsService';
import express, { Express } from 'express';
import request from 'supertest';

describe('GATE 16.6C: Demographic Intelligence Database Foundation', () => {
  let pool: Pool;
  let app: Express;
  const adminUserId = crypto.randomUUID();

  // Test UUID fixtures
  let testAdAccountId: string;
  let testCampaignId: string;
  let testAdsetId: string;
  let testAdId: string;

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
      'DELETE FROM customers'
    ];
    for (const sql of stmts) {
      try {
        await pool.query(sql);
      } catch (_) {}
    }

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

    const adRes = await pool.query(
      "INSERT INTO meta_ads (meta_ad_id, adset_id, name, status, effective_status, is_demo, data_provenance) VALUES ('ad_demo_test_01', $1, 'TRATTORIA_V1_AD_A_HOOK_SEPARACAO', 'ACTIVE', 'ACTIVE', false, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [testAdsetId]
    );
    testAdId = adRes.rows[0].id;

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

  it('1. Table meta_demographic_insights and indexes are created successfully by Migration 024', async () => {
    const tableCheck = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'meta_demographic_insights'"
    );
    expect(tableCheck.rows.length).toBe(1);

    const colsCheck = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'meta_demographic_insights'"
    );
    const colNames = colsCheck.rows.map(c => c.column_name);
    expect(colNames).toContain('ad_account_id');
    expect(colNames).toContain('campaign_id');
    expect(colNames).toContain('adset_id');
    expect(colNames).toContain('ad_id');
    expect(colNames).toContain('entity_level');
    expect(colNames).toContain('entity_meta_id');
    expect(colNames).toContain('date_start');
    expect(colNames).toContain('date_stop');
    expect(colNames).toContain('age_group');
    expect(colNames).toContain('gender');
    expect(colNames).toContain('spend');
    expect(colNames).toContain('impressions');
    expect(colNames).toContain('reach');
    expect(colNames).toContain('clicks');
    expect(colNames).toContain('link_clicks');
    expect(colNames).toContain('cpc');
    expect(colNames).toContain('cpm');
    expect(colNames).toContain('ctr');
    expect(colNames).toContain('data_provenance');
    expect(colNames).toContain('is_demo');
    expect(colNames).toContain('synced_at');
  });

  it('2. IDEMPOTENCY TEST: Upserting same logical cohort updates values with zero duplicate rows', async () => {
    // Initial insert
    const insertSql = `
      INSERT INTO meta_demographic_insights (
        ad_account_id, campaign_id, adset_id, ad_id,
        entity_level, entity_meta_id,
        date_start, date_stop,
        age_group, gender,
        spend, impressions, clicks,
        is_demo, data_provenance
      ) VALUES (
        $1, $2, $3, $4,
        'AD', 'ad_demo_test_01',
        '2026-09-25', '2026-09-25',
        '45-54', 'male',
        10.00, 500, 20,
        false, 'COMMERCIAL_PRODUCTION'
      )
      ON CONFLICT (ad_account_id, entity_level, entity_meta_id, date_start, age_group, gender, is_demo)
      DO UPDATE SET
        spend = EXCLUDED.spend,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        synced_at = NOW()
    `;
    await pool.query(insertSql, [testAdAccountId, testCampaignId, testAdsetId, testAdId]);

    const afterFirst = await pool.query('SELECT * FROM meta_demographic_insights');
    expect(afterFirst.rows.length).toBe(1);
    expect(parseFloat(afterFirst.rows[0].spend)).toBe(10.00);
    expect(parseInt(afterFirst.rows[0].clicks, 10)).toBe(20);

    // Upsert with updated values (spend=12.00, clicks=25)
    const updateSql = `
      INSERT INTO meta_demographic_insights (
        ad_account_id, campaign_id, adset_id, ad_id,
        entity_level, entity_meta_id,
        date_start, date_stop,
        age_group, gender,
        spend, impressions, clicks,
        is_demo, data_provenance
      ) VALUES (
        $1, $2, $3, $4,
        'AD', 'ad_demo_test_01',
        '2026-09-25', '2026-09-25',
        '45-54', 'male',
        12.00, 600, 25,
        false, 'COMMERCIAL_PRODUCTION'
      )
      ON CONFLICT (ad_account_id, entity_level, entity_meta_id, date_start, age_group, gender, is_demo)
      DO UPDATE SET
        spend = EXCLUDED.spend,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        synced_at = NOW()
    `;
    await pool.query(updateSql, [testAdAccountId, testCampaignId, testAdsetId, testAdId]);

    const afterSecond = await pool.query('SELECT * FROM meta_demographic_insights');
    expect(afterSecond.rows.length).toBe(1); // ZERO DUPLICATE ROWS
    expect(parseFloat(afterSecond.rows[0].spend)).toBe(12.00);
    expect(parseInt(afterSecond.rows[0].clicks, 10)).toBe(25);
    expect(parseInt(afterSecond.rows[0].impressions, 10)).toBe(600);
  });

  it('3. COHORT ISOLATION TEST: Distinct age/gender cohorts persist independently without collision', async () => {
    const cohorts = [
      { age: '45-54', gender: 'male', spend: 15.00, clicks: 30 },
      { age: '45-54', gender: 'female', spend: 20.00, clicks: 40 },
      { age: '55-64', gender: 'male', spend: 10.00, clicks: 18 },
      { age: '55-64', gender: 'female', spend: 12.00, clicks: 22 }
    ];

    for (const c of cohorts) {
      await pool.query(
        `INSERT INTO meta_demographic_insights (
          ad_account_id, campaign_id, adset_id, ad_id,
          entity_level, entity_meta_id,
          date_start, date_stop,
          age_group, gender,
          spend, impressions, clicks,
          is_demo, data_provenance
        ) VALUES (
          $1, $2, $3, $4,
          'AD', 'ad_demo_test_01',
          '2026-09-25', '2026-09-25',
          $5, $6,
          $7, 500, $8,
          false, 'COMMERCIAL_PRODUCTION'
        )`,
        [testAdAccountId, testCampaignId, testAdsetId, testAdId, c.age, c.gender, c.spend, c.clicks]
      );
    }

    const res = await pool.query('SELECT age_group, gender, spend, clicks FROM meta_demographic_insights ORDER BY age_group, gender');
    expect(res.rows.length).toBe(4);
    expect(res.rows[0].age_group).toBe('45-54');
    expect(res.rows[0].gender).toBe('female');
    expect(parseFloat(res.rows[0].spend)).toBe(20.00);
    expect(parseInt(res.rows[0].clicks, 10)).toBe(40);

    expect(res.rows[1].age_group).toBe('45-54');
    expect(res.rows[1].gender).toBe('male');
    expect(parseFloat(res.rows[1].spend)).toBe(15.00);
    expect(parseInt(res.rows[1].clicks, 10)).toBe(30);

    expect(res.rows[2].age_group).toBe('55-64');
    expect(res.rows[2].gender).toBe('female');
    expect(parseFloat(res.rows[2].spend)).toBe(12.00);
    expect(parseInt(res.rows[2].clicks, 10)).toBe(22);

    expect(res.rows[3].age_group).toBe('55-64');
    expect(res.rows[3].gender).toBe('male');
    expect(parseFloat(res.rows[3].spend)).toBe(10.00);
    expect(parseInt(res.rows[3].clicks, 10)).toBe(18);
  });

  it('4. DEMO / REAL ISOLATION TEST: is_demo=true and is_demo=false coexist without unique constraint collision', async () => {
    // Insert Real
    await pool.query(
      `INSERT INTO meta_demographic_insights (
        ad_account_id, campaign_id, adset_id, ad_id,
        entity_level, entity_meta_id,
        date_start, date_stop,
        age_group, gender,
        spend, impressions, clicks,
        is_demo, data_provenance
      ) VALUES (
        $1, $2, $3, $4,
        'AD', 'ad_demo_test_01',
        '2026-09-25', '2026-09-25',
        '45-54', 'male',
        50.00, 1000, 80,
        false, 'COMMERCIAL_PRODUCTION'
      )`,
      [testAdAccountId, testCampaignId, testAdsetId, testAdId]
    );

    // Insert Demo (same ad/date/cohort)
    await pool.query(
      `INSERT INTO meta_demographic_insights (
        ad_account_id, campaign_id, adset_id, ad_id,
        entity_level, entity_meta_id,
        date_start, date_stop,
        age_group, gender,
        spend, impressions, clicks,
        is_demo, data_provenance
      ) VALUES (
        $1, $2, $3, $4,
        'AD', 'ad_demo_test_01',
        '2026-09-25', '2026-09-25',
        '45-54', 'male',
        30.00, 600, 45,
        true, 'DEMO_SEED'
      )`,
      [testAdAccountId, testCampaignId, testAdsetId, testAdId]
    );

    const realRows = await pool.query('SELECT * FROM meta_demographic_insights WHERE is_demo = false');
    const demoRows = await pool.query('SELECT * FROM meta_demographic_insights WHERE is_demo = true');
    expect(realRows.rows.length).toBe(1);
    expect(demoRows.rows.length).toBe(1);
    expect(parseFloat(realRows.rows[0].spend)).toBe(50.00);
    expect(parseFloat(demoRows.rows[0].spend)).toBe(30.00);
  });

  it('5. DAILY GUARD TEST: Multi-day snapshot insertion is strictly rejected by CHECK constraint', async () => {
    let errorCaught: any = null;
    try {
      await pool.query(
        `INSERT INTO meta_demographic_insights (
          ad_account_id, campaign_id, adset_id, ad_id,
          entity_level, entity_meta_id,
          date_start, date_stop,
          age_group, gender,
          spend, impressions, clicks,
          is_demo, data_provenance
        ) VALUES (
          $1, $2, $3, $4,
          'AD', 'ad_demo_test_01',
          '2026-09-01', '2026-09-25',
          '45-54', 'male',
          100.00, 2000, 150,
          false, 'COMMERCIAL_PRODUCTION'
        )`,
        [testAdAccountId, testCampaignId, testAdsetId, testAdId]
      );
    } catch (err: any) {
      errorCaught = err;
    }

    expect(errorCaught).not.toBeNull();
    expect(errorCaught.message).toMatch(/chk_meta_demo_daily_only|check constraint/i);
  });

  it('6. DOMAIN GUARDS: Invalid age_group or gender values are strictly rejected', async () => {
    // Invalid age
    let ageError: any = null;
    try {
      await pool.query(
        `INSERT INTO meta_demographic_insights (
          ad_account_id, campaign_id, adset_id, ad_id,
          entity_level, entity_meta_id,
          date_start, date_stop,
          age_group, gender,
          spend, impressions, clicks,
          is_demo, data_provenance
        ) VALUES (
          $1, $2, $3, $4,
          'AD', 'ad_demo_test_01',
          '2026-09-25', '2026-09-25',
          'under_18_invalid', 'male',
          10.00, 100, 5,
          false, 'COMMERCIAL_PRODUCTION'
        )`,
        [testAdAccountId, testCampaignId, testAdsetId, testAdId]
      );
    } catch (err: any) {
      ageError = err;
    }
    expect(ageError).not.toBeNull();

    // Invalid gender
    let genderError: any = null;
    try {
      await pool.query(
        `INSERT INTO meta_demographic_insights (
          ad_account_id, campaign_id, adset_id, ad_id,
          entity_level, entity_meta_id,
          date_start, date_stop,
          age_group, gender,
          spend, impressions, clicks,
          is_demo, data_provenance
        ) VALUES (
          $1, $2, $3, $4,
          'AD', 'ad_demo_test_01',
          '2026-09-25', '2026-09-25',
          '45-54', 'other_non_standard',
          10.00, 100, 5,
          false, 'COMMERCIAL_PRODUCTION'
        )`,
        [testAdAccountId, testCampaignId, testAdsetId, testAdId]
      );
    } catch (err: any) {
      genderError = err;
    }
    expect(genderError).not.toBeNull();
  });

  it('7. FINANCIAL ISOLATION: Demographic table population causes ZERO double counting in Financial Dashboard / DRE', async () => {
    // Insert canonical core meta_insights (Account Level: R$ 55.59 spend)
    await pool.query(
      `INSERT INTO meta_insights (
        ad_account_id, entity_level, entity_meta_id,
        date_start, date_stop,
        spend, impressions, clicks,
        is_demo, data_provenance
      ) VALUES (
        $1, 'ACCOUNT', 'act_demo_test_01',
        '2026-09-25', '2026-09-25',
        55.59, 1200, 95,
        false, 'COMMERCIAL_PRODUCTION'
      )`,
      [testAdAccountId]
    );

    // Insert demographic slices in meta_demographic_insights (summing to R$ 55.59)
    await pool.query(
      `INSERT INTO meta_demographic_insights (
        ad_account_id, campaign_id, adset_id, ad_id,
        entity_level, entity_meta_id,
        date_start, date_stop,
        age_group, gender,
        spend, impressions, clicks,
        is_demo, data_provenance
      ) VALUES 
        ($1, $2, $3, $4, 'AD', 'ad_demo_test_01', '2026-09-25', '2026-09-25', '45-54', 'female', 35.59, 800, 60, false, 'COMMERCIAL_PRODUCTION'),
        ($1, $2, $3, $4, 'AD', 'ad_demo_test_01', '2026-09-25', '2026-09-25', '55-64', 'female', 20.00, 400, 35, false, 'COMMERCIAL_PRODUCTION')
      `,
      [testAdAccountId, testCampaignId, testAdsetId, testAdId]
    );

    // Query Financial Dashboard
    const res = await request(app).get('/api/financial/dashboard?mode=real&period=today');
    expect(res.status).toBe(200);
    // Total spend must strictly remain R$ 55.59 (from meta_insights) and NOT R$ 111.18 (double counted)
    expect(res.body.summary.totalSpend).toBe(55.59);

    // Query B2 Attribution Analytics
    const b2Report = await getAttributionAnalyticsReport(pool, { mode: 'real', period: 'today' });
    expect(b2Report.attributedMediaTruth.account.spend).toBe(55.59); // Isolated and pristine
    expect(b2Report.globalCommercialTruth.paidMediaSpend).toBe(55.59);
  });
});
