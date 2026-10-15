// NORQVA-0066: trocar a oferta (e o produto) de um criativo; as promessas acompanham. Sem serviços externos.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';

describe.sequential('NORQVA-0066 — trocar a oferta do criativo', () => {
  let pool: Pool;
  let admin: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const p1 = crypto.randomUUID();
  const p2 = crypto.randomUUID();
  const o1 = crypto.randomUUID();
  const o2 = crypto.randomUUID();
  let creative = '';
  let claim1 = '';
  const post = (url: string, body: any) => request(app).post(url).set('Authorization', `Bearer ${admin}`).send(body);

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const u = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.norqva0066@norqva.test', 'U 0066', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    admin = signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role: 'ADMIN' });
    for (const [pid, n] of [[p1, 'Kit antigo'], [p2, 'Kit completo']] as const) {
      await pool.query(
        `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance) VALUES ($1, $2, $3, 'Receitas', 'x', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
        [pid, `PRD-${tag}${n.length}`, n]
      );
    }
    await pool.query(`INSERT INTO offers (id, human_id, product_id, name, price, description, status) VALUES ($1, $2, $3, 'Oferta antiga', 27.9, 'x', 'RASCUNHO')`, [o1, `OFF-T66A${tag}`, p1]);
    await pool.query(`INSERT INTO offers (id, human_id, product_id, name, price, description, status) VALUES ($1, $2, $3, 'Oferta nova', 79.9, 'x', 'RASCUNHO')`, [o2, `OFF-T66B${tag}`, p2]);
    const c = await pool.query(
      `INSERT INTO creatives (human_id, product_id, offer_id, hook, concept, copy, primary_text, headline, cta, format, status, is_demo, utm_content_key, approval_status)
       VALUES ($1, $2, $3, 'Gancho', 'c', 'Texto', 'Texto', 'Título', 'Saiba mais', 'VIDEO', 'IDEIA', FALSE, $1, 'APPROVED') RETURNING id`,
      [`T66${tag}`, p1, o1]
    );
    creative = c.rows[0].id;
    const cl = await pool.query(
      `INSERT INTO claims_registry (human_id, product_id, claim_text, claim_type, status, is_demo) VALUES ($1, $2, 'O kit reúne 5 livros em PDF', 'FEATURE', 'VERIFIED', FALSE) RETURNING id`,
      [`CLM-T66${tag}`, p1]
    );
    claim1 = cl.rows[0].id;
    await pool.query('INSERT INTO creative_claims (creative_id, claim_id) VALUES ($1, $2)', [creative, claim1]);
    const price = await pool.query(
      `INSERT INTO claims_registry (human_id, product_id, claim_text, claim_type, status, is_demo) VALUES ($1, $2, 'R$ 27,90 no Pix', 'PRICE', 'VERIFIED', FALSE) RETURNING id`,
      [`CLM-T66P${tag}`, p1]
    );
    await pool.query('INSERT INTO creative_claims (creative_id, claim_id) VALUES ($1, $2)', [creative, price.rows[0].id]);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM creative_claims WHERE creative_id = $1', [creative]).catch(() => {});
    await pool.query('DELETE FROM creatives WHERE id = $1', [creative]).catch(() => {});
    await pool.query('DELETE FROM claims_registry WHERE product_id IN ($1, $2)', [p1, p2]).catch(() => {});
    await pool.query('DELETE FROM offers WHERE id IN ($1, $2)', [o1, o2]).catch(() => {});
    await pool.query('DELETE FROM products WHERE id IN ($1, $2)', [p1, p2]).catch(() => {});
  });

  it('troca a oferta, muda o produto, mantém a aprovação e leva a promessa ao produto novo sem a verificação', async () => {
    const r = await post(`/api/creative-factory/creatives/${creative}/offer?mode=real`, { offer_id: o2 });
    expect(r.status).toBe(200);
    expect(r.body.claims_moved).toBe(1);
    expect(r.body.claims_unverified).toBe(1);
    const c = await pool.query('SELECT product_id, offer_id, approval_status FROM creatives WHERE id = $1', [creative]);
    expect(c.rows[0].offer_id).toBe(o2);
    expect(c.rows[0].product_id).toBe(p2);
    expect(c.rows[0].approval_status).toBe('APPROVED');
    const cl = await pool.query(
      `SELECT cr.product_id, cr.status, cr.claim_text FROM creative_claims cc JOIN claims_registry cr ON cr.id = cc.claim_id WHERE cc.creative_id = $1`,
      [creative]
    );
    expect(cl.rows).toHaveLength(1); // a promessa de preço não é levada (anúncio sem preço)
    expect(cl.rows[0].product_id).toBe(p2);
    expect(cl.rows[0].status).toBe('UNVERIFIED');
    expect(cl.rows[0].claim_text).toBe('O kit reúne 5 livros em PDF');
    const audit = await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'CREATIVE_OFFER_CHANGED' AND description LIKE $1`, [`%T66${tag}%`]);
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('recusa a mesma oferta, oferta inexistente e criativo ligado a anúncio da Meta', async () => {
    expect((await post(`/api/creative-factory/creatives/${creative}/offer?mode=real`, { offer_id: o2 })).status).toBe(400);
    expect((await post(`/api/creative-factory/creatives/${creative}/offer?mode=real`, { offer_id: crypto.randomUUID() })).status).toBe(404);
    expect((await post(`/api/creative-factory/creatives/${creative}/offer?mode=real`, {})).status).toBe(400);
    await pool.query(`INSERT INTO creative_meta_ads (creative_id, meta_ad_id) VALUES ($1, $2)`, [creative, `AD${tag}`]);
    const r = await post(`/api/creative-factory/creatives/${creative}/offer?mode=real`, { offer_id: o1 });
    expect(r.status).toBe(409);
    await pool.query('DELETE FROM creative_meta_ads WHERE creative_id = $1', [creative]);
  });
});
