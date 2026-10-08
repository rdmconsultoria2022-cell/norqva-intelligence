// NORQVA-0025: tela única Criativos — criativo manual aparece, recebe arquivo e promessas,
// e só é aprovado com as promessas verificadas (mesma regra dos lotes).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';

describe.sequential('NORQVA-0025 — Criativos numa tela só', () => {
  let pool: Pool;
  let adminToken: string;
  let creativeToken: string;
  let viewerToken: string;
  const productId = crypto.randomUUID();
  const otherProductId = crypto.randomUUID();
  let creativeId: string;
  let creativeKey: string;

  const as = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: any = {}) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
    patch: (url: string, body: any = {}) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body)
  });

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const r = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE'
         RETURNING auth_user_id, email`,
        [crypto.randomUUID(), email, email, role]
      );
      return signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role });
    };
    for (const [id, hid] of [[productId, 'PRD-0025-A'], [otherProductId, 'PRD-0025-B']]) {
      await pool.query(
        `INSERT INTO products (id, human_id, name, category, description, status, is_demo)
         VALUES ($1, $2, $2, 'Receitas', 'Fixture 0025', 'PLANEJADO', true)
         ON CONFLICT (id) DO NOTHING`,
        [id, `${hid}-${productId.slice(0, 6)}`]
      );
    }
    adminToken = await mk('admin.norqva0025@norqva.test', 'ADMIN');
    creativeToken = await mk('creative.norqva0025@norqva.test', 'CREATIVE');
    viewerToken = await mk('perf.norqva0025@norqva.test', 'PERFORMANCE');
  });

  // Banco de testes compartilhado: apaga o que este arquivo criou (o seed de outros testes usa CR-000001…)
  afterAll(async () => {
    const ids = [productId, otherProductId];
    await pool.query('DELETE FROM creatives WHERE product_id = ANY($1::uuid[]) AND parent_creative_id IS NOT NULL', [ids]);
    await pool.query('DELETE FROM creatives WHERE product_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM claims_registry WHERE product_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM products WHERE id = ANY($1::uuid[])', [ids]);
  });

  const list = async () => {
    const r = await as(adminToken).get('/api/creative-factory/creatives?mode=demo&period=all');
    expect(r.status).toBe(200);
    return r.body;
  };

  it('cadastro manual sem arquivo é aceito e aparece na tela Criativos como Manual', async () => {
    const r = await as(creativeToken).post('/api/creatives?mode=demo', {
      product_id: productId,
      hook: 'A lasanha que parece de cantina',
      concept: 'Mesa de madeira, luz natural',
      copy: '28 receitas italianas para fazer em casa',
      cta: 'Saiba mais',
      format: 'VIDEO'
    });
    expect(r.status).toBe(201);
    creativeId = r.body.creative.id;
    creativeKey = r.body.creative.human_id;
    expect(r.body.creative.file_url).toBeNull();
    expect(r.body.creative.primary_text).toBe('28 receitas italianas para fazer em casa');
    expect(r.body.creative.utm_content_key).toBe(creativeKey);

    const body = await list();
    const c = body.creatives.find((x: any) => x.id === creativeId);
    expect(c).toBeTruthy();
    expect(c.origin).toBe('MANUAL');
    expect(c.product_name).toBeTruthy();
    expect(c.claims_all_verified).toBe(false);
  });

  it('link de arquivo inválido no cadastro é recusado', async () => {
    const r = await as(creativeToken).post('/api/creatives?mode=demo', {
      product_id: productId, hook: 'h', concept: 'c', copy: 't', cta: 'x', format: 'VIDEO', file_url: 'javascript:alert(1)'
    });
    expect(r.status).toBe(400);
  });

  it('criativo manual recebe arquivo depois, na mesma tela', async () => {
    const r = await as(creativeToken).post(`/api/creative-factory/creatives/${creativeId}/file?mode=demo`, { file_url: 'https://cdn.example.com/lasanha.mp4' });
    expect(r.status).toBe(200);
    expect(r.body.file_url).toBe('https://cdn.example.com/lasanha.mp4');
  });

  it('sem promessa registrada, a aprovação continua bloqueada', async () => {
    const r = await as(adminToken).post(`/api/creative-factory/creatives/${creativeId}/review?mode=demo`, { decision: 'APPROVED' });
    expect(r.status).toBe(409);
  });

  it('registrar promessa: nova entra como não verificada; perfil de leitura não pode', async () => {
    const denied = await as(viewerToken).post(`/api/creative-factory/creatives/${creativeId}/claims?mode=demo`, { claim_text: 'x' });
    expect(denied.status).toBe(403);

    const empty = await as(creativeToken).post(`/api/creative-factory/creatives/${creativeId}/claims?mode=demo`, { claim_text: '  ' });
    expect(empty.status).toBe(400);
    const badType = await as(creativeToken).post(`/api/creative-factory/creatives/${creativeId}/claims?mode=demo`, { claim_text: 'x', claim_type: 'MAGIC' });
    expect(badType.status).toBe(400);

    const r = await as(creativeToken).post(`/api/creative-factory/creatives/${creativeId}/claims?mode=demo`, {
      claim_text: '28 receitas italianas',
      claim_type: 'FEATURE'
    });
    expect(r.status).toBe(201);
    const claim = await pool.query('SELECT status, product_id FROM claims_registry WHERE id = $1', [r.body.claim_id]);
    expect(claim.rows[0].status).toBe('UNVERIFIED');
    expect(claim.rows[0].product_id).toBe(productId);

    const still = await as(adminToken).post(`/api/creative-factory/creatives/${creativeId}/review?mode=demo`, { decision: 'APPROVED' });
    expect(still.status).toBe(409);

    const verify = await as(adminToken).patch(`/api/creative-factory/claims/${r.body.claim_id}?mode=demo`, { status: 'VERIFIED' });
    expect(verify.status).toBe(200);
    const ok = await as(adminToken).post(`/api/creative-factory/creatives/${creativeId}/review?mode=demo`, { decision: 'APPROVED' });
    expect(ok.status).toBe(200);
    expect(ok.body.approval_status).toBe('APPROVED');

    // Aprovado: promessas não mudam sem nova versão
    const locked = await as(creativeToken).post(`/api/creative-factory/creatives/${creativeId}/claims?mode=demo`, { claim_text: 'outra' });
    expect(locked.status).toBe(409);
  });

  it('promessa de outro produto não pode ser reaproveitada', async () => {
    const other = await pool.query(
      `INSERT INTO claims_registry (human_id, product_id, claim_text, claim_type, status, is_demo)
       VALUES ($1, $2, 'De outro produto', 'FEATURE', 'VERIFIED', true) RETURNING id`,
      [`CLM-0025-${crypto.randomUUID().slice(0, 6)}`, otherProductId]
    );
    const r2 = await as(creativeToken).post('/api/creatives?mode=demo', {
      product_id: productId, hook: 'h2', concept: 'c2', copy: 't2', cta: 'Saiba mais', format: 'IMAGE'
    });
    const r = await as(creativeToken).post(`/api/creative-factory/creatives/${r2.body.creative.id}/claims?mode=demo`, { claim_id: other.rows[0].id });
    expect(r.status).toBe(409);
  });

  it('editar o texto de criativo manual já revisado cria nova versão', async () => {
    const r = await as(creativeToken).post(`/api/creative-factory/creatives/${creativeId}/revise?mode=demo`, { primary_text: 'Texto novo' });
    expect(r.status).toBe(200);
    expect(r.body.mode).toBe('NEW_VERSION');
    expect(r.body.creative.human_id).toBe(`${creativeKey}-V2-DEMO`);
  });
});
