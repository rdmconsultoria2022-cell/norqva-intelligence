import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { MetaSyncService } from '../services/meta/metaSyncService';
import { parseCriteria, exclusionReason, DEFAULT_CRITERIA, SHORTLIST_MAX } from '../services/aiTeam/shortlistService';
import { IntelRow } from '../services/intelligence/campaignIntelligenceService';

// NORQVA-0021 (P1): shortlist automática para o Time de IAs — critérios, endpoint e envio em lote.

const row = (over: Partial<IntelRow> & { spend?: number; impressions?: number; sales?: number; cpa?: number | null; be?: number | null }): IntelRow =>
  ({
    key: 'k', level: 'ad', name: 'n', meta_id: 'm', status: 'ACTIVE', campaign_name: null, adset_name: null,
    product_id: 'p1', product_name: 'P', niche: null, ads_count: 1, winners_count: 0,
    totals: { spend: over.spend ?? 50, impressions: over.impressions ?? 5000, sales: over.sales ?? 1, revenue: 20, landing_page_views: 100 } as any,
    metrics: { cpa: over.cpa === undefined ? 20 : over.cpa, breakeven_cpa: over.be === undefined ? 26 : over.be } as any,
    score: 50, confidence: 0.6, classification: 'PROMISSOR', reason: '', days_active: 5, first_date: '2026-10-01',
    ...over
  }) as IntelRow;

describe('NORQVA-0021 — criteria', () => {
  it('defaults to 30 candidates, campaign + ad, without losers', () => {
    const c = parseCriteria({});
    expect(c).toEqual(DEFAULT_CRITERIA);
    expect(c.limit).toBe(30);
    expect(c.classes).not.toContain('PERDEDOR');
  });

  it('clamps and validates user input', () => {
    const c = parseCriteria({ limit: '999', levels: 'ad,xx', classes: 'vencedor,FOO', min_spend: '-3', min_days: 'abc', max_cpa_ratio: 'none', require_product: 'true' });
    expect(c.limit).toBe(SHORTLIST_MAX);
    expect(c.levels).toEqual(['ad']);
    expect(c.classes).toEqual(['VENCEDOR']);
    expect(c.min_spend).toBe(0);
    expect(c.min_days).toBe(DEFAULT_CRITERIA.min_days);
    expect(c.max_cpa_ratio).toBeNull();
    expect(c.require_product).toBe(true);
    expect(parseCriteria({ levels: 'niche' }).levels).toEqual(DEFAULT_CRITERIA.levels);
  });

  it('explains the first rule a row fails', () => {
    const c = DEFAULT_CRITERIA;
    expect(exclusionReason(row({}), c)).toBeNull();
    expect(exclusionReason(row({ classification: 'PERDEDOR' }), c)).toBe('CLASS');
    expect(exclusionReason(row({ spend: 5 }), c)).toBe('MIN_SPEND');
    expect(exclusionReason(row({ impressions: 100 }), c)).toBe('MIN_IMPRESSIONS');
    expect(exclusionReason(row({ days_active: 1 }), c)).toBe('MIN_DAYS');
    expect(exclusionReason(row({ cpa: 60, be: 26 }), c)).toBe('CPA_RATIO');
    expect(exclusionReason(row({ cpa: 60, be: 26 }), { ...c, max_cpa_ratio: null })).toBeNull();
    expect(exclusionReason(row({ product_id: null }), { ...c, require_product: true })).toBe('NO_PRODUCT');
  });
});

