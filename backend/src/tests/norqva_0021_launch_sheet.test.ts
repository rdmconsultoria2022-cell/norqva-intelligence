import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { buildLaunchFromSheet, LaunchSheetError, urlTagsFor } from '../services/aiTeam/launchSheet';
import { VALIDATION_CHECKS } from '../services/aiTeam/opportunityService';
import { BatchCreative } from '../data/creativeBatches';

// NORQVA-0021 (P3): ficha da campanha (IA Criativa) → plano de lançamento em RASCUNHO, sem tocar na Meta.

const cr = (key: string, format: BatchCreative['format'] = 'VIDEO'): BatchCreative => ({
  key, hookCode: 'H01', hookFamily: 'AI', hook: 'h', mechanismCode: 'M1', mechanism: 'm', ctaCode: 'C1', cta: 'Saiba mais',
  format, durationSeconds: 18, script: 's', primaryText: `Texto ${key}`, headline: `Título ${key}`, claimCodes: []
});
const ctx = { opportunityHumanId: 'OPP-0042', offerHumanId: 'OFF-TRATTORIA-2990', creatives: [cr('OPP-0042-B01-C01'), cr('OPP-0042-B01-C02'), cr('OPP-0042-B01-C03', 'IMAGE')] };

describe('NORQVA-0021 — ficha da campanha', () => {
  it('builds a valid DRAFT launch input: official pixel, PURCHASE, only video ads, ad name = creative key = utm_content', () => {
    const { input, sheet } = buildLaunchFromSheet(
      { campaign_name: 'NORQVA_TR_OPP42', daily_budget_brl: 30, max_spend_brl: 210, hypothesis: 'Gancho de massa caseira vence', adsets: [{ targeting_summary: 'Brasil amplo' }] },
      ctx
    );
    expect(input.code).toBe('OPP-0042-L01');
    expect(input.offer_human_id).toBe('OFF-TRATTORIA-2990');
    expect(input.spec.custom_event_type).toBe('PURCHASE');
    expect(input.spec.ads.map(a => a.name)).toEqual(['OPP-0042-B01-C01', 'OPP-0042-B01-C02']);
    expect(input.spec.ads.every(a => a.video_url === 'TO_BE_FILLED')).toBe(true);
    expect(input.spec.ads[0].url_tags).toBe(urlTagsFor('OPP-0042-L01', 'OPP-0042-B01-C01'));
    expect(input.spec.ads[0].url_tags).toContain('utm_content=OPP-0042-B01-C01');
    expect(input.spec.ads[0].destination_url).toBe('https://norqva-intelligence-frontend.vercel.app/p/OFF-TRATTORIA-2990');
    expect(input.spec.adsets[0].targeting).toMatchObject({ countries: ['BR'], age_min: 25, age_max: 65 });
    expect(input.daily_budget_brl).toBe(30);
    expect(input.max_spend_brl).toBe(210);
    expect(input.question_text).toContain('OPP-0042-L01');
    expect(sheet.excluded_creatives.map(x => x.key)).toEqual(['OPP-0042-B01-C03']);
    expect(sheet.pause_rules.length).toBeGreaterThan(0);
  });

  it('spreads ads across ad sets, or follows ad_adset', () => {
    const { input } = buildLaunchFromSheet(
      { daily_budget_brl: 20, max_spend_brl: 200, adsets: [{ name: 'A' }, { name: 'B', daily_budget_brl: 25 }], ad_adset: { 'OPP-0042-B01-C01': 'B' } },
      ctx
    );
    expect(input.spec.ads.map(a => a.adset_name)).toEqual(['B', 'B']);
    expect(input.daily_budget_brl).toBe(45);
  });

  it('refuses unsafe or incomplete sheets with readable messages', () => {
    const bad = (raw: any, c = ctx) => {
      try {
        buildLaunchFromSheet(raw, c);
        return null;
      } catch (e: any) {
        expect(e).toBeInstanceOf(LaunchSheetError);
        return e.message as string;
      }
    };
    expect(bad('x')).toContain('objeto');
    expect(bad({ daily_budget_brl: 30 })).toContain('teto');
    expect(bad({ daily_budget_brl: 30, max_spend_brl: 20 })).toContain('teto');
    expect(bad({ daily_budget_brl: 2, max_spend_brl: 100 })).toContain('orçamento diário');
    expect(bad({ daily_budget_brl: 30, max_spend_brl: 100, destination_url: 'https://evil.example/p/X' })).toContain('destino');
    expect(bad({ daily_budget_brl: 30, max_spend_brl: 100, cta_type: 'CALL_NOW' })).toContain('cta_type');
    expect(bad({ daily_budget_brl: 30, max_spend_brl: 100, adsets: [{ targeting: { countries: ['BR'], age_min: 13, age_max: 65 } }] })).toContain('idade');
    expect(bad({ daily_budget_brl: 30, max_spend_brl: 100 }, { ...ctx, creatives: [cr('K', 'IMAGE')] })).toContain('VIDEO');
    expect(bad({ daily_budget_brl: 30, max_spend_brl: 100, campaign_name: 'x;DROP' })).toContain('campaign_name');
  });
});

