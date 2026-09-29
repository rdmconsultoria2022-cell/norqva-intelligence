import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { extractActionMetrics, summarizeTargeting } from '../services/meta/metaActionMetrics';
import { MetaClient } from '../services/meta/metaClient';
import { MetaSyncService } from '../services/meta/metaSyncService';
import { backfillWindows, MetaBackfillService } from '../services/meta/metaBackfillService';
import { deriveMetrics, scoreEntity, percentileRank, BaseTotals } from '../services/intelligence/campaignIntelligenceService';

// NORQVA-0017 (fase 1): base de campanhas Meta — parser, histórico, pontuação e endpoint.

const T = (p: Partial<BaseTotals>): BaseTotals => ({
  spend: 0, impressions: 0, reach: 0, link_clicks: 0, outbound_clicks: 0, landing_page_views: 0, initiate_checkouts: 0,
  meta_purchases: 0, meta_purchase_value: 0, video_3s_views: 0, thruplays: 0, video_p25: 0, video_p50: 0, video_p75: 0,
  video_p100: 0, sales: 0, revenue: 0, checkouts_norqva: 0, breakeven_weighted: 0, breakeven_spend: 0, ...p
});
const withBreakeven = (p: Partial<BaseTotals>, B: number) => {
  const t = T(p);
  return T({ ...p, breakeven_weighted: (t.spend || 1) * B, breakeven_spend: t.spend || 1 });
};

describe('NORQVA-0017 — action metrics parser', () => {
  it('takes one purchase source (no double count) and the matching value', () => {
    const m = extractActionMetrics({
      actions: [
        { action_type: 'omni_purchase', value: '3' },
        { action_type: 'purchase', value: '3' },
        { action_type: 'offsite_conversion.fb_pixel_purchase', value: '3' },
        { action_type: 'landing_page_view', value: '120' },
        { action_type: 'omni_landing_page_view', value: '118' },
        { action_type: 'initiate_checkout', value: '9' },
        { action_type: 'video_view', value: '2000' }
      ],
      action_values: [
        { action_type: 'omni_purchase', value: '89.70' },
        { action_type: 'purchase', value: '89.70' }
      ],
      outbound_clicks: [{ action_type: 'outbound_click', value: '140' }],
      video_thruplay_watched_actions: [{ action_type: 'video_view', value: '500' }],
      video_p100_watched_actions: [{ action_type: 'video_view', value: '250' }]
    });
    expect(m.purchases).toBe(3);
    expect(m.purchase_value).toBe(89.7);
    expect(m.landing_page_views).toBe(118); // omni first
    expect(m.initiate_checkouts).toBe(9);
    expect(m.outbound_clicks).toBe(140);
    expect(m.video_3s_views).toBe(2000);
    expect(m.thruplays).toBe(500);
    expect(m.video_p100).toBe(250);
  });

  it('is safe on empty / malformed rows', () => {
    expect(extractActionMetrics(null).purchases).toBe(0);
    expect(extractActionMetrics({ actions: 'x', action_values: [{}] }).purchase_value).toBe(0);
  });

  it('summarizes targeting and reads creative content from object_story_spec', () => {
    const t = summarizeTargeting({
      age_min: 25, age_max: 55, geo_locations: { countries: ['BR'] },
      flexible_spec: [{ interests: [{ id: '1', name: 'Finanças pessoais' }] }],
      targeting_automation: { advantage_audience: 1 }
    });
    expect(t).toMatchObject({ age_min: 25, age_max: 55, countries: ['BR'], interests: ['Finanças pessoais'], advantage_audience: true });
    const c = MetaClient.creativeContent({ object_story_spec: { video_data: { message: 'Texto', title: 'Título', video_id: '99', call_to_action: { type: 'LEARN_MORE' } } } });
    expect(c).toMatchObject({ body: 'Texto', title: 'Título', video_id: '99', cta: 'LEARN_MORE' });
  });
});