describe('NORQVA-0021 — endpoints', () => {
  let pool: Pool;
  let adminToken: string;
  let creativeToken: string;
  const loose = 'classes=VENCEDOR,PROMISSOR,TESTANDO,PERDEDOR,SEM_DADOS&min_spend=0&min_impressions=0&min_days=0&max_cpa_ratio=none';

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
    adminToken = await mk('admin.norqva0021@norqva.test', 'ADMIN');
    creativeToken = await mk('creative.norqva0021@norqva.test', 'CREATIVE');
    await new MetaSyncService().syncAll(pool, null, true);
  });

  it('campaign base rows carry days active and first date', async () => {
    const r = await request(app).get('/api/intelligence/campaign-base?mode=demo&level=ad').set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    const withSpend = r.body.rows.find((x: any) => x.totals.spend > 0);
    expect(withSpend.days_active).toBeGreaterThanOrEqual(1);
    expect(withSpend.first_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('builds a ranked shortlist with criteria, reasons and exclusions; any business role can read', async () => {
    const r = await request(app).get(`/api/intelligence/shortlist?mode=demo&${loose}`).set('Authorization', `Bearer ${creativeToken}`);
    expect(r.status).toBe(200);
    expect(r.body.criteria.limit).toBe(30);
    expect(r.body.candidates.length).toBeGreaterThan(0);
    expect(r.body.candidates.length).toBeLessThanOrEqual(30);
    expect(r.body.pool.campaign + r.body.pool.ad).toBeGreaterThan(0);
    const levels = new Set(r.body.candidates.map((c: any) => c.level));
    expect(levels.has('campaign') || levels.has('ad')).toBe(true);
    const scores = r.body.candidates.map((c: any) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(r.body.candidates[0].rank).toBe(1);
    expect(Array.isArray(r.body.candidates[0].why)).toBe(true);
    expect(r.body.candidates[0].why.join(' ')).toContain('dia(s) no ar');

    const strict = await request(app).get('/api/intelligence/shortlist?mode=demo&min_spend=100000').set('Authorization', `Bearer ${adminToken}`);
    expect(strict.status).toBe(200);
    expect(strict.body.candidates).toHaveLength(0);
    expect(strict.body.excluded.total).toBeGreaterThan(0);
    expect(strict.body.note).toContain('afrouxe');

    const one = await request(app).get(`/api/intelligence/shortlist?mode=demo&${loose}&limit=1`).set('Authorization', `Bearer ${adminToken}`);
    expect(one.body.candidates).toHaveLength(1);
    if (r.body.candidates.length > 1) expect(one.body.excluded.by_reason.LIMIT).toBeGreaterThan(0);

    const anon = await request(app).get('/api/intelligence/shortlist?mode=demo');
    expect(anon.status).toBe(401);
  });

  it('sends selected candidates to the Time de IAs once (no duplicates, no Meta call)', async () => {
    const list = await request(app).get(`/api/intelligence/shortlist?mode=demo&${loose}`).set('Authorization', `Bearer ${adminToken}`);
    const fresh = list.body.candidates.filter((c: any) => !c.opportunity).slice(0, 2);
    expect(fresh.length).toBeGreaterThan(0);
    const items = fresh.map((c: any) => ({ level: c.level, key: c.key }));

    const forbidden = await request(app).post('/api/ai-team/shortlist/send?mode=demo').set('Authorization', `Bearer ${creativeToken}`).send({ items });
    expect(forbidden.status).toBe(403);

    const empty = await request(app).post('/api/ai-team/shortlist/send?mode=demo').set('Authorization', `Bearer ${adminToken}`).send({ items: [] });
    expect(empty.status).toBe(400);

    const sent = await request(app)
      .post('/api/ai-team/shortlist/send?mode=demo')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [...items, items[0], { level: 'niche', key: 'x' }], criteria: { limit: 30 } });
    expect(sent.status).toBe(201);
    expect(sent.body.created).toHaveLength(items.length);
    expect(sent.body.created[0].human_id).toMatch(/^OPP-\d{4}-DEMO$/);
    expect(sent.body.skipped.some((s: any) => s.reason === 'Item inválido.')).toBe(true);

    const opp = await pool.query(`SELECT source, source_level, status, evidence FROM campaign_opportunities WHERE human_id = $1`, [sent.body.created[0].human_id]);
    expect(opp.rows[0]).toMatchObject({ source: 'ACCOUNT', status: 'CAPTADA' });
    const audit = await pool.query(`SELECT event_type FROM audit_logs WHERE event_type = 'SHORTLIST_SENT_TO_AI_TEAM'`);
    expect(audit.rows.length).toBeGreaterThan(0);

    const again = await request(app).post('/api/ai-team/shortlist/send?mode=demo').set('Authorization', `Bearer ${adminToken}`).send({ items });
    expect(again.status).toBe(200);
    expect(again.body.created).toHaveLength(0);
    expect(again.body.skipped[0].reason).toContain('Já existe');

    const after = await request(app).get(`/api/intelligence/shortlist?mode=demo&${loose}`).set('Authorization', `Bearer ${adminToken}`);
    const marked = after.body.candidates.find((c: any) => c.key === items[0].key && c.level === items[0].level);
    expect(marked.opportunity.human_id).toBe(sent.body.created[0].human_id);
  });
});
