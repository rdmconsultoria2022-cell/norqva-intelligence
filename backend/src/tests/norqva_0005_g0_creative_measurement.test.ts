import { describe, it, expect, vi } from 'vitest';
import { CreativePerformanceService, resolveAdDeterministically } from '../services/intelligence/creativePerformanceService';

// NORQVA-0005 / G0: per-ad landing and checkout numbers come from the real telemetry table and
// events/orders are linked to ads only deterministically.
describe('NORQVA-0005 G0 — creative measurement truth', () => {
  const ads = [
    { db_ad_id: 'db_a', meta_ad_id: '111', ad_name: 'BB-B01-H01-M1-C1', db_adset_id: 's', meta_adset_id: 'ms', db_campaign_id: 'c', meta_campaign_id: 'mc' },
    { db_ad_id: 'db_b', meta_ad_id: '222', ad_name: 'BB-B01-H02-M1-C1', db_adset_id: 's', meta_adset_id: 'ms', db_campaign_id: 'c', meta_campaign_id: 'mc' }
  ];

  it('reads commercial_funnel_events (not the nonexistent telemetry_events) and counts each stage', async () => {
    const pool: any = { query: vi.fn() };
    pool.query
      .mockResolvedValueOnce({ rows: ads })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { event_type: 'OFFER_VIEW', utm_content: 'bb-b01-h01-m1-c1', meta_ad_id: null, count: 40 },
          { event_type: 'CHECKOUT_MODAL_OPENED', utm_content: 'BB-B01-H01-M1-C1', meta_ad_id: null, count: 4 },
          { event_type: 'CHECKOUT_STARTED', utm_content: null, meta_ad_id: '111', count: 2 },
          { event_type: 'OFFER_VIEW', utm_content: 'BB-B01-H02', meta_ad_id: null, count: 99 } // partial name: must NOT match
        ]
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await new CreativePerformanceService().getCreativePerformance(pool, { is_demo: false });

    const telSql: string = pool.query.mock.calls[2][0];
    expect(telSql).toContain('commercial_funnel_events');
    expect(telSql).not.toContain('telemetry_events');
    expect(pool.query.mock.calls[2][1][0]).toBe(false); // is_demo isolation

    const a = res.creatives.find(c => c.ad_id === '111')!;
    expect(a.offer_views).toBe(40);
    expect(a.checkout_modal_opened).toBe(4);
    expect(a.checkout_started).toBe(2);
    const b = res.creatives.find(c => c.ad_id === '222')!;
    expect(b.offer_views).toBe(0);
  });

  it('orders: substring or legacy variant aliases no longer attribute; exact name and ad_id do', async () => {
    const pool: any = { query: vi.fn() };
    pool.query
      .mockResolvedValueOnce({ rows: ads })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'o1', total_amount: '29.90', status: 'PAID', utm_content: 'BB-B01-H01-M1-C1', attribution_metadata: null, created_at: '2026-09-24T10:00:00.000Z' },
          { id: 'o2', total_amount: '29.90', status: 'PAID', utm_content: null, attribution_metadata: { ad_id: '222' }, created_at: '2026-09-24T10:00:00.000Z' },
          { id: 'o3', total_amount: '29.90', status: 'PAID', utm_content: 'BB-B01', attribution_metadata: null, created_at: '2026-09-24T10:00:00.000Z' },
          { id: 'o4', total_amount: '29.90', status: 'PAID', utm_content: 'variant_a', attribution_metadata: null, created_at: '2026-09-24T10:00:00.000Z' }
        ]
      });

    const res = await new CreativePerformanceService().getCreativePerformance(pool, { is_demo: false });
    expect(res.creatives.find(c => c.ad_id === '111')!.paid_orders).toBe(1);
    expect(res.creatives.find(c => c.ad_id === '222')!.paid_orders).toBe(1);
    expect(res.unattributed.unattributed_paid_orders).toBe(2);
  });

  it('resolveAdDeterministically priority: ad_id, exact name, meta_ad_id; otherwise null', () => {
    const byId = new Map(ads.map(a => [a.meta_ad_id, a]));
    const byName = new Map(ads.map(a => [a.ad_name.toLowerCase(), a]));
    expect(resolveAdDeterministically('222', 'BB-B01-H01-M1-C1', byId, byName)).toBe('222');
    expect(resolveAdDeterministically(null, ' bb-b01-h01-m1-c1 ', byId, byName)).toBe('111');
    expect(resolveAdDeterministically(null, '111', byId, byName)).toBe('111');
    expect(resolveAdDeterministically('999', 'H01', byId, byName)).toBeNull();
    expect(resolveAdDeterministically(undefined, undefined, byId, byName)).toBeNull();
  });
});
