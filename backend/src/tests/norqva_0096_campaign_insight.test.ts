// NORQVA-0096: equilíbrio da oferta e histórico da campanha (só leitura). Sem serviços externos.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { unitEconomics } from '../services/campaigns/campaignInsightService';

describe('NORQVA-0096 — contas da venda', () => {
  it('com custos cadastrados', () => {
    const e = unitEconomics({ price: 29.9, taxRate: 0.06, pctFee: 0.0099, fixedFee: 1.99, otherCost: 0, configured: true });
    expect(e.net_per_sale).toBe(25.82);
    expect(e.breakeven_cpa).toBe(25.82);
    expect(e.breakeven_roas).toBe(1.16);
    expect(e.estimated).toBe(false);
  });

  it('sem custos cadastrados usa a estimativa do vigia (6% + R$ 1,99)', () => {
    const e = unitEconomics({ price: 19.9, configured: false });
    expect(e.net_per_sale).toBe(16.72);
    expect(e.estimated).toBe(true);
  });

  it('preço que não cobre os custos não tem equilíbrio', () => {
    expect(unitEconomics({ price: 1, configured: false }).breakeven_cpa).toBeNull();
  });
});

describe.sequential('NORQVA-0096 — HTTP', () => {
  let pool: Pool;
  let admin: string;
  let perf: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const code = `T96${tag}`;
  const cmp = `cmp96_${tag}`;
  const productId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const offerHid = `OFF-T96${tag}`;
  let planId = '';

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const u = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, $2, 'U 0096', $3, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $3, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [crypto.randomUUID(), email, role]
      );
      return signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role });
    };
    admin = await mk('admin.insight0096@norqva.test', 'ADMIN');
    perf = await mk('perf.insight0096@norqva.test', 'PERFORMANCE');
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance) VALUES ($1, $2, 'Livro 0096', 'Receitas', 'x', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
      [productId, `PRD-T96${tag}`]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo, data_provenance) VALUES ($1, $2, 'Oferta 0096', $3, 29.9, 'ATIVA', 'x', false, 'COMMERCIAL_PRODUCTION')`,
      [offerId, offerHid, productId]
    );
    await pool.query(
      `INSERT INTO offer_unit_economics (offer_id, tax_rate, gateway_pct_fee, gateway_fixed_fee, other_variable_cost, is_demo) VALUES ($1, 0.06, 0.0099, 1.99, 0, FALSE)`,
      [offerId]
    );
    const r = await pool.query(
      `INSERT INTO launch_plans (code, offer_human_id, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text)
       VALUES ($1, $2, 'ACTIVE', '{"campaign":{"name":"x"},"adsets":[],"ads":[]}', $3, 20, 100, 'teste 0096') RETURNING id`,
      [code, offerHid, JSON.stringify({ campaign: { x: cmp } })]
    );
    planId = r.rows[0].id;
    await pool.query(
      `INSERT INTO audit_logs (user_id, event_type, description, is_demo) VALUES (NULL, 'LAUNCH_PLAN_CAP_CHANGED', $1, FALSE)`,
      [`Plano ${code}: teto de R$ 100 para R$ 150.`]
    );
    await pool.query(
      `INSERT INTO decision_events (correlation_id, phase, action, decision, actor_type, meta_ids, ip, user_agent)
       VALUES (gen_random_uuid(), 'EXECUTED', 'META_ENTITY_STATUS', 'CAMPAIGN:PAUSED', 'HUMAN', $1, '10.0.0.1', 'navegador')`,
      [JSON.stringify([cmp])]
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM launch_plans WHERE id = $1', [planId]).catch(() => {});
    await pool.query('DELETE FROM offer_unit_economics WHERE offer_id = $1', [offerId]).catch(() => {});
    await pool.query('DELETE FROM offers WHERE id = $1', [offerId]).catch(() => {});
    await pool.query('DELETE FROM products WHERE id = $1', [productId]).catch(() => {});
  });

  it('equilíbrio da oferta do plano', async () => {
    const r = await request(app).get(`/api/campaigns/${planId}/economics?mode=real`).set('Authorization', `Bearer ${perf}`);
    expect(r.status).toBe(200);
    expect(r.body.offer.human_id).toBe(offerHid);
    expect(r.body.economics).toMatchObject({ price: 29.9, breakeven_cpa: 25.82, breakeven_roas: 1.16, estimated: false });
  });

  it('histórico: auditoria para todos, decisões só para o administrador e sem IP', async () => {
    const p = await request(app).get(`/api/campaigns/${planId}/history?mode=real`).set('Authorization', `Bearer ${perf}`);
    expect(p.status).toBe(200);
    expect(p.body.items.some((i: any) => i.type === 'LAUNCH_PLAN_CAP_CHANGED')).toBe(true);
    expect(p.body.items.some((i: any) => i.kind === 'DECISION')).toBe(false);

    const a = await request(app).get(`/api/campaigns/${planId}/history?mode=real`).set('Authorization', `Bearer ${admin}`);
    const dec = a.body.items.find((i: any) => i.kind === 'DECISION');
    expect(dec).toMatchObject({ type: 'META_ENTITY_STATUS', description: 'CAMPAIGN:PAUSED', outcome: 'DONE' });
    expect(JSON.stringify(a.body)).not.toContain('10.0.0.1');
  });

  it('campanha inexistente', async () => {
    const r = await request(app).get(`/api/campaigns/${crypto.randomUUID()}/history?mode=real`).set('Authorization', `Bearer ${admin}`);
    expect(r.status).toBe(404);
  });
});
