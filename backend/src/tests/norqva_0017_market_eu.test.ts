import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { MarketEuService, normalizeEuAd, daysRunning, scoreNiche, ArchiveFetcher } from '../services/marketIntelligence/marketEuService';
import { setMarketEuServiceForTesting } from '../controllers/marketEuController';

// NORQVA-0017 (fase 2): mercado europeu pela Biblioteca de Anúncios.

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

describe('NORQVA-0017 — EU ad normalization and niche score', () => {
  it('normalizes an ads_archive row', () => {
    const a = normalizeEuAd(
      {
        id: '123', page_id: 'p1', page_name: 'Budget Co', ad_delivery_start_time: '2026-07-01T10:00:00+0000',
        ad_creative_bodies: ['Take control of your money'], ad_creative_link_titles: ['Budget planner'],
        ad_creative_link_captions: ['budgetco.eu'], publisher_platforms: ['facebook', 'instagram'], languages: ['en'],
        eu_total_reach: '48210', target_ages: ['25', '54'], ad_snapshot_url: 'https://www.facebook.com/ads/archive/render_ad/?id=123'
      },
      today
    )!;
    expect(a).toMatchObject({ ad_library_id: '123', start_date: '2026-07-01', stop_date: null, is_active: true, eu_total_reach: 48210, title: 'Budget planner', link_caption: 'budgetco.eu', target_ages: '25-54' });
    expect(normalizeEuAd({ id: '9', ad_delivery_stop_time: '2020-01-02' }, today)!.is_active).toBe(false);
    expect(normalizeEuAd({}, today)).toBeNull();
  });

  it('counts days running (inclusive) and scores niches on a log scale', () => {
    expect(daysRunning('2026-09-01', null, true, '2026-09-30')).toBe(30);
    expect(daysRunning('2026-09-01', '2026-09-10', false, '2026-09-30')).toBe(10);
    expect(scoreNiche({ ads_total: 3, active_ads: 3, advertisers: 2, long_runners: 1, total_reach: 1000, new_ads_7d: 0, reach_growth_7d: 0 }).classification).toBe('SEM_DADOS');
    const strong = scoreNiche({ ads_total: 250, active_ads: 180, advertisers: 40, long_runners: 60, total_reach: 12_000_000, new_ads_7d: 25, reach_growth_7d: 0 });
    expect(strong.classification).toBe('VALIDADO');
    expect(strong.score).toBe(100);
    const weak = scoreNiche({ ads_total: 8, active_ads: 3, advertisers: 2, long_runners: 0, total_reach: 900, new_ads_7d: 0, reach_growth_7d: 0 });
    expect(weak.classification).toBe('FRACO');
  });
});