describe('NORQVA-0017 — history windows', () => {
  it('covers the whole range newest-first in windows of at most 30 days', () => {
    const w = backfillWindows(65, '2026-09-28');
    expect(w[0]).toEqual({ since: '2026-08-30', until: '2026-09-28' });
    expect(w[w.length - 1].since).toBe('2026-07-26');
    expect(w).toHaveLength(3);
    for (let i = 1; i < w.length; i++) {
      const prevSince = new Date(w[i - 1].since + 'T00:00:00Z');
      const until = new Date(w[i].until + 'T00:00:00Z');
      expect(prevSince.getTime() - until.getTime()).toBe(86400000); // contiguous, no overlap
    }
    expect(backfillWindows(5000, '2026-09-28').length).toBe(Math.ceil(730 / 30));
  });

  it('runs one backfill at a time and counts failures', async () => {
    MetaBackfillService.resetForTesting();
    const calls: string[] = [];
    const a = MetaBackfillService.start(40, null, async w => {
      calls.push(w.since);
      return calls.length === 2 ? { success: false, error: 'boom' } : { success: true };
    });
    expect(a.started).toBe(true);
    expect(MetaBackfillService.start(10, null, async () => ({ success: true })).started).toBe(false);
    await a.done;
    const s = MetaBackfillService.status();
    expect(s).toMatchObject({ running: false, windows: 2, done: 1, failed: 1, lastError: 'boom' });
  });
});

describe('NORQVA-0017 — scoring and classification (BB-B01 rules)', () => {
  const B = 26.12;
  const q = { ctrPct: 0.5, hookPct: 0.5 };
  it('winner: 3+ sales with CPA ≤ 66% of breakeven', () => {
    const t = withBreakeven({ spend: 60, sales: 4, revenue: 119.6, impressions: 7000, link_clicks: 110 }, B);
    const r = scoreEntity(t, deriveMetrics(t), q);
    expect(r.classification).toBe('VENCEDOR');
    expect(r.score).toBeGreaterThan(60);
  });
  it('loser: 2× breakeven spent without sales', () => {
    const t = withBreakeven({ spend: 53, impressions: 6000, link_clicks: 60 }, B);
    expect(scoreEntity(t, deriveMetrics(t), q).classification).toBe('PERDEDOR');
  });
  it('loser: CTR below 0.6% after R$ 15', () => {
    const t = withBreakeven({ spend: 16, impressions: 4000, link_clicks: 12 }, B);
    const r = scoreEntity(t, deriveMetrics(t), q);
    expect(r.classification).toBe('PERDEDOR');
    expect(r.reason).toContain('0,6%');
  });
  it('no data under half the breakeven; promising within breakeven', () => {
    const a = withBreakeven({ spend: 8, impressions: 900, link_clicks: 12 }, B);
    expect(scoreEntity(a, deriveMetrics(a), q).classification).toBe('SEM_DADOS');
    const p = withBreakeven({ spend: 25, sales: 1, revenue: 29.9, impressions: 3000, link_clicks: 40 }, B);
    expect(scoreEntity(p, deriveMetrics(p), q).classification).toBe('PROMISSOR');
  });
  it('low confidence pulls toward the unproven prior', () => {
    const tiny = withBreakeven({ spend: 1, sales: 1, revenue: 29.9 }, B);
    const big = withBreakeven({ spend: 60, sales: 5, revenue: 149.5, impressions: 8000, link_clicks: 120 }, B);
    expect(scoreEntity(tiny, deriveMetrics(tiny), q).score).toBeLessThan(scoreEntity(big, deriveMetrics(big), q).score);
  });
  it('derived metrics', () => {
    const m = deriveMetrics(T({ spend: 50, impressions: 10000, reach: 8000, link_clicks: 100, landing_page_views: 80, video_3s_views: 3000, thruplays: 900, sales: 2, revenue: 59.8 }));
    expect(m).toMatchObject({ ctr_link: 1, cpc_link: 0.5, cpm: 5, hook_rate: 30, hold_rate: 30, lpv_rate: 80, cvr: 2.5, cpa: 25, roas: 1.2, frequency: 1.25 });
    expect(percentileRank([1, 2, 3, 4], 3)).toBe(0.625);
  });
});

