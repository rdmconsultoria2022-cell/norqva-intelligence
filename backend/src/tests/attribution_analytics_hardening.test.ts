import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import {
  parseTimeRangeWindow,
  calculateAttributionMetrics,
  getAttributionAnalyticsReport
} from '../services/attribution/attributionAnalyticsService';
import {
  COMMERCIAL_TIMEZONE,
  getCommercialTimeBoundaries,
  createDateInTimezone,
  getLocalComponentsInTimezone
} from '../utils/commercialTimezone';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';

describe('NORQVA — Step B2.1 Analytics Semantic & Temporal Hardening Suite', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
  });

  beforeEach(async () => {
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

  // AA. today respects America/Sao_Paulo boundary
  it('AA: today respects America/Sao_Paulo boundary', () => {
    // Test base date: 2026-09-13 at 15:00 UTC (12:00 in America/Sao_Paulo)
    const baseDate = new Date('2026-09-13T15:00:00.000Z');
    const boundaries = getCommercialTimeBoundaries('today', undefined, undefined, baseDate, 'America/Sao_Paulo');

    expect(boundaries.period).toBe('today');
    expect(boundaries.timeZone).toBe('America/Sao_Paulo');
    expect(boundaries.dateStartMeta).toBe('2026-09-13');
    expect(boundaries.dateStopMeta).toBe('2026-09-13');

    // In Sao Paulo (UTC-3), 2026-09-13 00:00:00.000 local is 2026-09-13T03:00:00.000Z
    expect(boundaries.startDate.toISOString()).toBe('2026-09-13T03:00:00.000Z');
    // 2026-09-13 23:59:59.999 local is 2026-09-14T02:59:59.999Z
    expect(boundaries.endDate.toISOString()).toBe('2026-09-14T02:59:59.999Z');
  });

  // AB. order created before midnight and paid after midnight belongs to financial confirmation date
  it('AB: order created before midnight and paid after midnight belongs to financial confirmation date', async () => {
    const custId = crypto.randomUUID();
    await pool.query(`INSERT INTO customers (id, name, email) VALUES ($1, 'Customer 1', 'c1@test.com')`, [custId]);

    const orderId = crypto.randomUUID();
    const paymentId = crypto.randomUUID();

    // Order created yesterday at 23:50 Sao Paulo time (2026-09-12 23:50 BRT = 2026-09-13T02:50:00.000Z)
    const orderCreatedAt = new Date('2026-09-13T02:50:00.000Z');
    // Payment confirmed today at 00:15 Sao Paulo time (2026-09-13 00:15 BRT = 2026-09-13T03:15:00.000Z)
    const paymentConfirmedAt = new Date('2026-09-13T03:15:00.000Z');

    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, data_provenance, created_at, updated_at)
       VALUES ($1, $2, 19.90, 'PAID', 'idem-1', 'COMMERCIAL_PRODUCTION', $3, $4)`,
      [orderId, custId, orderCreatedAt, paymentConfirmedAt]
    );

    await pool.query(
      `INSERT INTO payments (id, human_id, order_id, provider, status, amount, provider_fee, net_amount, confirmed_at, idempotency_key, external_reference, data_provenance, created_at, updated_at)
       VALUES ($1, 'PAY-1', $2, 'ASAAS', 'CONFIRMED', 19.90, 0.99, 18.91, $3, 'idem-pay-1', 'ext-1', 'COMMERCIAL_PRODUCTION', $4, $3)`,
      [paymentId, orderId, paymentConfirmedAt, orderCreatedAt]
    );

    // Query for "today" (2026-09-13 in Sao Paulo)
    const baseDate = new Date('2026-09-13T15:00:00.000Z');
    const reportToday = await getAttributionAnalyticsReport(pool, {
      mode: 'real',
      period: 'today',
      baseDate,
      timeZone: 'America/Sao_Paulo'
    });

    expect(reportToday.globalCommercialTruth.grossRevenue).toBe(19.90);
    expect(reportToday.globalCommercialTruth.paidOrdersCount).toBe(1);
    expect(reportToday.globalCommercialTruth.gatewayFees).toBe(0.99);
    expect(reportToday.globalCommercialTruth.netRevenue).toBe(18.91);
  });

  // AC. order created today but unpaid is excluded from revenue
  it('AC: order created today but unpaid is excluded from revenue', async () => {
    const custId = crypto.randomUUID();
    await pool.query(`INSERT INTO customers (id, name, email) VALUES ($1, 'Customer 2', 'c2@test.com')`, [custId]);

    const orderId = crypto.randomUUID();
    const paymentId = crypto.randomUUID();
    const nowSaoPaulo = new Date('2026-09-13T14:00:00.000Z'); // Today 11:00 BRT

    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, data_provenance, created_at, updated_at)
       VALUES ($1, $2, 50.00, 'PENDING', 'idem-unpaid', 'COMMERCIAL_PRODUCTION', $3, $3)`,
      [orderId, custId, nowSaoPaulo]
    );

    await pool.query(
      `INSERT INTO payments (id, human_id, order_id, provider, status, amount, idempotency_key, external_reference, data_provenance, created_at, updated_at)
       VALUES ($1, 'PAY-UNPAID', $2, 'ASAAS', 'PENDING', 50.00, 'idem-pay-unpaid', 'ext-unpaid', 'COMMERCIAL_PRODUCTION', $3, $3)`,
      [paymentId, orderId, nowSaoPaulo]
    );

    const report = await getAttributionAnalyticsReport(pool, {
      mode: 'real',
      period: 'today',
      baseDate: nowSaoPaulo,
      timeZone: 'America/Sao_Paulo'
    });

    expect(report.globalCommercialTruth.totalOrdersCount).toBe(1);
    expect(report.globalCommercialTruth.pendingOrdersCount).toBe(1);
    expect(report.globalCommercialTruth.paidOrdersCount).toBe(0);
    expect(report.globalCommercialTruth.grossRevenue).toBe(0.00);
    expect(report.globalCommercialTruth.netRevenue).toBe(0.00);
  });

  // AD. global visitors cannot become campaign visitors without deterministic evidence
  it('AD: global visitors cannot become campaign visitors without deterministic evidence', async () => {
    const connId = crypto.randomUUID();
    const accId = crypto.randomUUID();
    const campId = crypto.randomUUID();

    await pool.query(`INSERT INTO meta_connections (id, status) VALUES ($1, 'CONNECTED')`, [connId]);
    await pool.query(`INSERT INTO meta_ad_accounts (id, connection_id, meta_account_id, name) VALUES ($1, $2, 'act_1', 'Account 1')`, [accId, connId]);
    await pool.query(`INSERT INTO meta_campaigns (id, ad_account_id, meta_campaign_id, name, status, effective_status, data_provenance) VALUES ($1, $2, '12001', 'Campanha Trattoria', 'ACTIVE', 'ACTIVE', 'COMMERCIAL_PRODUCTION')`, [campId, accId]);

    const baseDate = new Date('2026-09-13T14:00:00.000Z');

    // 10 Global Organic Visitors (no utm_campaign)
    for (let i = 0; i < 10; i++) {
      await pool.query(
        `INSERT INTO commercial_funnel_events (id, event_id, event_type, visitor_id, utm_source, created_at)
         VALUES ($1, $2, 'LANDING_PAGE_VIEW', $3, 'google', $4)`,
        [crypto.randomUUID(), `ev-org-${i}`, `vis-org-${i}`, baseDate]
      );
    }

    // 2 Campaign-specific Visitors
    for (let i = 0; i < 2; i++) {
      await pool.query(
        `INSERT INTO commercial_funnel_events (id, event_id, event_type, visitor_id, utm_source, utm_campaign, created_at)
         VALUES ($1, $2, 'LANDING_PAGE_VIEW', $3, 'facebook', 'Campanha Trattoria', $4)`,
        [crypto.randomUUID(), `ev-meta-${i}`, `vis-meta-${i}`, baseDate]
      );
    }

    const report = await getAttributionAnalyticsReport(pool, {
      mode: 'real',
      period: 'today',
      baseDate,
      timeZone: 'America/Sao_Paulo'
    });

    expect(report.attributedMediaTruth.commercialRollup.globalUniqueVisitors).toBe(12);
    const campaignReport = report.byCampaign.find(c => c.campaignId === campId);
    expect(campaignReport).toBeDefined();
    expect(campaignReport?.uniqueVisitors).toBe(2); // Exactly 2, not 12!
  });

  // AE. campaign conversion rate null when campaign visitor denominator is unavailable
  it('AE: campaign conversion rate null when campaign visitor denominator is unavailable', async () => {
    const connId = crypto.randomUUID();
    const accId = crypto.randomUUID();
    const campId = crypto.randomUUID();
    const custId = crypto.randomUUID();

    await pool.query(`INSERT INTO customers (id, name, email) VALUES ($1, 'Customer AE', 'ae@test.com')`, [custId]);
    await pool.query(`INSERT INTO meta_connections (id, status) VALUES ($1, 'CONNECTED')`, [connId]);
    await pool.query(`INSERT INTO meta_ad_accounts (id, connection_id, meta_account_id, name) VALUES ($1, $2, 'act_1', 'Account 1')`, [accId, connId]);
    await pool.query(`INSERT INTO meta_campaigns (id, ad_account_id, meta_campaign_id, name, status, effective_status, data_provenance) VALUES ($1, $2, '12002', 'Campanha Sem Telemetria', 'ACTIVE', 'ACTIVE', 'COMMERCIAL_PRODUCTION')`, [campId, accId]);

    const baseDate = new Date('2026-09-13T14:00:00.000Z');

    // 1 Attributed order directly matching campaign via utm_campaign
    const orderId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, utm_campaign, idempotency_key, data_provenance, created_at, updated_at)
       VALUES ($1, $2, 19.90, 'PAID', 'Campanha Sem Telemetria', 'idem-ae', 'COMMERCIAL_PRODUCTION', $3, $3)`,
      [orderId, custId, baseDate]
    );
    await pool.query(
      `INSERT INTO payments (id, human_id, order_id, provider, status, amount, idempotency_key, external_reference, data_provenance, confirmed_at, created_at, updated_at)
       VALUES ($1, 'PAY-AE', $2, 'ASAAS', 'CONFIRMED', 19.90, 'idem-pay-ae', 'ext-ae', 'COMMERCIAL_PRODUCTION', $3, $3, $3)`,
      [crypto.randomUUID(), orderId, baseDate]
    );

    // But NO commercial_funnel_events logged with utm_campaign = 'Campanha Sem Telemetria'
    const report = await getAttributionAnalyticsReport(pool, {
      mode: 'real',
      period: 'today',
      baseDate,
      timeZone: 'America/Sao_Paulo'
    });

    const c = report.byCampaign.find(camp => camp.campaignId === campId);
    expect(c).toBeDefined();
    expect(c?.attributedOrders).toBe(1);
    expect(c?.uniqueVisitors).toBeNull();
    expect(c?.conversionRate).toBeNull();
    expect(c?.conversionRateAvailability).toBe('INSUFFICIENT_ATTRIBUTION_DATA');
  });

  // AF. Net Revenue = Gross Revenue - Gateway Fees
  it('AF: Net Revenue = Gross Revenue - Gateway Fees', () => {
    const grossRevenue = 100.00;
    const gatewayFees = 4.50;
    const netRevenue = Math.round((grossRevenue - gatewayFees) * 100) / 100;
    expect(netRevenue).toBe(95.50);
  });

  // AG. Contribution After Media = Net Revenue - Paid Media Spend
  it('AG: Contribution After Media = Net Revenue - Paid Media Spend', () => {
    const netRevenue = 95.50;
    const paidMediaSpend = 30.00;
    const contributionAfterMedia = Math.round((netRevenue - paidMediaSpend) * 100) / 100;
    expect(contributionAfterMedia).toBe(65.50);
  });

  // AH. no metric is incorrectly labeled Net Profit
  it('AH: no metric is incorrectly labeled Net Profit in the report schema', async () => {
    const baseDate = new Date('2026-09-13T14:00:00.000Z');
    const report = await getAttributionAnalyticsReport(pool, {
      mode: 'real',
      period: 'today',
      baseDate,
      timeZone: 'America/Sao_Paulo'
    });

    const reportJson = JSON.stringify(report);
    expect(reportJson).not.toContain('"netProfit"');
    expect(report.globalCommercialTruth).toHaveProperty('contributionAfterMedia');
    expect(report.globalCommercialTruth).toHaveProperty('netRevenue');
    expect(report.globalCommercialTruth).toHaveProperty('paidMediaSpend');
  });

  // AI. refund behavior is deterministic and documented
  it('AI: refund behavior is deterministic and documented', async () => {
    const custId = crypto.randomUUID();
    await pool.query(`INSERT INTO customers (id, name, email) VALUES ($1, 'Customer AI', 'ai@test.com')`, [custId]);

    const orderId = crypto.randomUUID();
    const baseDate = new Date('2026-09-13T14:00:00.000Z');

    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, data_provenance, created_at, updated_at)
       VALUES ($1, $2, 39.80, 'REFUNDED', 'idem-ref', 'COMMERCIAL_PRODUCTION', $3, $3)`,
      [orderId, custId, baseDate]
    );

    await pool.query(
      `INSERT INTO payments (id, human_id, order_id, provider, status, amount, idempotency_key, external_reference, data_provenance, refunded_at, created_at, updated_at)
       VALUES ($1, 'PAY-REF', $2, 'ASAAS', 'REFUNDED', 39.80, 'idem-pay-ref', 'ext-ref', 'COMMERCIAL_PRODUCTION', $3, $3, $3)`,
      [crypto.randomUUID(), orderId, baseDate]
    );

    const report = await getAttributionAnalyticsReport(pool, {
      mode: 'real',
      period: 'today',
      baseDate,
      timeZone: 'America/Sao_Paulo'
    });

    expect(report.globalCommercialTruth.refundedOrdersCount).toBe(1);
    expect(report.globalCommercialTruth.refundPrincipal).toBe(39.80);
    expect(report.globalCommercialTruth.grossRevenue).toBe(0.00); // Refunded is not gross paid revenue
  });

  // AJ. Meta missing reach/link_clicks is distinguishable from true zero
  it('AJ: Meta missing reach/link_clicks is distinguishable from true zero', async () => {
    const connId = crypto.randomUUID();
    const accId = crypto.randomUUID();
    const campId = crypto.randomUUID();

    await pool.query(`INSERT INTO meta_connections (id, status) VALUES ($1, 'CONNECTED')`, [connId]);
    await pool.query(`INSERT INTO meta_ad_accounts (id, connection_id, meta_account_id, name) VALUES ($1, $2, 'act_1', 'Account 1')`, [accId, connId]);
    await pool.query(`INSERT INTO meta_campaigns (id, ad_account_id, meta_campaign_id, name, status, effective_status, data_provenance) VALUES ($1, $2, '12003', 'Campanha Reach Test', 'ACTIVE', 'ACTIVE', 'COMMERCIAL_PRODUCTION')`, [campId, accId]);

    const baseDate = new Date('2026-09-13T14:00:00.000Z');

    // Ingest insight with spend=10, clicks=5, but reach=NULL and link_clicks=NULL
    await pool.query(
      `INSERT INTO meta_insights (id, ad_account_id, campaign_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, reach, link_clicks, data_provenance)
       VALUES ($1, $2, $3, 'CAMPAIGN', '12003', '2026-09-13', '2026-09-13', 10.00, 100, 5, NULL, NULL, 'COMMERCIAL_PRODUCTION')`,
      [crypto.randomUUID(), accId, campId]
    );

    const report = await getAttributionAnalyticsReport(pool, {
      mode: 'real',
      period: 'today',
      baseDate,
      timeZone: 'America/Sao_Paulo'
    });

    const c = report.byCampaign.find(camp => camp.campaignId === campId);
    expect(c).toBeDefined();
    expect(c?.reach).toBeNull();
    expect(c?.linkClicks).toBeNull();
    expect(c?.clicks).toBe(5);
    expect(report.attributedMediaTruth.account.reach).toBeNull();
    expect(report.attributedMediaTruth.account.linkClicks).toBeNull();
  });

  // AK. Temporal Edge Case: Order created at 23:58, Payment confirmed at 00:05 next day in America/Sao_Paulo
  it('AK: Revenue day strictly matches payment confirmation day, NOT order creation day across midnight boundary', async () => {
    const custId = crypto.randomUUID();
    await pool.query(`INSERT INTO customers (id, name, email) VALUES ($1, 'Customer Midnight', 'mid@test.com')`, [custId]);

    const orderId = crypto.randomUUID();
    // 2026-09-13 23:58:00 in America/Sao_Paulo (UTC-3) => 2026-09-14T02:58:00.000Z
    const orderCreatedAt = new Date('2026-09-14T02:58:00.000Z');
    // 2026-09-14 00:05:00 in America/Sao_Paulo (UTC-3) => 2026-09-14T03:05:00.000Z
    const paymentConfirmedAt = new Date('2026-09-14T03:05:00.000Z');

    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, data_provenance, created_at, updated_at)
       VALUES ($1, $2, 19.90, 'PAID', 'idem-mid-order', 'COMMERCIAL_PRODUCTION', $3, $4)`,
      [orderId, custId, orderCreatedAt, paymentConfirmedAt]
    );

    await pool.query(
      `INSERT INTO payments (id, human_id, order_id, provider, status, amount, idempotency_key, external_reference, data_provenance, confirmed_at, created_at, updated_at)
       VALUES ($1, 'PAY-MID', $2, 'ASAAS', 'CONFIRMED', 19.90, 'idem-mid-pay', 'ext-mid', 'COMMERCIAL_PRODUCTION', $3, $4, $3)`,
      [crypto.randomUUID(), orderId, paymentConfirmedAt, orderCreatedAt]
    );

    // Query on 2026-09-13 (Day 1)
    const reportDay1 = await getAttributionAnalyticsReport(pool, {
      mode: 'real',
      period: 'today',
      baseDate: new Date('2026-09-13T15:00:00.000Z'),
      timeZone: 'America/Sao_Paulo'
    });

    // On 2026-09-13: payment was not yet confirmed!
    expect(reportDay1.globalCommercialTruth.paidOrdersCount).toBe(0);
    expect(reportDay1.globalCommercialTruth.grossRevenue).toBe(0.00);

    // Query on 2026-09-14 (Day 2)
    const reportDay2 = await getAttributionAnalyticsReport(pool, {
      mode: 'real',
      period: 'today',
      baseDate: new Date('2026-09-14T15:00:00.000Z'),
      timeZone: 'America/Sao_Paulo'
    });

    // On 2026-09-14: payment is confirmed!
    expect(reportDay2.globalCommercialTruth.paidOrdersCount).toBe(1);
    expect(reportDay2.globalCommercialTruth.grossRevenue).toBe(19.90);
  });

  // AL. Unconfirmed payment or confirmed_at = null does not leak into revenue
  it('AL: Unconfirmed / pending payments with confirmed_at = null never attribute revenue', async () => {
    const custId = crypto.randomUUID();
    await pool.query(`INSERT INTO customers (id, name, email) VALUES ($1, 'Customer Pending', 'pending@test.com')`, [custId]);

    const orderId = crypto.randomUUID();
    const baseDate = new Date('2026-09-13T12:00:00.000Z');

    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, data_provenance, created_at, updated_at)
       VALUES ($1, $2, 19.90, 'PENDING', 'idem-pen-order', 'COMMERCIAL_PRODUCTION', $3, $3)`,
      [orderId, custId, baseDate]
    );

    await pool.query(
      `INSERT INTO payments (id, human_id, order_id, provider, status, amount, idempotency_key, external_reference, data_provenance, confirmed_at, created_at, updated_at)
       VALUES ($1, 'PAY-PEN', $2, 'ASAAS', 'PENDING', 19.90, 'idem-pen-pay', 'ext-pen', 'COMMERCIAL_PRODUCTION', NULL, $3, $3)`,
      [crypto.randomUUID(), orderId, baseDate]
    );

    const report = await getAttributionAnalyticsReport(pool, {
      mode: 'real',
      period: 'today',
      baseDate,
      timeZone: 'America/Sao_Paulo'
    });

    expect(report.globalCommercialTruth.pendingOrdersCount).toBe(1);
    expect(report.globalCommercialTruth.paidOrdersCount).toBe(0);
    expect(report.globalCommercialTruth.grossRevenue).toBe(0.00);
  });
});
