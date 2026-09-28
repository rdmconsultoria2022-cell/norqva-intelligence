import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { recommendCreativeAction, computeContentHash } from '../services/creative/creativeFactoryService';
import { CREATIVE_BATCHES } from '../data/creativeBatches';

// NORQVA-0005 / G1: Creative Factory — import, claims gate, review, versioning, scorecard.
// Uses demo mode so it never collides with real BB-B01 rows.
describe('NORQVA-0005 G1 — Creative Factory', () => {
  let pool: Pool;
  let adminToken: string;
  let creativeToken: string;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const authId = crypto.randomUUID();
      const r = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE'
         RETURNING auth_user_id, email`,
        [authId, email, email, role]
      );
      return signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role });
    };
    // Other suites may wipe products/offers in the shared test DB: make sure the batch targets exist
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status)
       VALUES ('c0000000-0000-4000-8000-000000000001', 'PRD-BOLSO-BLINDADO', 'Método Bolso Blindado', 'Finanças', 'Fixture', 'PLANEJADO')
       ON CONFLICT (id) DO NOTHING`
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, product_id, name, price, description, status)
       VALUES ('d0000000-0000-4000-8000-000000000001', 'OFF-BOLSO-BLINDADO-2990', 'c0000000-0000-4000-8000-000000000001', 'Bolso', 29.90, 'Fixture', 'RASCUNHO')
       ON CONFLICT (id) DO NOTHING`
    );
    adminToken = await mk('admin.norqva0005@norqva.test', 'ADMIN');
    creativeToken = await mk('creative.norqva0005@norqva.test', 'CREATIVE');
  });

  const as = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: any = {}) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
    patch: (url: string, body: any = {}) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body)
  });

  const list = async () => {
    const r = await as(adminToken).get('/api/creative-factory/creatives?mode=demo&batch=BB-B01&period=all');
    expect(r.status).toBe(200);
    return r.body;
  };

  it('batch data: 20 creatives with unique keys, each carrying claims; vitalício claim starts REJECTED', () => {
    const b = CREATIVE_BATCHES['BB-B01'];
    expect(b.creatives).toHaveLength(20);
    expect(new Set(b.creatives.map(c => c.key)).size).toBe(20);
    expect(b.creatives.every(c => c.claimCodes.length > 0)).toBe(true);
    expect(b.claims.find(c => c.code === 'BB-CL-08')!.initialStatus).toBe('REJECTED');
    expect(b.creatives.some(c => c.claimCodes.includes('BB-CL-08'))).toBe(false);
  });

  it('only ADMIN imports; import is idempotent', async () => {
    const denied = await as(creativeToken).post('/api/creative-factory/batches/BB-B01/import?mode=demo');
    expect(denied.status).toBe(403);

    const first = await as(adminToken).post('/api/creative-factory/batches/BB-B01/import?mode=demo');
    expect(first.status).toBe(200);
    const second = await as(adminToken).post('/api/creative-factory/batches/BB-B01/import?mode=demo');
    expect(second.status).toBe(200);
    expect(second.body.creativesCreated).toBe(0);
    expect(second.body.claimsCreated).toBe(0);

    const body = await list();
    expect(body.creatives).toHaveLength(20);
    expect(body.creatives.every((c: any) => c.approval_status === 'DRAFT')).toBe(true);
    expect(body.creatives[0].utm_content_key.endsWith('-DEMO')).toBe(true);

    const unknown = await as(adminToken).post('/api/creative-factory/batches/XX-B99/import?mode=demo');
    expect(unknown.status).toBe(404);
  });

  it('approval is blocked until every claim of the creative is VERIFIED', async () => {
    const body = await list();
    const target = body.creatives.find((c: any) => c.human_id === 'BB-B01-H02-M1-C1-DEMO');
    expect(target.claims_all_verified).toBe(false);

    const blocked = await as(adminToken).post(`/api/creative-factory/creatives/${target.id}/review?mode=demo`, { decision: 'APPROVED' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toContain('claims não verificadas');

    // CREATIVE role cannot verify claims
    const deniedVerify = await as(creativeToken).patch(`/api/creative-factory/claims/${target.claims[0].id}?mode=demo`, { status: 'VERIFIED' });
    expect(deniedVerify.status).toBe(403);

    for (const cl of target.claims) {
      const v = await as(adminToken).patch(`/api/creative-factory/claims/${cl.id}?mode=demo`, { status: 'VERIFIED' });
      expect(v.status).toBe(200);
    }

    const ok = await as(adminToken).post(`/api/creative-factory/creatives/${target.id}/review?mode=demo`, { decision: 'APPROVED' });
    expect(ok.status).toBe(200);
    expect(ok.body.approval_status).toBe('APPROVED');

    const review = await pool.query('SELECT content_hash, decision FROM creative_reviews WHERE creative_id = $1', [target.id]);
    expect(review.rows[0].decision).toBe('APPROVED');
    expect(review.rows[0].content_hash).toBe(target.content_hash);
  });

  it('rejecting requires a reason; rejecting a claim requires a note', async () => {
    const body = await list();
    const target = body.creatives.find((c: any) => c.human_id === 'BB-B01-H05-M2-C2-DEMO');
    const noReason = await as(adminToken).post(`/api/creative-factory/creatives/${target.id}/review?mode=demo`, { decision: 'REJECTED' });
    expect(noReason.status).toBe(400);
    const ok = await as(adminToken).post(`/api/creative-factory/creatives/${target.id}/review?mode=demo`, { decision: 'REJECTED', reason_code: 'WEAK_HOOK' });
    expect(ok.status).toBe(200);

    const claimNoNote = await as(adminToken).patch(`/api/creative-factory/claims/${target.claims[0].id}?mode=demo`, { status: 'REJECTED' });
    expect(claimNoNote.status).toBe(400);
  });

  it('editing a reviewed creative creates a new version; the old one is superseded', async () => {
    const body = await list();
    const approved = body.creatives.find((c: any) => c.human_id === 'BB-B01-H02-M1-C1-DEMO');
    const r = await as(creativeToken).post(`/api/creative-factory/creatives/${approved.id}/revise?mode=demo`, {
      headline: 'Veja o disponível do mês em segundos'
    });
    expect(r.status).toBe(200);
    expect(r.body.mode).toBe('NEW_VERSION');
    expect(r.body.creative.human_id).toBe('BB-B01-H02-M1-C1-V2-DEMO');
    expect(r.body.creative.version).toBe(2);

    const after = await list();
    const old = after.creatives.find((c: any) => c.id === approved.id);
    expect(old.approval_status).toBe('SUPERSEDED');
    const v2 = after.creatives.find((c: any) => c.human_id === 'BB-B01-H02-M1-C1-V2-DEMO');
    expect(v2.parent_creative_id).toBe(approved.id);
    expect(v2.approval_status).toBe('DRAFT');
    expect(v2.claims.length).toBe(approved.claims.length);

    const reviewOld = await as(adminToken).post(`/api/creative-factory/creatives/${approved.id}/review?mode=demo`, { decision: 'APPROVED' });
    expect(reviewOld.status).toBe(409);

    // A never-reviewed draft is edited in place
    const draft = after.creatives.find((c: any) => c.human_id === 'BB-B01-H01-M1-C1-DEMO');
    const inPlace = await as(creativeToken).post(`/api/creative-factory/creatives/${draft.id}/revise?mode=demo`, { headline: 'Novo título' });
    expect(inPlace.body.mode).toBe('EDITED_IN_PLACE');
  });

  it('scorecard: a Meta ad whose name equals the creative key feeds its metrics (exact match only)', async () => {
    const campaignId = crypto.randomUUID();
    const adsetId = crypto.randomUUID();
    const adDbId = crypto.randomUUID();
    const decoyId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO meta_ad_accounts (id, meta_account_id, name, is_demo) VALUES ($1, $2, 'acc 0005', TRUE)`,
      [accountId, `act_0005_${Date.now()}`]
    );
    await pool.query(
      `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, objective, status, effective_status, is_demo)
       VALUES ($1, $2, $3, 'BB-B01 test', 'OUTCOME_SALES', 'ACTIVE', 'ACTIVE', TRUE)`,
      [campaignId, `cmp_0005_${Date.now()}`, accountId]
    );
    await pool.query(
      `INSERT INTO meta_ad_sets (id, meta_adset_id, campaign_id, name, status, effective_status, is_demo)
       VALUES ($1, $2, $3, 'BB-B01 set', 'ACTIVE', 'ACTIVE', TRUE)`,
      [adsetId, `set_0005_${Date.now()}`, campaignId]
    );
    const metaAdId = `ad_0005_${Date.now()}`;
    await pool.query(
      `INSERT INTO meta_ads (id, meta_ad_id, adset_id, name, status, effective_status, is_demo)
       VALUES ($1, $2, $3, 'BB-B01-H03-M1-C1-DEMO', 'ACTIVE', 'ACTIVE', TRUE),
              ($4, $5, $3, 'BB-B01-H03-M1-C1-DEMO-OLD', 'ACTIVE', 'ACTIVE', TRUE)`,
      [adDbId, metaAdId, adsetId, decoyId, `${metaAdId}_decoy`]
    );
    await pool.query(
      `INSERT INTO meta_insights (ad_account_id, ad_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, link_clicks, is_demo)
       VALUES ($1, $2, 'AD', $3, '2026-09-20', '2026-09-20', 60, 2000, 30, 20, TRUE),
              ($1, $4, 'AD', $5, '2026-09-20', '2026-09-20', 999, 9999, 99, 99, TRUE)`,
      [accountId, adDbId, metaAdId, decoyId, `${metaAdId}_decoy`]
    );

    const body = await list();
    const c = body.creatives.find((x: any) => x.human_id === 'BB-B01-H03-M1-C1-DEMO');
    expect(c.linked_meta_ads).toEqual([metaAdId]);
    expect(c.metrics.spend).toBe(60);
    expect(c.metrics.impressions).toBe(2000);
    // Bolso economics are configured in real mode only in production; the test DB may have none
    expect(['PAUSE_RECOMMENDED', 'OBSERVING']).toContain(c.recommendation);

    const unlinked = body.creatives.find((x: any) => x.human_id === 'BB-B01-H04-M1-C1-DEMO');
    expect(unlinked.recommendation).toBe('NOT_PUBLISHED');
    expect(unlinked.metrics).toBeNull();
  });

  it('revoking a claim sends approved creatives that use it back to revision', async () => {
    const body = await list();
    const v2 = body.creatives.find((c: any) => c.human_id === 'BB-B01-H02-M1-C1-V2-DEMO');
    const ok = await as(adminToken).post(`/api/creative-factory/creatives/${v2.id}/review?mode=demo`, { decision: 'APPROVED' });
    expect(ok.status).toBe(200);

    const m1Claim = v2.claims.find((cl: any) => cl.human_id === 'BB-CL-02-DEMO');
    const revoke = await as(adminToken).patch(`/api/creative-factory/claims/${m1Claim.id}?mode=demo`, { status: 'REJECTED', note: 'teste de revogação' });
    expect(revoke.status).toBe(200);

    const after = await list();
    expect(after.creatives.find((c: any) => c.id === v2.id).approval_status).toBe('REVISION_REQUESTED');

    // restore for any later assertions
    await as(adminToken).patch(`/api/creative-factory/claims/${m1Claim.id}?mode=demo`, { status: 'VERIFIED' });
  });

  it('rejects unsafe file links, oversized CTAs and non-factory creatives', async () => {
    const body = await list();
    const draft = body.creatives.find((c: any) => c.human_id === 'BB-B01-H05-M1-C1-DEMO');
    const js = await as(creativeToken).post(`/api/creative-factory/creatives/${draft.id}/revise?mode=demo`, { file_url: 'javascript:alert(1)' });
    expect(js.status).toBe(400);
    const longCta = await as(creativeToken).post(`/api/creative-factory/creatives/${draft.id}/revise?mode=demo`, { cta: 'x'.repeat(101) });
    expect(longCta.status).toBe(400);
    const good = await as(creativeToken).post(`/api/creative-factory/creatives/${draft.id}/revise?mode=demo`, { file_url: 'https://drive.example.com/video.mp4' });
    expect(good.status).toBe(200);

    const legacy = await pool.query(
      `INSERT INTO creatives (human_id, product_id, hook, concept, copy, cta, format, file_url, status, is_demo)
       VALUES ($1, 'c0000000-0000-4000-8000-000000000001', 'h', 'c', 'x', 'cta', 'IMAGE', 'https://x.test/a.png', 'IDEIA', TRUE)
       RETURNING id`,
      [`LEGACY-0005-${Date.now()}`]
    );
    const r = await as(adminToken).post(`/api/creative-factory/creatives/${legacy.rows[0].id}/review?mode=demo`, { decision: 'REJECTED', reason_code: 'OTHER' });
    expect(r.status).toBe(404);
  });

  it('recommendation rules follow the unit economics (breakeven R$ 26,12 / target R$ 17,15)', () => {
    const m = (o: Partial<Record<string, number>>) => ({
      spend: 0, impressions: 0, link_clicks: 0, offer_views: 0, checkout_modal_opened: 0, checkout_started: 0, paid_orders: 0, gross_revenue: 0, ...o
    });
    const B = 26.12;
    const T = 17.15;
    expect(recommendCreativeAction(null, B, T).recommendation).toBe('NOT_PUBLISHED');
    expect(recommendCreativeAction(m({ spend: 10, impressions: 800 }), B, T).recommendation).toBe('INSUFFICIENT_DATA');
    expect(recommendCreativeAction(m({ spend: 20, impressions: 2000, link_clicks: 5 }), B, T).recommendation).toBe('PAUSE_RECOMMENDED');
    expect(recommendCreativeAction(m({ spend: 20, impressions: 2000, link_clicks: 30 }), B, T).recommendation).toBe('OBSERVING');
    expect(recommendCreativeAction(m({ spend: 53, impressions: 3000, link_clicks: 40 }), B, T).recommendation).toBe('PAUSE_RECOMMENDED');
    expect(recommendCreativeAction(m({ spend: 25, impressions: 2000, link_clicks: 30, paid_orders: 1 }), B, T).recommendation).toBe('PROMISING');
    expect(recommendCreativeAction(m({ spend: 45, impressions: 3000, link_clicks: 40, paid_orders: 1 }), B, T).recommendation).toBe('UNDERPERFORMING');
    expect(recommendCreativeAction(m({ spend: 51, impressions: 4000, link_clicks: 60, paid_orders: 3 }), B, T).recommendation).toBe('WINNER_CANDIDATE');
    expect(recommendCreativeAction(m({ spend: 30 }), null, null).recommendation).toBe('OBSERVING');
  });

  it('content hash changes when copy changes', () => {
    const a = computeContentHash({ hook: 'x', headline: 'a' });
    const b = computeContentHash({ hook: 'x', headline: 'b' });
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64);
  });
});
