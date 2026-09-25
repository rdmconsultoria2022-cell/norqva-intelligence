import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import {
  CreativePerformanceService,
  safeDiv,
  computeConfidence,
  normalizeDateRangeBoundaries
} from '../services/intelligence/creativePerformanceService';

describe('GATE: CREATIVE_PERFORMANCE_ENGINE_HARDENING_V1 — Test Suite', () => {
  let service: CreativePerformanceService;
  let mockPool: any;

  beforeEach(() => {
    service = new CreativePerformanceService();
    mockPool = {
      query: vi.fn()
    };
  });

  it('1. Zero-Division Guard: returns fallback when denominator is 0, NaN, or non-finite', () => {
    expect(safeDiv(100, 0)).toBe(0);
    expect(safeDiv(100, 0, 0)).toBe(0);
    expect(safeDiv(100, NaN)).toBe(0);
    expect(safeDiv(100, Infinity)).toBe(0);
    expect(safeDiv(0, 0)).toBe(0);
    expect(safeDiv(19.9, 1)).toBe(19.9);
    expect(safeDiv(10, 3)).toBe(3.3333);
  });

  it('2. Hardened CAC Semantics: cac is null when paid_orders is 0, regardless of spend', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            db_ad_id: 'ad_1',
            meta_ad_id: '120249419142820097',
            ad_name: 'Ad Zero Spend Zero Orders',
            meta_creative_id: 'crt_1',
            db_adset_id: 's1',
            meta_adset_id: 'ms1',
            db_campaign_id: 'c1',
            meta_campaign_id: 'mc1'
          },
          {
            db_ad_id: 'ad_2',
            meta_ad_id: '120249419142840097',
            ad_name: 'Ad With Spend Zero Orders',
            meta_creative_id: 'crt_2',
            db_adset_id: 's1',
            meta_adset_id: 'ms1',
            db_campaign_id: 'c1',
            meta_campaign_id: 'mc1'
          },
          {
            db_ad_id: 'ad_3',
            meta_ad_id: '120249419142850097',
            ad_name: 'Ad With Spend And Orders',
            meta_creative_id: 'crt_3',
            db_adset_id: 's1',
            meta_adset_id: 'ms1',
            db_campaign_id: 'c1',
            meta_campaign_id: 'mc1'
          }
        ]
      })
      // Insights
      .mockResolvedValueOnce({
        rows: [
          { ad_id: 'ad_1', entity_meta_id: '120249419142820097', total_spend: '0.00', total_impressions: '0', total_clicks: '0' },
          { ad_id: 'ad_2', entity_meta_id: '120249419142840097', total_spend: '50.00', total_impressions: '500', total_clicks: '20' },
          { ad_id: 'ad_3', entity_meta_id: '120249419142850097', total_spend: '40.00', total_impressions: '400', total_clicks: '15' }
        ]
      })
      // Telemetry
      .mockResolvedValueOnce({ rows: [] })
      // Orders (Ad 3 has 2 paid orders)
      .mockResolvedValueOnce({
        rows: [
          { id: 'o1', total_amount: '19.90', status: 'PAID', attribution_metadata: JSON.stringify({ ad_id: '120249419142850097' }), created_at: '2026-09-24T12:00:00.000Z' },
          { id: 'o2', total_amount: '19.90', status: 'PAID', attribution_metadata: JSON.stringify({ ad_id: '120249419142850097' }), created_at: '2026-09-24T14:00:00.000Z' }
        ]
      });

    const report = await service.getCreativePerformance(mockPool, { is_demo: false });

    // Ad 1: spend = 0, paid_orders = 0 -> cac = null
    const ad1 = report.creatives.find(c => c.ad_id === '120249419142820097')!;
    expect(ad1.spend).toBe(0);
    expect(ad1.paid_orders).toBe(0);
    expect(ad1.cac).toBeNull();

    // Ad 2: spend = 50, paid_orders = 0 -> cac = null (NOT 0)
    const ad2 = report.creatives.find(c => c.ad_id === '120249419142840097')!;
    expect(ad2.spend).toBe(50);
    expect(ad2.paid_orders).toBe(0);
    expect(ad2.cac).toBeNull();

    // Ad 3: spend = 40, paid_orders = 2 -> cac = 20.00
    const ad3 = report.creatives.find(c => c.ad_id === '120249419142850097')!;
    expect(ad3.spend).toBe(40);
    expect(ad3.paid_orders).toBe(2);
    expect(ad3.cac).toBe(20);

    // Summary blended_cac: (0 + 50 + 40) / 2 = 45.00
    expect(report.summary.total_spend).toBe(90);
    expect(report.summary.total_paid_orders).toBe(2);
    expect(report.summary.blended_cac).toBe(45);
  });

  it('3. Summary blended_cac is null when total_paid_orders is 0', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ db_ad_id: 'ad_1', meta_ad_id: 'ad_meta_1', ad_name: 'Ad 1', db_adset_id: 's1', meta_adset_id: 'ms1', db_campaign_id: 'c1', meta_campaign_id: 'mc1' }] })
      .mockResolvedValueOnce({ rows: [{ ad_id: 'ad_1', entity_meta_id: 'ad_meta_1', total_spend: '30.00', total_impressions: '100', total_clicks: '5' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }); // 0 paid orders

    const report = await service.getCreativePerformance(mockPool, { is_demo: false });

    expect(report.summary.total_spend).toBe(30);
    expect(report.summary.total_paid_orders).toBe(0);
    expect(report.summary.blended_cac).toBeNull();
  });

  it('4. Date Range Normalization: maps date_from and date_to to exact America/Sao_Paulo [start, endExclusive) boundaries', () => {
    const { dateFromMeta, dateToMeta, startIso, endExclusiveIso } = normalizeDateRangeBoundaries('2026-09-24', '2026-09-24');

    expect(dateFromMeta).toBe('2026-09-24');
    expect(dateToMeta).toBe('2026-09-24');

    // 2026-09-24 00:00:00 America/Sao_Paulo (UTC-3) -> 2026-09-24T03:00:00.000Z
    expect(startIso).toBe('2026-09-24T03:00:00.000Z');

    // 2026-09-25 00:00:00 America/Sao_Paulo (UTC-3) -> 2026-09-25T03:00:00.000Z
    expect(endExclusiveIso).toBe('2026-09-25T03:00:00.000Z');

    // Boundary check: 23:59:59 BRT (02:59:59Z next day) is included
    const endOfDayBrtUtc = new Date('2026-09-25T02:59:59.000Z');
    expect(endOfDayBrtUtc.getTime() >= new Date(startIso!).getTime()).toBe(true);
    expect(endOfDayBrtUtc.getTime() < new Date(endExclusiveIso!).getTime()).toBe(true);

    // Boundary check: 00:00:00 BRT of next day (03:00:00Z) is excluded
    const nextDayStartBrtUtc = new Date('2026-09-25T03:00:00.000Z');
    expect(nextDayStartBrtUtc.getTime() < new Date(endExclusiveIso!).getTime()).toBe(false);
  });

  it('5. Date Range Normalization across multiple days', () => {
    const { dateFromMeta, dateToMeta, startIso, endExclusiveIso } = normalizeDateRangeBoundaries('2026-09-01', '2026-09-10');

    expect(dateFromMeta).toBe('2026-09-01');
    expect(dateToMeta).toBe('2026-09-10');
    expect(startIso).toBe('2026-09-01T03:00:00.000Z');
    expect(endExclusiveIso).toBe('2026-09-11T03:00:00.000Z');
  });

  it('6. SQL Query generation utilizes half-open interval [start, endExclusive) for TIMESTAMPTZ columns', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await service.getCreativePerformance(mockPool, {
      date_from: '2026-09-24',
      date_to: '2026-09-24'
    });

    // Insights query: checks YYYY-MM-DD
    const insightsSql = mockPool.query.mock.calls[1][0];
    expect(insightsSql).toContain('mi.date_start >=');
    expect(insightsSql).toContain('mi.date_stop <=');

    // Telemetry query: checks TIMESTAMPTZ with >= start and < endExclusive
    const telSql = mockPool.query.mock.calls[2][0];
    expect(telSql).toContain('created_at >=');
    expect(telSql).toContain('created_at <');

    // Orders query: checks TIMESTAMPTZ with >= start and < endExclusive on created_at
    const ordSql = mockPool.query.mock.calls[3][0];
    expect(ordSql).toContain('created_at >=');
    expect(ordSql).toContain('created_at <');
    expect(ordSql).not.toContain('gross_amount_cents');
    expect(ordSql).not.toContain('paid_at');
  });

  it('7. Confidence Engine: domain coverage for all click and conversion thresholds', () => {
    expect(computeConfidence(0, 0).confidence).toBe('OBSERVING');
    expect(computeConfidence(29, 0).confidence).toBe('OBSERVING');
    expect(computeConfidence(30, 0).confidence).toBe('OBSERVING');
    expect(computeConfidence(30, 1).confidence).toBe('LEARNING');
    expect(computeConfidence(30, 4).confidence).toBe('LEARNING');
    expect(computeConfidence(30, 5).confidence).toBe('LEARNING');
    expect(computeConfidence(99, 6).confidence).toBe('LEARNING');
    expect(computeConfidence(100, 4).confidence).toBe('LEARNING');
    expect(computeConfidence(100, 5).confidence).toBe('CONFIDENT');
  });

  it('8. Summary Invariants: spend, paid_orders, and revenue math hold exactly', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [
          { db_ad_id: 'ad_1', meta_ad_id: 'ad_m1', ad_name: 'Ad 1', db_adset_id: 's1', meta_adset_id: 'ms1', db_campaign_id: 'c1', meta_campaign_id: 'mc1' },
          { db_ad_id: 'ad_2', meta_ad_id: 'ad_m2', ad_name: 'Ad 2', db_adset_id: 's1', meta_adset_id: 'ms1', db_campaign_id: 'c1', meta_campaign_id: 'mc1' }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          { ad_id: 'ad_1', entity_meta_id: 'ad_m1', total_spend: '25.00', total_impressions: '100', total_clicks: '10' },
          { ad_id: 'ad_2', entity_meta_id: 'ad_m2', total_spend: '15.00', total_impressions: '80', total_clicks: '8' }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'o1', total_amount: '19.90', status: 'PAID', attribution_metadata: JSON.stringify({ ad_id: 'ad_m1' }), created_at: '2026-09-24T10:00:00.000Z' },
          { id: 'o2', total_amount: '19.90', status: 'PAID', attribution_metadata: null, created_at: '2026-09-24T11:00:00.000Z' } // Unattributed
        ]
      });

    const res = await service.getCreativePerformance(mockPool, { is_demo: false });

    // Sum creatives spend == summary total_spend
    const sumCreativesSpend = res.creatives.reduce((acc, c) => acc + c.spend, 0);
    expect(sumCreativesSpend).toBe(res.summary.total_spend);

    // Sum creatives paid orders + unattributed paid orders == summary total_paid_orders
    const sumCreativesPaidOrders = res.creatives.reduce((acc, c) => acc + c.paid_orders, 0);
    expect(sumCreativesPaidOrders + res.unattributed.unattributed_paid_orders).toBe(res.summary.total_paid_orders);

    // Sum creatives gross revenue + unattributed revenue == summary total_revenue
    const sumCreativesRevenue = res.creatives.reduce((acc, c) => acc + c.gross_revenue, 0);
    expect(sumCreativesRevenue + res.unattributed.unattributed_revenue).toBe(res.summary.total_revenue);
  });

  it('9. Production Schema Compatibility: queries orders without gross_amount_cents and correctly processes decimal BRL', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [
          { db_ad_id: 'ad_a', meta_ad_id: 'meta_ad_a', ad_name: 'TRATTORIA_V1_AD_A_HOOK_SEPARACAO', db_adset_id: 's1', meta_adset_id: 'ms1', db_campaign_id: 'c1', meta_campaign_id: 'mc1' },
          { db_ad_id: 'ad_b', meta_ad_id: 'meta_ad_b', ad_name: 'TRATTORIA_V1_AD_B_HOOK_EMULSAO', db_adset_id: 's1', meta_adset_id: 'ms1', db_campaign_id: 'c1', meta_campaign_id: 'mc1' },
          { db_ad_id: 'ad_c', meta_ad_id: 'meta_ad_c', ad_name: 'TRATTORIA_V1_AD_C_HOOK_MASSA', db_adset_id: 's1', meta_adset_id: 'ms1', db_campaign_id: 'c1', meta_campaign_id: 'mc1' }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          { ad_id: 'ad_a', entity_meta_id: 'meta_ad_a', total_spend: '4.68', total_impressions: '150', total_clicks: '5' },
          { ad_id: 'ad_b', entity_meta_id: 'meta_ad_b', total_spend: '4.75', total_impressions: '140', total_clicks: '4' },
          { ad_id: 'ad_c', entity_meta_id: 'meta_ad_c', total_spend: '4.75', total_impressions: '142', total_clicks: '3' }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          // 1 order attributed to Ad A (R$ 19.90)
          { id: 'ord_1', total_amount: '19.90', status: 'PAID', attribution_metadata: JSON.stringify({ ad_id: 'meta_ad_a' }), created_at: '2026-09-24T18:00:00.000Z' },
          // 1 unattributed order (R$ 19.90)
          { id: 'ord_2', total_amount: '19.90', status: 'PAID', attribution_metadata: null, created_at: '2026-09-24T19:00:00.000Z' }
        ]
      });

    const res = await service.getCreativePerformance(mockPool, { is_demo: false });

    // Assert query does not select gross_amount_cents, net_amount_cents, fee_cents, or paid_at
    const ordersQuerySql = mockPool.query.mock.calls[3][0];
    expect(ordersQuerySql).not.toContain('gross_amount_cents');
    expect(ordersQuerySql).not.toContain('net_amount_cents');
    expect(ordersQuerySql).not.toContain('fee_cents');
    expect(ordersQuerySql).not.toContain('paid_at');
    expect(ordersQuerySql).toContain('total_amount');
    expect(ordersQuerySql).toContain('created_at');

    // Revenue assertions
    const adA = res.creatives.find(c => c.ad_id === 'meta_ad_a')!;
    expect(adA.paid_orders).toBe(1);
    expect(adA.gross_revenue).toBe(19.90);
    expect(adA.spend).toBe(4.68);
    expect(adA.cac).toBe(4.68);
    expect(adA.roas).toBe(4.2521);

    const adB = res.creatives.find(c => c.ad_id === 'meta_ad_b')!;
    expect(adB.paid_orders).toBe(0);
    expect(adB.gross_revenue).toBe(0);
    expect(adB.cac).toBeNull();
    expect(adB.roas).toBe(0);

    const adC = res.creatives.find(c => c.ad_id === 'meta_ad_c')!;
    expect(adC.paid_orders).toBe(0);
    expect(adC.gross_revenue).toBe(0);
    expect(adC.cac).toBeNull();
    expect(adC.roas).toBe(0);

    // Unattributed revenue
    expect(res.unattributed.unattributed_paid_orders).toBe(1);
    expect(res.unattributed.unattributed_revenue).toBe(19.90);

    // Total summary
    expect(res.summary.total_spend).toBe(14.18);
    expect(res.summary.total_paid_orders).toBe(2);
    expect(res.summary.total_revenue).toBe(39.80);
    expect(res.summary.blended_cac).toBe(7.09);
    expect(res.summary.blended_roas).toBe(2.8068);
  });
});