describe('NORQVA-0017 — endpoints', () => {
  let pool: Pool;
  let adminToken: string;
  let creativeToken: string;

  beforeAll(async () => {
    pool = app.get('db') || initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const r = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status)
         VALUES (gen_random_uuid(), gen_random_uuid(), $1, $1, $2, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $2, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [email, role]
      );
      return signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role });
    };
    adminToken = await mk('admin.norqva0017@norqva.test', 'ADMIN');
    creativeToken = await mk('creative.norqva0017@norqva.test', 'CREATIVE');
    await new MetaSyncService().syncAll(pool, null, true);
  });

  it('sync stores funnel/video metrics and creative fields', async () => {
    const r = await pool.query(
      `SELECT mi.purchases, mi.purchase_value, mi.landing_page_views, mi.thruplays, mi.video_3s_views
       FROM meta_insights mi WHERE mi.is_demo = TRUE AND mi.entity_level = 'AD' AND mi.entity_meta_id = 'ad_demo_001'
       ORDER BY mi.synced_at DESC LIMIT 1`
    );
    expect(parseFloat(r.rows[0].purchases)).toBe(24);
    expect(parseFloat(r.rows[0].purchase_value)).toBe(717.6);
    expect(parseFloat(r.rows[0].landing_page_views)).toBe(850);
    expect(parseFloat(r.rows[0].thruplays)).toBe(3880);
  });

  it('ranks ads, campaigns and niches; any business role can read', async () => {
    const ad = await request(app).get('/api/intelligence/campaign-base?mode=demo&level=ad').set('Authorization', `Bearer ${creativeToken}`);
    expect(ad.status).toBe(200);
    const row = ad.body.rows.find((x: any) => x.meta_id === 'ad_demo_001');
    expect(row).toBeTruthy();
    expect(row.totals.landing_page_views).toBe(850);
    expect(row.totals.meta_purchases).toBe(24);
    expect(row.metrics.hook_rate).toBeCloseTo(30, 0);
    expect(row.metrics.hold_rate).toBeCloseTo(26.67, 1);
    expect(['VENCEDOR', 'PROMISSOR', 'TESTANDO', 'PERDEDOR', 'SEM_DADOS']).toContain(row.classification);
    expect(row.score).toBeGreaterThanOrEqual(0);
    expect(row.score).toBeLessThanOrEqual(100);

    for (const level of ['campaign', 'adset', 'product', 'niche']) {
      const r = await request(app).get(`/api/intelligence/campaign-base?mode=demo&level=${level}`).set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(r.body.rows.length).toBeGreaterThan(0);
      expect(r.body.summary.spend).toBeGreaterThan(0);
    }
    const bad = await request(app).get('/api/intelligence/campaign-base?mode=demo&level=x').set('Authorization', `Bearer ${adminToken}`);
    expect(bad.status).toBe(400);
    const anon = await request(app).get('/api/intelligence/campaign-base?mode=demo');
    expect(anon.status).toBe(401);
  });

  it('history import is ADMIN-only, real mode only and validated', async () => {
    const forbidden = await request(app).post('/api/meta/backfill').set('Authorization', `Bearer ${creativeToken}`).send({ days: 30 });
    expect(forbidden.status).toBe(403);
    const demo = await request(app).post('/api/meta/backfill?mode=demo').set('Authorization', `Bearer ${adminToken}`).send({ days: 30 });
    expect(demo.status).toBe(400);
    const tooMuch = await request(app).post('/api/meta/backfill').set('Authorization', `Bearer ${adminToken}`).send({ days: 5000 });
    expect(tooMuch.status).toBe(400);
    const st = await request(app).get('/api/meta/backfill/status').set('Authorization', `Bearer ${adminToken}`);
    expect(st.status).toBe(200);
    expect(st.body).toHaveProperty('running');
  });
});
