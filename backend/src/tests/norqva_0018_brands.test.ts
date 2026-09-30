import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { normalizeBrandCode, validateSpokesperson, BrandError } from '../services/brands/brandService';

// NORQVA-0018 (fase A): marcas por nicho e checklist de ativos Meta (D-0009).

describe('NORQVA-0018 — regras de marca', () => {
  it('normaliza o código', () => {
    expect(normalizeBrandCode('Culinária Itália!')).toBe('CULINARIA_ITALIA');
    expect(() => normalizeBrandCode('  ')).toThrow(BrandError);
  });

  it('porta-voz: marca não aceita consentimento; criador real exige', () => {
    expect(validateSpokesperson(undefined, undefined)).toEqual({ type: 'BRAND_ONLY', consent: null });
    expect(() => validateSpokesperson('BRAND_ONLY', 'termo-01')).toThrow(/criador real/);
    expect(() => validateSpokesperson('REAL_CREATOR', '')).toThrow(/consentimento/);
    expect(validateSpokesperson('REAL_CREATOR', 'termo-01').consent).toBe('termo-01');
    expect(() => validateSpokesperson('AVATAR_REALISTA', null)).toThrow(/inválido/);
  });
});

describe('NORQVA-0018 — endpoints de marca', () => {
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
    adminToken = await mk('admin.norqva0018@norqva.test', 'ADMIN');
    creativeToken = await mk('creative.norqva0018@norqva.test', 'CREATIVE');
  });

  it('migration cria o piloto Trattoria com a Página registrada', async () => {
    const r = await request(app).get('/api/brands').set('Authorization', `Bearer ${creativeToken}`);
    expect(r.status).toBe(200);
    const t = r.body.brands.find((b: any) => b.code === 'TRATTORIA');
    expect(t).toMatchObject({ name: 'Trattoria em Casa', spokesperson_type: 'BRAND_ONLY', status: 'PILOT', assets_total: 5 });
    const page = t.assets.find((a: any) => a.asset_type === 'FACEBOOK_PAGE');
    expect(page).toMatchObject({ external_id: '1287452237795325', status: 'LINKED' });
    expect(t.assets.find((a: any) => a.asset_type === 'INSTAGRAM').status).toBe('PENDING_OPERATOR');
  });

  it('só ADMIN cria marca; valida porta-voz e código duplicado', async () => {
    const forbidden = await request(app).post('/api/brands').set('Authorization', `Bearer ${creativeToken}`).send({ name: 'X' });
    expect(forbidden.status).toBe(403);
    const badConsent = await request(app)
      .post('/api/brands')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Marca Teste 0018', spokesperson_type: 'BRAND_ONLY', real_person_consent_ref: 'termo' });
    expect(badConsent.status).toBe(400);
    const created = await request(app).post('/api/brands').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Marca Teste 0018' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ code: 'MARCA_TESTE_0018', spokesperson_type: 'BRAND_ONLY', status: 'DRAFT' });
    const dup = await request(app).post('/api/brands').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Marca Teste 0018' });
    expect(dup.status).toBe(409);

    const toCreator = await request(app).patch(`/api/brands/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`).send({ spokesperson_type: 'REAL_CREATOR' });
    expect(toCreator.status).toBe(400);
    const status = await request(app).patch(`/api/brands/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PROVISIONING' });
    expect(status.status).toBe(200);
    expect(status.body.status).toBe('PROVISIONING');
  });

  it('registro manual de ativo: números no ID, sem VERIFIED manual, só ADMIN', async () => {
    const brand = (await pool.query(`SELECT id FROM brands WHERE code = 'MARCA_TESTE_0018'`)).rows[0];
    const url = `/api/brands/${brand.id}/assets/instagram`;
    expect((await request(app).put(url).set('Authorization', `Bearer ${creativeToken}`).send({ handle: 'x' })).status).toBe(403);
    expect((await request(app).put(url).set('Authorization', `Bearer ${adminToken}`).send({ external_id: 'abc' })).status).toBe(400);
    expect((await request(app).put(url).set('Authorization', `Bearer ${adminToken}`).send({ handle: 'x', status: 'VERIFIED' })).status).toBe(400);
    expect((await request(app).put(`/api/brands/${brand.id}/assets/tiktok`).set('Authorization', `Bearer ${adminToken}`).send({ handle: 'x' })).status).toBe(400);
    const ok = await request(app).put(url).set('Authorization', `Bearer ${adminToken}`).send({ handle: '@marcateste.oficial' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ asset_type: 'INSTAGRAM', handle: 'marcateste.oficial', status: 'LINKED', created_by: 'OPERATOR' });

    const audit = await pool.query(`SELECT COUNT(*)::int AS n FROM audit_logs WHERE event_type = 'BRAND_ASSET_RECORDED'`);
    expect(audit.rows[0].n).toBeGreaterThan(0);
  });

  it('liga produto à marca', async () => {
    const brand = (await pool.query(`SELECT id FROM brands WHERE code = 'MARCA_TESTE_0018'`)).rows[0];
    const p = await pool.query(
      `INSERT INTO products (human_id, name, category, description)
       VALUES ('PRD-0018-T', 'Produto 0018', 'Teste', 'Produto de teste') ON CONFLICT (human_id) DO UPDATE SET name = EXCLUDED.name RETURNING id`
    );
    const r = await request(app).put(`/api/brands/${brand.id}/products/${p.rows[0].id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.brand_id).toBe(brand.id);
    const missing = await request(app)
      .put(`/api/brands/${brand.id}/products/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(missing.status).toBe(404);
  });
});