describe('NORQVA-0017 — EU market endpoints', () => {
  let pool: Pool;
  let adminToken: string;
  let creativeToken: string;
  const hadToken = process.env.META_AD_LIBRARY_TOKEN;

  const pages: Record<string, any[]> = {
    'budget planner': [
      { id: 'eu1', page_id: 'pA', page_name: 'A', ad_delivery_start_time: daysAgo(60), eu_total_reach: '100000', ad_creative_bodies: ['A1'] },
      { id: 'eu2', page_id: 'pB', page_name: 'B', ad_delivery_start_time: daysAgo(40), eu_total_reach: '50000' },
      { id: 'eu3', page_id: 'pC', page_name: 'C', ad_delivery_start_time: daysAgo(3), eu_total_reach: '2000' },
      { id: 'eu4', page_id: 'pC', page_name: 'C', ad_delivery_start_time: daysAgo(90), ad_delivery_stop_time: daysAgo(50), eu_total_reach: '9000' },
      { id: 'eu5', page_id: 'pD', page_name: 'D', ad_delivery_start_time: daysAgo(35), eu_total_reach: '7000' }
    ]
  };
  const fetcher: ArchiveFetcher = vi.fn(async q =>
    q.search_terms === 'app' ? { data: [{ id: 'x' }], next: null } : { data: pages[q.search_terms] || [], next: null }
  );

  beforeAll(async () => {
    pool = app.get('db') || initializeDB();
    await runMigrations(pool);
    process.env.META_AD_LIBRARY_TOKEN = 'test-token';
    const mk = async (email: string, role: string) => {
      const r = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status)
         VALUES (gen_random_uuid(), gen_random_uuid(), $1, $1, $2, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $2, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [email, role]
      );
      return signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role });
    };
    adminToken = await mk('admin.norqva0017eu@norqva.test', 'ADMIN');
    creativeToken = await mk('creative.norqva0017eu@norqva.test', 'CREATIVE');
    setMarketEuServiceForTesting(new MarketEuService(fetcher));
  });

  afterAll(() => {
    setMarketEuServiceForTesting(null);
    if (hadToken === undefined) delete process.env.META_AD_LIBRARY_TOKEN;
    else process.env.META_AD_LIBRARY_TOKEN = hadToken;
  });

  it('probe reports access; seeded niches exist', async () => {
    const p = await request(app).get('/api/market/eu/probe').set('Authorization', `Bearer ${adminToken}`);
    expect(p.status).toBe(200);
    expect(p.body.status).toBe('AVAILABLE');
    const list = await request(app).get('/api/market/eu/niches').set('Authorization', `Bearer ${creativeToken}`);
    expect(list.status).toBe(200);
    expect(list.body.niches.map((n: any) => n.name)).toEqual(expect.arrayContaining(['Finanças pessoais', 'Culinária italiana']));
  });

  it('creates a niche, collects it and ranks long-running offers', async () => {
    const forbidden = await request(app).post('/api/market/eu/niches').set('Authorization', `Bearer ${creativeToken}`).send({ name: 'X', search_terms: ['y'] });
    expect(forbidden.status).toBe(403);
    const bad = await request(app).post('/api/market/eu/niches').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Teste', search_terms: [] });
    expect(bad.status).toBe(400);
    const created = await request(app)
      .post('/api/market/eu/niches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Planejamento financeiro (teste)', search_terms: ['budget planner', 'budget planner'], countries: ['de', 'fr', 'xx1'] });
    expect(created.status).toBe(201);
    expect(created.body.search_terms).toEqual(['budget planner']);
    expect(created.body.countries).toEqual(['DE', 'FR']);

    const c = await request(app).post(`/api/market/eu/collect?wait=1`).set('Authorization', `Bearer ${adminToken}`).send({ niche_ids: [created.body.id] });
    expect(c.status).toBe(202);

    const list = await request(app).get('/api/market/eu/niches').set('Authorization', `Bearer ${adminToken}`);
    const n = list.body.niches.find((x: any) => x.id === created.body.id);
    expect(n.stats).toMatchObject({ ads_total: 5, active_ads: 4, advertisers: 4, long_runners: 3, total_reach: 159000, new_ads_7d: 1 });
    expect(n.score).toBeGreaterThan(0);
    expect(list.body.last_run).toMatchObject({ status: 'DONE', ads_upserted: 5 });

    const ads = await request(app).get(`/api/market/eu/niches/${created.body.id}/ads`).set('Authorization', `Bearer ${creativeToken}`);
    expect(ads.body.ads[0].ad_library_id).toBe('eu1'); // active and running the longest
    expect(ads.body.ads[0].days_running).toBe(61);
    expect(ads.body.ads[ads.body.ads.length - 1].is_active).toBe(false);

    const off = await request(app).patch(`/api/market/eu/niches/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`).send({ is_active: false });
    expect(off.body.is_active).toBe(false);
  });

  it('an access error marks the run BLOCKED and the probe explains the steps', async () => {
    const blocked = new MarketEuService(async () => ({ data: [], next: null, error: { code: 10, message: 'Application does not have permission' } }));
    const p = await blocked.probe();
    expect(p.status).toBe('BLOCKED');
    expect((p as any).guidance.length).toBeGreaterThan(2);
    const r = await blocked.collect(pool);
    expect(r.status).toBe('BLOCKED');
    expect(r.error).toContain('permission');
  });
});
