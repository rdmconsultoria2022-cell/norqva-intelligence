import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { Pool } from 'pg';
import crypto from 'crypto';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import {
  getCommercialTimeBoundaries,
  COMMERCIAL_TIMEZONE,
  getLocalComponentsInTimezone
} from '../utils/commercialTimezone';
import { getFinancialDashboard } from '../controllers/api';
import { getAttributionAnalyticsReport } from '../services/attribution/attributionAnalyticsService';
import { MetaSyncService } from '../services/meta/metaSyncService';
import { MetaClient } from '../services/meta/metaClient';

describe('GATE: 16.4E — PERIOD SEMANTICS & DAILY META INSIGHTS HOTFIX', () => {
  let pool: Pool;
  let app: Express;
  const adminUserId = crypto.randomUUID();

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
  });

  beforeEach(async () => {
    const stmts = [
      'DELETE FROM commercial_funnel_events',
      'DELETE FROM payments',
      'DELETE FROM order_items',
      'DELETE FROM orders',
      'DELETE FROM meta_insights',
      'DELETE FROM meta_ads',
      'DELETE FROM meta_ad_sets',
      'DELETE FROM meta_campaigns',
      'DELETE FROM meta_ad_accounts',
      'DELETE FROM meta_connections',
      'DELETE FROM customers'
    ];
    for (const sql of stmts) {
      try {
        await pool.query(sql);
      } catch (_) {}
    }

    // Setup Express App
    app = express();
    app.use(express.json());
    app.set('db', pool);

    // Mock Auth middleware
    app.use((req: any, _res: any, next: any) => {
      req.user = { id: adminUserId, email: 'admin@norqva.com', role: 'ADMIN' };
      next();
    });

    app.get('/api/financial/dashboard', getFinancialDashboard);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  // 1. period=today does NOT generate startDate NULL
  it('1. period=today does not generate startDate NULL and sets exact bounds', () => {
    const fixedBase = new Date('2026-09-25T15:00:00.000Z');
    const bounds = getCommercialTimeBoundaries('today', undefined, undefined, fixedBase);
    expect(bounds.startDateIso).toBeDefined();
    expect(bounds.startDateIso).not.toBeNull();
    expect(bounds.endDateIso).toBeDefined();
    expect(bounds.endDateIso).not.toBeNull();
    expect(bounds.dateStartMeta).toBe('2026-09-25');
    expect(bounds.dateStopMeta).toBe('2026-09-25');
  });

  // 2. today has correct lower and upper bounds
  it('2. today has correct lower and upper bounds for America/Sao_Paulo', () => {
    const fixedBase = new Date('2026-09-25T12:00:00.000Z');
    const bounds = getCommercialTimeBoundaries('today', undefined, undefined, fixedBase, 'America/Sao_Paulo');
    // Sao Paulo is UTC-3. 2026-09-25 00:00:00 is 2026-09-25T03:00:00.000Z
    // 2026-09-25 23:59:59.999 is 2026-09-26T02:59:59.999Z
    expect(bounds.startDateIso).toBe('2026-09-25T03:00:00.000Z');
    expect(bounds.endDateIso).toBe('2026-09-26T02:59:59.999Z');
  });

  // 3. timezone America/Sao_Paulo preserved
  it('3. timezone America/Sao_Paulo is strictly preserved', () => {
    expect(COMMERCIAL_TIMEZONE).toBe('America/Sao_Paulo');
  });

  // 4. yesterday correct
  it('4. yesterday computes exact lower and upper bounds for previous commercial day', () => {
    const fixedBase = new Date('2026-09-25T12:00:00.000Z');
    const bounds = getCommercialTimeBoundaries('yesterday', undefined, undefined, fixedBase, 'America/Sao_Paulo');
    expect(bounds.dateStartMeta).toBe('2026-09-24');
    expect(bounds.dateStopMeta).toBe('2026-09-24');
    expect(bounds.startDateIso).toBe('2026-09-24T03:00:00.000Z');
    expect(bounds.endDateIso).toBe('2026-09-25T02:59:59.999Z');
  });

  // 5. 7d correct
  it('5. 7d computes exact 7-day window ending at today 23:59:59.999', () => {
    const fixedBase = new Date('2026-09-25T12:00:00.000Z');
    const bounds = getCommercialTimeBoundaries('7d', undefined, undefined, fixedBase, 'America/Sao_Paulo');
    expect(bounds.dateStartMeta).toBe('2026-09-19');
    expect(bounds.dateStopMeta).toBe('2026-09-25');
    expect(bounds.startDateIso).toBe('2026-09-19T03:00:00.000Z');
    expect(bounds.endDateIso).toBe('2026-09-26T02:59:59.999Z');
  });

  // 6. 30d correct
  it('6. 30d computes exact 30-day window ending at today 23:59:59.999', () => {
    const fixedBase = new Date('2026-09-25T12:00:00.000Z');
    const bounds = getCommercialTimeBoundaries('30d', undefined, undefined, fixedBase, 'America/Sao_Paulo');
    expect(bounds.dateStartMeta).toBe('2026-08-27');
    expect(bounds.dateStopMeta).toBe('2026-09-25');
    expect(bounds.startDateIso).toBe('2026-08-27T03:00:00.000Z');
    expect(bounds.endDateIso).toBe('2026-09-26T02:59:59.999Z');
  });

  // 7. 90d correct
  it('7. 90d computes exact 90-day window ending at today 23:59:59.999', () => {
    const fixedBase = new Date('2026-09-25T12:00:00.000Z');
    const bounds = getCommercialTimeBoundaries('90d', undefined, undefined, fixedBase, 'America/Sao_Paulo');
    expect(bounds.dateStartMeta).toBe('2026-06-28');
    expect(bounds.dateStopMeta).toBe('2026-09-25');
    expect(bounds.endDateIso).toBe('2026-09-26T02:59:59.999Z');
  });

  // 8. snapshot 30d NOT included in today spend & 9. daily record included in today
  it('8 & 9. 30d snapshot is strictly excluded from today spend, while daily record is included', async () => {
    const connRes = await pool.query(
      "INSERT INTO meta_connections (is_demo, status, token_reference) VALUES (FALSE, 'CONNECTED', 'env:TEST') RETURNING id"
    );
    const connId = connRes.rows[0].id;

    const accRes = await pool.query(
      "INSERT INTO meta_ad_accounts (meta_account_id, connection_id, name, currency, timezone_name, account_status, is_demo, data_provenance) VALUES ('act_real_01', $1, 'Real Account', 'BRL', 'America/Sao_Paulo', 1, FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [connId]
    );
    const accId = accRes.rows[0].id;

    const cmpRes = await pool.query(
      "INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance) VALUES ('cmp_trattoria_01', $1, 'NORQVA_TRATTORIA_REVENUE_V1', 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [accId]
    );
    const cmpId = cmpRes.rows[0].id;

    const localToday = getLocalComponentsInTimezone(new Date(), 'America/Sao_Paulo').dateStr;

    // 1. Insert 30d snapshot with date_start != date_stop (e.g. 2026-08-26 to today)
    await pool.query(
      "INSERT INTO meta_insights (ad_account_id, campaign_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo, data_provenance) VALUES ($1, $2, 'CAMPAIGN', 'cmp_trattoria_01', '2026-08-26', $3, 1802.00, 50000, 1500, FALSE, 'COMMERCIAL_PRODUCTION')",
      [accId, cmpId, localToday]
    );

    // 2. Insert Daily record for TODAY with date_start == date_stop == localToday
    await pool.query(
      "INSERT INTO meta_insights (ad_account_id, campaign_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo, data_provenance) VALUES ($1, $2, 'CAMPAIGN', 'cmp_trattoria_01', $3, $3, 39.81, 1200, 45, FALSE, 'COMMERCIAL_PRODUCTION')",
      [accId, cmpId, localToday]
    );

    // Query Financial Dashboard for today
    const res = await request(app).get('/api/financial/dashboard?mode=real&period=today');
    expect(res.status).toBe(200);

    // The total spend on today MUST BE exactly R$ 39.81 (the daily record), NOT R$ 1802.00 (the 30d snapshot) or R$ 1841.81 (sum)!
    expect(res.body.summary.totalSpend).toBe(39.81);
    expect(res.body.byCampaign[0].spend).toBe(39.81);
  });

  // 10. daily + snapshot aggregate does NOT generate double counting
  it('10. daily records + snapshot aggregate in same period do not generate double counting', async () => {
    const connRes = await pool.query(
      "INSERT INTO meta_connections (is_demo, status, token_reference) VALUES (FALSE, 'CONNECTED', 'env:TEST') RETURNING id"
    );
    const connId = connRes.rows[0].id;

    const accRes = await pool.query(
      "INSERT INTO meta_ad_accounts (meta_account_id, connection_id, name, currency, timezone_name, account_status, is_demo, data_provenance) VALUES ('act_real_02', $1, 'Real Account', 'BRL', 'America/Sao_Paulo', 1, FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [connId]
    );
    const accId = accRes.rows[0].id;

    const cmpRes = await pool.query(
      "INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance) VALUES ('cmp_trattoria_02', $1, 'NORQVA_TRATTORIA_REVENUE_V1', 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [accId]
    );
    const cmpId = cmpRes.rows[0].id;

    // Insert 30d snapshot (spend = 100.00)
    await pool.query(
      "INSERT INTO meta_insights (ad_account_id, campaign_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo, data_provenance) VALUES ($1, $2, 'CAMPAIGN', 'cmp_trattoria_02', '2026-08-27', '2026-09-25', 100.00, 3000, 100, FALSE, 'COMMERCIAL_PRODUCTION')",
      [accId, cmpId]
    );

    // Insert 2 daily records for recent days (spend = 20.00 and spend = 30.00 -> sum = 50.00)
    await pool.query(
      "INSERT INTO meta_insights (ad_account_id, campaign_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo, data_provenance) VALUES ($1, $2, 'CAMPAIGN', 'cmp_trattoria_02', '2026-09-24', '2026-09-24', 20.00, 600, 20, FALSE, 'COMMERCIAL_PRODUCTION')",
      [accId, cmpId]
    );
    await pool.query(
      "INSERT INTO meta_insights (ad_account_id, campaign_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo, data_provenance) VALUES ($1, $2, 'CAMPAIGN', 'cmp_trattoria_02', '2026-09-25', '2026-09-25', 30.00, 900, 30, FALSE, 'COMMERCIAL_PRODUCTION')",
      [accId, cmpId]
    );

    // Query 30d
    const fixedBase = new Date('2026-09-25T15:00:00.000Z');
    const report = await getAttributionAnalyticsReport(pool, {
      mode: 'real',
      period: '30d',
      baseDate: fixedBase
    });

    // The report must sum strictly the daily records (20 + 30 = 50.00), NOT 100 + 50 = 150.00!
    expect(report.globalCommercialTruth.paidMediaSpend).toBe(50.00);
    const cmp = report.byCampaign.find(c => c.metaCampaignId === 'cmp_trattoria_02');
    expect(cmp?.spend).toBe(50.00);
  });

  // 11. B2 returns daily correctly
  it('11. B2 attribution report returns daily metrics correctly for today', async () => {
    const connRes = await pool.query(
      "INSERT INTO meta_connections (is_demo, status, token_reference) VALUES (FALSE, 'CONNECTED', 'env:TEST') RETURNING id"
    );
    const connId = connRes.rows[0].id;

    const accRes = await pool.query(
      "INSERT INTO meta_ad_accounts (meta_account_id, connection_id, name, currency, timezone_name, account_status, is_demo, data_provenance) VALUES ('act_real_03', $1, 'Real Account', 'BRL', 'America/Sao_Paulo', 1, FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [connId]
    );
    const accId = accRes.rows[0].id;

    const cmpRes = await pool.query(
      "INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance) VALUES ('cmp_b2_01', $1, 'NORQVA_TRATTORIA_REVENUE_V1', 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [accId]
    );
    const cmpId = cmpRes.rows[0].id;

    const fixedBase = new Date('2026-09-25T15:00:00.000Z');

    // Insert daily record for 2026-09-25
    await pool.query(
      "INSERT INTO meta_insights (ad_account_id, campaign_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo, data_provenance) VALUES ($1, $2, 'CAMPAIGN', 'cmp_b2_01', '2026-09-25', '2026-09-25', 42.50, 1500, 60, FALSE, 'COMMERCIAL_PRODUCTION')",
      [accId, cmpId]
    );

    const report = await getAttributionAnalyticsReport(pool, {
      mode: 'real',
      period: 'today',
      baseDate: fixedBase
    });

    expect(report.globalCommercialTruth.paidMediaSpend).toBe(42.50);
    const cmp = report.byCampaign.find(c => c.metaCampaignId === 'cmp_b2_01');
    expect(cmp?.spend).toBe(42.50);
  });

  // 12. absence of daily does not convert snapshot 30d into daily spend
  it('12. absence of daily record returns 0.00 for today and does NOT convert 30d snapshot', async () => {
    const connRes = await pool.query(
      "INSERT INTO meta_connections (is_demo, status, token_reference) VALUES (FALSE, 'CONNECTED', 'env:TEST') RETURNING id"
    );
    const connId = connRes.rows[0].id;

    const accRes = await pool.query(
      "INSERT INTO meta_ad_accounts (meta_account_id, connection_id, name, currency, timezone_name, account_status, is_demo, data_provenance) VALUES ('act_real_04', $1, 'Real Account', 'BRL', 'America/Sao_Paulo', 1, FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [connId]
    );
    const accId = accRes.rows[0].id;

    const cmpRes = await pool.query(
      "INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance) VALUES ('cmp_b2_02', $1, 'NORQVA_TRATTORIA_REVENUE_V1', 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [accId]
    );
    const cmpId = cmpRes.rows[0].id;

    // Only a multi-day snapshot exists
    await pool.query(
      "INSERT INTO meta_insights (ad_account_id, campaign_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo, data_provenance) VALUES ($1, $2, 'CAMPAIGN', 'cmp_b2_02', '2026-08-26', '2026-09-25', 999.00, 25000, 800, FALSE, 'COMMERCIAL_PRODUCTION')",
      [accId, cmpId]
    );

    const fixedBase = new Date('2026-09-25T15:00:00.000Z');
    const report = await getAttributionAnalyticsReport(pool, {
      mode: 'real',
      period: 'today',
      baseDate: fixedBase
    });

    // Since no daily record exists for today, spend must be 0.00 (not 999.00)
    expect(report.globalCommercialTruth.paidMediaSpend).toBe(0.00);
    const cmp = report.byCampaign.find(c => c.metaCampaignId === 'cmp_b2_02');
    expect(cmp?.spend).toBe(0.00);
  });

  // 13. DEMO mode remains isolated
  it('13. DEMO mode remains isolated from COMMERCIAL_PRODUCTION data', async () => {
    const resDemo = await request(app).get('/api/financial/dashboard?mode=demo&period=today');
    expect(resDemo.status).toBe(200);
    expect(resDemo.body.mode).toBe('demo');

    const resReal = await request(app).get('/api/financial/dashboard?mode=real&period=today');
    expect(resReal.status).toBe(200);
    expect(resReal.body.mode).toBe('real');
  });

  // 14. COMMERCIAL_PRODUCTION remains preserved
  it('14. COMMERCIAL_PRODUCTION data is not polluted by UNKNOWN or DEMO records', async () => {
    const connRes = await pool.query(
      "INSERT INTO meta_connections (is_demo, status, token_reference) VALUES (FALSE, 'CONNECTED', 'env:TEST') RETURNING id"
    );
    const connId = connRes.rows[0].id;

    const accRes = await pool.query(
      "INSERT INTO meta_ad_accounts (meta_account_id, connection_id, name, currency, timezone_name, account_status, is_demo, data_provenance) VALUES ('act_real_05', $1, 'Real Account', 'BRL', 'America/Sao_Paulo', 1, FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [connId]
    );
    const accId = accRes.rows[0].id;

    const cmpUnknownRes = await pool.query(
      "INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance) VALUES ('cmp_unknown_01', $1, 'UNKNOWN_CAMPAIGN', 'ACTIVE', 'ACTIVE', FALSE, 'UNKNOWN') RETURNING id",
      [accId]
    );
    const cmpUnknownId = cmpUnknownRes.rows[0].id;

    const cmpProdRes = await pool.query(
      "INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance) VALUES ('cmp_prod_01', $1, 'NORQVA_TRATTORIA_REVENUE_V1', 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [accId]
    );
    const cmpProdId = cmpProdRes.rows[0].id;

    const localToday = getLocalComponentsInTimezone(new Date(), 'America/Sao_Paulo').dateStr;

    // UNKNOWN provenance daily record -> Must be excluded
    await pool.query(
      "INSERT INTO meta_insights (ad_account_id, campaign_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo, data_provenance) VALUES ($1, $2, 'CAMPAIGN', 'cmp_unknown_01', $3, $3, 500.00, 10000, 300, FALSE, 'UNKNOWN')",
      [accId, cmpUnknownId, localToday]
    );

    // COMMERCIAL_PRODUCTION daily record -> Must be included
    await pool.query(
      "INSERT INTO meta_insights (ad_account_id, campaign_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo, data_provenance) VALUES ($1, $2, 'CAMPAIGN', 'cmp_prod_01', $3, $3, 75.00, 2000, 60, FALSE, 'COMMERCIAL_PRODUCTION')",
      [accId, cmpProdId, localToday]
    );

    const res = await request(app).get('/api/financial/dashboard?mode=real&period=today');
    expect(res.status).toBe(200);
    expect(res.body.summary.totalSpend).toBe(75.00); // 500.00 UNKNOWN is excluded
  });

  // 15. MetaSyncService requests time_increment=1
  it('15. MetaSyncService requests time_increment=1 by default for daily granularity', async () => {
    const mockClient = new MetaClient();
    const getInsightsSpy = vi.spyOn(mockClient, 'getInsights').mockResolvedValue([]);
    vi.spyOn(mockClient, 'getAdAccounts').mockResolvedValue([{
      id: 'act_123',
      name: 'Test Account',
      currency: 'BRL',
      timezone_name: 'America/Sao_Paulo',
      account_status: 1
    }]);
    vi.spyOn(mockClient, 'getCampaigns').mockResolvedValue([]);
    vi.spyOn(mockClient, 'getAdSets').mockResolvedValue([]);
    vi.spyOn(mockClient, 'getAds').mockResolvedValue([]);

    const syncService = new MetaSyncService(mockClient);
    await syncService.syncAll(pool, null, false);

    expect(getInsightsSpy).toHaveBeenCalled();
    // Verify 6th argument (timeIncrement) was passed as 1
    const calls = getInsightsSpy.mock.calls;
    expect(calls[0][5]).toBe(1);
    expect(calls[1][5]).toBe(1);
  });
});