describe('NORQVA-0021 — plano com ficha (modo real, sem Meta)', () => {
  let pool: Pool;
  let adminToken: string;
  let productId: string;
  let offerId: string;
  let offerHumanId: string;
  const AUTOMATION = 'test-automation-token-0021-launch-abcdefgh';

  beforeAll(async () => {
    pool = app.get('db') || initializeDB();
    await runMigrations(pool);
    process.env.NORQVA_AUTOMATION_TOKEN = AUTOMATION;
    delete process.env.CLAUDE_ROUTINE_FIRE_URL;
    delete process.env.CLAUDE_ROUTINE_TOKEN;
    const r = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'admin.norqva0021l@norqva.test', 'A', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`
    );
    adminToken = signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role: 'ADMIN' });
    const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
    productId = (await pool.query(`INSERT INTO products (human_id, name, category, description, is_demo) VALUES ($1, 'Produto L', 'Culinária', 'd', FALSE) RETURNING id`, [`PRD-L-${tag}`])).rows[0].id;
    offerHumanId = `OFF-L-${tag}`;
    offerId = (await pool.query(`INSERT INTO offers (human_id, product_id, name, price, description, is_demo) VALUES ($1, $2, 'Oferta L', 29.9, 'd', FALSE) RETURNING id`, [offerHumanId, productId])).rows[0].id;
    await pool.query(
      `INSERT INTO claims_registry (human_id, product_id, claim_text, claim_type, source, status, is_demo)
       VALUES ($1, $2, 'Receitas testadas em casa', 'FEATURE', 'teste', 'VERIFIED', FALSE)`,
      [`L-CL-${tag}`, productId]
    );
    (globalThis as any).__claimL = `L-CL-${tag}`;
  });

  const auto = (path: string, body: any) => request(app).post(path).set('X-Norqva-Automation-Token', AUTOMATION).send(body);

  it('creates the DRAFT batch and the DRAFT launch plan; a bad sheet writes nothing', async () => {
    const opp = (await request(app).post('/api/ai-team/opportunities').set('Authorization', `Bearer ${adminToken}`).send({ source: 'MANUAL', brief: 'Trattoria para quem cozinha no fim de semana', product_id: productId })).body;
    await request(app).post(`/api/ai-team/opportunities/${opp.id}/dispatch`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'EVALUATE' });
    await auto(`/api/automation/opportunities/${opp.id}/evaluation`, { score: 70, verdict: 'TESTAR', summary: 'ok' });
    await auto(`/api/automation/opportunities/${opp.id}/validation`, { verdict: 'APROVA', summary: 'ok', checklist: VALIDATION_CHECKS.map(c => ({ key: c.key, status: 'OK' })) });
    const planDispatch = await request(app).post(`/api/ai-team/opportunities/${opp.id}/dispatch`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'PLAN' });
    expect(planDispatch.status).toBe(200);

    const claim = (globalThis as any).__claimL;
    const creative = (format: string, i: number) => ({ hook: `Gancho ${i}`, headline: `Título ${i}`, primary_text: `Texto ${i}`, cta: 'Ver receitas', format, script: 's', claim_codes: [claim] });
    const base = { product_id: productId, offer_id: offerId, summary: 'Teste de 2 vídeos', creatives: [creative('VIDEO', 1), creative('VIDEO', 2), creative('IMAGE', 3)] };

    const badSheet = await auto(`/api/automation/opportunities/${opp.id}/plan`, { ...base, launch: { daily_budget_brl: 30, max_spend_brl: 10 } });
    expect(badSheet.status).toBe(400);
    expect(badSheet.body.error).toContain('Ficha da campanha');
    const code = `${opp.human_id}-B01`;
    expect((await pool.query(`SELECT COUNT(*)::int n FROM creative_batches WHERE code = $1`, [code])).rows[0].n).toBe(0);

    const ok = await auto(`/api/automation/opportunities/${opp.id}/plan`, { ...base, launch: { daily_budget_brl: 30, max_spend_brl: 210, adsets: [{ targeting_summary: 'Brasil amplo 25-65' }] } });
    expect(ok.status).toBe(200);
    const launch = ok.body.opportunity.plan.launch;
    expect(launch.code).toBe(`${opp.human_id}-L01`);
    expect(launch.draft).toMatchObject({ code: `${opp.human_id}-L01`, status: 'DRAFT' });
    expect(launch.ads.map((a: any) => a.name)).toEqual([`${code}-C01`, `${code}-C02`]);
    expect(launch.excluded_creatives.map((a: any) => a.key)).toEqual([`${code}-C03`]);

    const lp = await pool.query(`SELECT status, offer_human_id, daily_budget_brl, max_spend_brl, spec, meta_ids FROM launch_plans WHERE code = $1`, [launch.code]);
    expect(lp.rows[0].status).toBe('DRAFT');
    expect(lp.rows[0].offer_human_id).toBe(offerHumanId);
    expect(parseFloat(lp.rows[0].max_spend_brl)).toBe(210);
    const spec = typeof lp.rows[0].spec === 'string' ? JSON.parse(lp.rows[0].spec) : lp.rows[0].spec;
    expect(spec.ads.every((a: any) => a.video_url === 'TO_BE_FILLED')).toBe(true);
    const ids = typeof lp.rows[0].meta_ids === 'string' ? JSON.parse(lp.rows[0].meta_ids) : lp.rows[0].meta_ids;
    expect(Object.values(ids).every((m: any) => Object.keys(m).length === 0)).toBe(true); // nothing on Meta

    // Re-planning while the launch plan is still DRAFT updates it in place
    const again = await auto(`/api/automation/opportunities/${opp.id}/plan`, { ...base, launch: { daily_budget_brl: 25, max_spend_brl: 150 } });
    expect(again.status).toBe(200);
    expect(again.body.opportunity.plan.launch.draft.status).toBe('DRAFT');
    expect(parseFloat((await pool.query(`SELECT max_spend_brl FROM launch_plans WHERE code = $1`, [launch.code])).rows[0].max_spend_brl)).toBe(150);
  });

  it('the plan without a sheet still works (backward compatible)', async () => {
    const opp = (await request(app).post('/api/ai-team/opportunities').set('Authorization', `Bearer ${adminToken}`).send({ source: 'MANUAL', brief: 'Sem ficha', product_id: productId })).body;
    await request(app).post(`/api/ai-team/opportunities/${opp.id}/dispatch`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'EVALUATE' });
    await auto(`/api/automation/opportunities/${opp.id}/evaluation`, { score: 70, verdict: 'TESTAR', summary: 'ok' });
    await auto(`/api/automation/opportunities/${opp.id}/validation`, { verdict: 'APROVA', summary: 'ok', checklist: VALIDATION_CHECKS.map(c => ({ key: c.key, status: 'OK' })) });
    const claim = (globalThis as any).__claimL;
    const r = await auto(`/api/automation/opportunities/${opp.id}/plan`, {
      product_id: productId, offer_id: offerId, creatives: [{ hook: 'g', headline: 't', primary_text: 'p', cta: 'c', format: 'VIDEO', claim_codes: [claim] }]
    });
    expect(r.status).toBe(200);
    expect(r.body.opportunity.plan.launch).toBeUndefined();
  });
});
