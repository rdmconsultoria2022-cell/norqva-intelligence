import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import {
  parseTimeRangeWindow,
  calculateAttributionMetrics,
  getAttributionAnalyticsReport
} from '../services/attribution/attributionAnalyticsService';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';

describe('NORQVA — Attribution Analytics & Performance Intelligence Suite (Step B2)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
  });

  beforeEach(async () => {
    // Clean up test data between runs
    const stmts = [
      `DELETE FROM commercial_funnel_events`,
      `DELETE FROM payments`,
      `DELETE FROM order_items`,
      `DELETE FROM orders`,
      `DELETE FROM meta_insights`,
      `DELETE FROM meta_ads`,
      `DELETE FROM meta_ad_sets`,
      `DELETE FROM meta_campaigns`,
      `DELETE FROM meta_ad_accounts`,
      `DELETE FROM meta_connections`,
      `DELETE FROM customers`
    ];
    for (const sql of stmts) {
      try {
        await pool.query(sql);
      } catch (_) {}
    }
  });

  describe('1. Metric Rate Calculations & Division-by-Zero Protection (A - P)', () => {
    it('A: spend > 0 & attributed orders > 0 computes correct CAC, ROAS, AOV', () => {
      const res = calculateAttributionMetrics({
        spend: 100,
        grossRevenue: 200,
        attributedRevenue: 200,
        totalPaidOrders: 10,
        attributedPaidOrders: 10,
        uniqueVisitors: 100,
        impressions: 1000,
        clicks: 50
      });

      expect(res.cac).toBe(10); // 100 / 10
      expect(res.roas).toBe(2); // 200 / 100
      expect(res.commercialAov).toBe(20);
      expect(res.attributedAov).toBe(20);
      expect(res.conversionRate).toBe(10); // 10 / 100 * 100%
      expect(res.orderAttributionRate).toBe(100);
      expect(res.revenueAttributionRate).toBe(100);
      expect(res.sampleStatus).toBe('OBSERVING');
      expect(res.sampleSizeNotice).toBeNull();
      expect(res.qualityWarning).toBeNull();
    });

    it('B: spend = 0 returns null for ROAS/CPC/CPM, no NaN or Infinity', () => {
      const res = calculateAttributionMetrics({
        spend: 0,
        grossRevenue: 100,
        attributedRevenue: 100,
        totalPaidOrders: 5,
        attributedPaidOrders: 5
      });

      expect(res.roas).toBeNull();
      expect(res.cac).toBe(0);
      expect(res.cpc).toBeNull();
      expect(res.cpm).toBeNull();
      expect(Number.isNaN(res.roas)).toBe(false);
      expect(Number.isFinite(res.roas || 0)).toBe(true);
    });

    it('C: attributed orders = 0 returns null CAC and attributed AOV', () => {
      const res = calculateAttributionMetrics({
        spend: 50,
        grossRevenue: 100,
        attributedRevenue: 0,
        totalPaidOrders: 5,
        attributedPaidOrders: 0
      });

      expect(res.cac).toBeNull();
      expect(res.attributedAov).toBeNull();
      expect(res.roas).toBe(0);
      expect(res.orderAttributionRate).toBe(0);
      expect(res.revenueAttributionRate).toBe(0);
      expect(res.sampleStatus).toBe('INSUFFICIENT_DATA');
      expect(res.sampleSizeNotice).toContain('Base amostral ainda insuficiente');
      expect(res.qualityWarning).toContain('Parte relevante das vendas');
    });

    it('D: gross revenue > attributed revenue isolates non-attributed volume', () => {
      const res = calculateAttributionMetrics({
        spend: 50,
        grossRevenue: 200,
        attributedRevenue: 100,
        totalPaidOrders: 4,
        attributedPaidOrders: 2
      });

      expect(res.revenueAttributionRate).toBe(50);
      expect(res.orderAttributionRate).toBe(50);
      expect(res.commercialAov).toBe(50);
      expect(res.attributedAov).toBe(50);
      expect(res.qualityWarning).toContain('Parte relevante das vendas');
    });

    it('E & F: 100% and 0% attribution rates calculated cleanly', () => {
      const full = calculateAttributionMetrics({
        spend: 10,
        grossRevenue: 100,
        attributedRevenue: 100,
        totalPaidOrders: 5,
        attributedPaidOrders: 5
      });
      expect(full.orderAttributionRate).toBe(100);
      expect(full.revenueAttributionRate).toBe(100);
      expect(full.qualityWarning).toBeNull();

      const zero = calculateAttributionMetrics({
        spend: 10,
        grossRevenue: 100,
        attributedRevenue: 0,
        totalPaidOrders: 5,
        attributedPaidOrders: 0
      });
      expect(zero.orderAttributionRate).toBe(0);
      expect(zero.revenueAttributionRate).toBe(0);
      expect(zero.qualityWarning).not.toBeNull();
    });

    it('O: Division-by-zero protection across all parameters with zero denominators', () => {
      const zeroDiv = calculateAttributionMetrics({
        spend: 0,
        grossRevenue: 0,
        attributedRevenue: 0,
        totalPaidOrders: 0,
        attributedPaidOrders: 0,
        uniqueVisitors: 0,
        impressions: 0,
        clicks: 0
      });

      expect(zeroDiv.cac).toBeNull();
      expect(zeroDiv.roas).toBeNull();
      expect(zeroDiv.commercialAov).toBeNull();
      expect(zeroDiv.attributedAov).toBeNull();
      expect(zeroDiv.conversionRate).toBeNull();
      expect(zeroDiv.orderAttributionRate).toBeNull();
      expect(zeroDiv.revenueAttributionRate).toBeNull();
      expect(zeroDiv.ctr).toBeNull();
      expect(zeroDiv.cpc).toBeNull();
      expect(zeroDiv.cpm).toBeNull();
      expect(zeroDiv.sampleStatus).toBe('NO_DATA');
    });

    it('P: Insufficient sample size guard strictly enforces INSUFFICIENT_DATA when attributed orders < 3', () => {
      // 1 Attributed order with high ROAS
      const singleOrder = calculateAttributionMetrics({
        spend: 10,
        grossRevenue: 100,
        attributedRevenue: 100,
        totalPaidOrders: 1,
        attributedPaidOrders: 1
      });

      expect(singleOrder.roas).toBe(10);
      expect(singleOrder.sampleStatus).toBe('INSUFFICIENT_DATA');
      expect(singleOrder.sampleSizeNotice).toContain('Base amostral ainda insuficiente para decisão de otimização.');

      // 2 Attributed orders
      const twoOrders = calculateAttributionMetrics({
        spend: 20,
        grossRevenue: 100,
        attributedRevenue: 100,
        totalPaidOrders: 2,
        attributedPaidOrders: 2
      });
      expect(twoOrders.sampleStatus).toBe('INSUFFICIENT_DATA');

      // 3 Attributed orders reaches OBSERVING
      const threeOrders = calculateAttributionMetrics({
        spend: 30,
        grossRevenue: 100,
        attributedRevenue: 100,
        totalPaidOrders: 3,
        attributedPaidOrders: 3
      });
      expect(threeOrders.sampleStatus).toBe('OBSERVING');
      expect(threeOrders.sampleSizeNotice).toBeNull();
    });
  });

  describe('2. Time Window Normalization (K, S, W)', () => {
    it('S & K: parseTimeRangeWindow correctly bounds today, 7d, 30d, and custom ranges', () => {
      const today = parseTimeRangeWindow('today');
      expect(today.period).toBe('today');
      expect(today.startDate.getTime()).toBeLessThanOrEqual(today.endDate.getTime());

      const sevenDays = parseTimeRangeWindow('7d');
      expect(sevenDays.period).toBe('7d');
      const diff7d = sevenDays.endDate.getTime() - sevenDays.startDate.getTime();
      expect(diff7d).toBeGreaterThanOrEqual(6.9 * 24 * 3600 * 1000);

      const thirtyDays = parseTimeRangeWindow('30d');
      expect(thirtyDays.period).toBe('30d');

      const custom = parseTimeRangeWindow('custom', '2026-09-01T00:00:00.000Z', '2026-09-10T23:59:59.999Z');
      expect(custom.period).toBe('custom');
      expect(custom.startDateIso).toBe('2026-09-01T00:00:00.000Z');
      expect(custom.endDateIso).toBe('2026-09-10T23:59:59.999Z');
    });

    it('Disallows unbounded "all" by defaulting to 30d with strict date window enforcement', () => {
      const fallback = parseTimeRangeWindow('all');
      expect(fallback.period).toBe('30d');
      expect(fallback.startDate).toBeInstanceOf(Date);
      expect(fallback.endDate).toBeInstanceOf(Date);
    });
  });

  describe('3. Database Attribution Report Engine (G - N, T - Z)', () => {
    it('Executes full analytics query with strict entity isolation, commercial truth, and attribution rates', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);

      // Seed Meta connection & account
      const connRes = await pool.query(`
        INSERT INTO meta_connections (id, meta_user_id, status, is_demo)
        VALUES (gen_random_uuid(), 'usr_01', 'CONNECTED', FALSE) RETURNING id
      `);
      const connId = connRes.rows[0].id;

      const accRes = await pool.query(`
        INSERT INTO meta_ad_accounts (id, connection_id, meta_account_id, name, currency, account_status, is_demo)
        VALUES (gen_random_uuid(), $1, 'act_1001', 'Conta Real', 'BRL', 1, FALSE) RETURNING id
      `, [connId]);
      const accId = accRes.rows[0].id;

      // Seed Campaign A & Campaign B
      const campARes = await pool.query(`
        INSERT INTO meta_campaigns (id, ad_account_id, meta_campaign_id, name, status, effective_status, is_demo, data_provenance)
        VALUES (gen_random_uuid(), $1, '120249371827010097', 'TRATTORIA EM CASA - CONVERSAO PIX', 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id
      `, [accId]);
      const campAId = campARes.rows[0].id;

      const campBRes = await pool.query(`
        INSERT INTO meta_campaigns (id, ad_account_id, meta_campaign_id, name, status, effective_status, is_demo, data_provenance)
        VALUES (gen_random_uuid(), $1, '999999999999999999', 'OUTRA CAMPANHA', 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id
      `, [accId]);
      const campBId = campBRes.rows[0].id;

      // Seed AdSet under Campaign A
      const adsetRes = await pool.query(`
        INSERT INTO meta_ad_sets (id, campaign_id, meta_adset_id, name, status, effective_status, is_demo, data_provenance)
        VALUES (gen_random_uuid(), $1, '120249371827510097', 'ADSET_CONVERSAO_GASTRONOMIA', 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id
      `, [campAId]);
      const adsetId = adsetRes.rows[0].id;

      // Seed Ad under AdSet
      const adRes = await pool.query(`
        INSERT INTO meta_ads (id, adset_id, meta_ad_id, name, status, effective_status, is_demo, data_provenance)
        VALUES (gen_random_uuid(), $1, '120249371828010097', 'CRIATIVO_01_VIDEO_CHEF', 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id
      `, [adsetId]);
      const adId = adRes.rows[0].id;

      // Seed Insights for Campaign A (Spend = 50.00, Clicks = 25, Impressions = 500)
      await pool.query(`
        INSERT INTO meta_insights (id, ad_account_id, campaign_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo, data_provenance)
        VALUES (gen_random_uuid(), $1, $2, 'CAMPAIGN', '120249371827010097', $3, $3, 50.00, 500, 25, FALSE, 'COMMERCIAL_PRODUCTION')
      `, [accId, campAId, yesterday]);

      // Seed Customer
      const custRes = await pool.query(`
        INSERT INTO customers (id, email, name) VALUES (gen_random_uuid(), 'buyer@example.com', 'Comprador Real') RETURNING id
      `);
      const custId = custRes.rows[0].id;

      // Seed 2 Paid Orders:
      // Order 1: Baseline Unattributed (Gross = 19.90, status = PAID)
      await pool.query(`
        INSERT INTO orders (id, customer_id, total_amount, status, is_demo, data_provenance, idempotency_key, created_at)
        VALUES (gen_random_uuid(), $1, 19.90, 'PAID', FALSE, 'COMMERCIAL_PRODUCTION', 'idem_01', $2)
      `, [custId, yesterday]);

      // Order 2: Deterministically Attributed to Ad (Gross = 19.90, status = PAID)
      await pool.query(`
        INSERT INTO orders (id, customer_id, total_amount, status, is_demo, data_provenance, idempotency_key, utm_source, utm_campaign, utm_content, attribution_metadata, created_at)
        VALUES (gen_random_uuid(), $1, 19.90, 'PAID', FALSE, 'COMMERCIAL_PRODUCTION', 'idem_02', 'meta', '120249371827010097', '120249371828010097', $2, $3)
      `, [custId, JSON.stringify({ campaign_id: '120249371827010097', adset_id: '120249371827510097', ad_id: '120249371828010097' }), yesterday]);

      // Order 3: Demo Order (Should be completely ignored in real mode)
      await pool.query(`
        INSERT INTO orders (id, customer_id, total_amount, status, is_demo, data_provenance, idempotency_key, created_at)
        VALUES (gen_random_uuid(), $1, 99.00, 'PAID', TRUE, 'DEMO_SEED', 'idem_03', $2)
      `, [custId, yesterday]);

      // Order 4: Unpaid PENDING Order (Should not add to revenue)
      await pool.query(`
        INSERT INTO orders (id, customer_id, total_amount, status, is_demo, data_provenance, idempotency_key, created_at)
        VALUES (gen_random_uuid(), $1, 19.90, 'PENDING', FALSE, 'COMMERCIAL_PRODUCTION', 'idem_04', $2)
      `, [custId, yesterday]);

      // Funnel Telemetry: 10 Unique Visitors (X & W)
      for (let i = 1; i <= 10; i++) {
        await pool.query(`
          INSERT INTO commercial_funnel_events (id, event_id, event_type, visitor_id, session_id, is_demo, created_at)
          VALUES (gen_random_uuid(), $1, 'LANDING_PAGE_VIEW', $2, $3, FALSE, $4)
        `, [`evt_${i}`, `visitor_${i}`, `sess_${i}`, yesterday]);
      }
      // Duplicate event for visitor_1 should not inflate unique visitor count (X)
      await pool.query(`
        INSERT INTO commercial_funnel_events (id, event_id, event_type, visitor_id, session_id, is_demo, created_at)
        VALUES (gen_random_uuid(), 'evt_dup', 'OFFER_VIEW', 'visitor_1', 'sess_1', FALSE, $1)
      `, [yesterday]);

      // Execute Analytics Report
      const report = await getAttributionAnalyticsReport(pool, { mode: 'real', period: '7d' });

      // Assert Global Commercial Truth (Y)
      expect(report.globalCommercialTruth.totalOrdersCount).toBe(3); // 2 paid + 1 pending (demo ignored)
      expect(report.globalCommercialTruth.paidOrdersCount).toBe(2);
      expect(report.globalCommercialTruth.grossRevenue).toBe(39.80);
      expect(report.globalCommercialTruth.commercialAov).toBe(19.90);

      // Assert Attributed Media Truth
      expect(report.attributedMediaTruth.commercialRollup.attributedPaidOrders).toBe(1);
      expect(report.attributedMediaTruth.commercialRollup.attributedRevenue).toBe(19.90);
      expect(report.attributedMediaTruth.commercialRollup.organicOrdersCount).toBe(1);
      expect(report.attributedMediaTruth.commercialRollup.organicRevenue).toBe(19.90);
      expect(report.attributedMediaTruth.commercialRollup.unattributedOrdersCount).toBe(0);
      expect(report.attributedMediaTruth.commercialRollup.unattributedRevenue).toBe(0.00);
      expect(report.attributedMediaTruth.commercialRollup.uniqueVisitors).toBe(10); // Deduplicated

      // Assert Rates
      expect(report.attributedMediaTruth.rates.orderAttributionRate).toBe(50);
      expect(report.attributedMediaTruth.rates.revenueAttributionRate).toBe(50);
      expect(report.attributedMediaTruth.rates.attributedAov).toBe(19.90);
      expect(report.attributedMediaTruth.rates.conversionRate).toBe(10); // 1 / 10 * 100%
      expect(report.attributedMediaTruth.rates.cac).toBe(50.00); // 50 spend / 1 order
      expect(report.attributedMediaTruth.rates.roas).toBe(0.40); // 19.90 / 50.00
      expect(report.attributedMediaTruth.rates.sampleStatus).toBe('INSUFFICIENT_DATA');
      expect(report.attributedMediaTruth.rates.qualityWarning).toContain('Parte relevante das vendas');

      // Assert Campaign Isolation (T)
      const campA = report.byCampaign.find(c => c.metaCampaignId === '120249371827010097');
      expect(campA).toBeDefined();
      expect(campA?.spend).toBe(50.00);
      expect(campA?.attributedOrders).toBe(1);
      expect(campA?.attributedRevenue).toBe(19.90);
      expect(campA?.roas).toBe(0.40);
      expect(campA?.cac).toBe(50.00);

      const campB = report.byCampaign.find(c => c.metaCampaignId === '999999999999999999');
      expect(campB).toBeDefined();
      expect(campB?.spend).toBe(0);
      expect(campB?.attributedOrders).toBe(0);
      expect(campB?.attributedRevenue).toBe(0);
      expect(campB?.cac).toBeNull();
      expect(campB?.roas).toBeNull();

      // Assert AdSet & Ad Isolation (U & V)
      const adset = report.byAdSet.find(as => as.metaAdsetId === '120249371827510097');
      expect(adset).toBeDefined();
      expect(adset?.attributedOrders).toBe(1);
      expect(adset?.attributedRevenue).toBe(19.90);

      const ad = report.byAd.find(a => a.metaAdId === '120249371828010097');
      expect(ad).toBeDefined();
      expect(ad?.attributedOrders).toBe(1);
      expect(ad?.attributedRevenue).toBe(19.90);

      // Assert Non-attributed revenue never leaks into Meta entities (Z)
      const totalCampaignRevenue = report.byCampaign.reduce((sum, c) => sum + c.attributedRevenue, 0);
      expect(totalCampaignRevenue).toBe(19.90); // NOT 39.80
    });
  });
});
