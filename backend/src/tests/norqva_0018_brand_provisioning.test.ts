import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { MetaMutatingClient, OFFICIAL_NORQVA_PIXEL_ID, NORQVA_BUSINESS_ID, resetMetaPreflightCacheForTesting } from '../services/meta/metaMutatingClient';
import { setBrandMetaClientFactoryForTesting } from '../controllers/brandController';
import { resolveBrandPixelId } from '../services/brands/brandService';

// NORQVA-0018 (fase C): pixel da marca pela API e conferência de ativos. Nenhuma chamada real à Meta.

describe('NORQVA-0018 — provisionamento de ativos da marca', () => {
  let pool: Pool;
  let adminToken: string;
  let creativeToken: string;
  const ENV_KEYS = ['META_MUTATION_ENABLED', 'META_AD_ACCOUNT_ID', 'META_BUSINESS_ID'] as const;
  const envBackup: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  const PAGE = '1287452237795325';
  const IG = '17841424315618975';
  const NEW_PIXEL = '5566778899001122';

  const fakeGet = (over: Record<string, any> = {}) =>
    vi.fn(async (endpoint: string) => {
      if (endpoint in over) {
        const v = over[endpoint];
        if (v instanceof Error) throw v;
        return v;
      }
      if (endpoint === '/me') return { id: 'u1' };
      if (endpoint === '/me/permissions') return { data: [{ permission: 'ads_management', status: 'granted' }] };
      if (endpoint.startsWith('/act_')) return { id: endpoint.slice(1), account_status: 1 };
      if (endpoint === `/${OFFICIAL_NORQVA_PIXEL_ID}`) return { id: OFFICIAL_NORQVA_PIXEL_ID };
      if (endpoint === `/${NORQVA_BUSINESS_ID}/owned_pages`) return { data: [{ id: '111' }, { id: PAGE }] };
      if (endpoint === `/${NORQVA_BUSINESS_ID}/client_pages`) return { data: [] };
      if (endpoint === `/${PAGE}`) return { id: PAGE, instagram_business_account: { id: IG } };
      if (endpoint === `/${NEW_PIXEL}`) return { id: NEW_PIXEL, owner_business: { id: NORQVA_BUSINESS_ID } };
      throw new Error('unexpected GET ' + endpoint);
    });

  const mkBrand = async () => {
    const code = `PROV_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const id = (await pool.query(`INSERT INTO brands (code, name) VALUES ($1, 'Marca Prov') RETURNING id`, [code])).rows[0].id;
    await pool.query(
      `INSERT INTO brand_meta_assets (brand_id, asset_type, external_id, status, created_by) VALUES ($1, 'FACEBOOK_PAGE', $2, 'LINKED', 'OPERATOR')`,
      [id, PAGE]
    );
    await pool.query(
      `INSERT INTO brand_meta_assets (brand_id, asset_type, external_id, handle, status, created_by) VALUES ($1, 'INSTAGRAM', $2, 'x', 'LINKED', 'OPERATOR')`,
      [id, IG]
    );
    return id as string;
  };

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
    adminToken = await mk('admin.norqva0018c@norqva.test', 'ADMIN');
    creativeToken = await mk('creative.norqva0018c@norqva.test', 'CREATIVE');
  });

  beforeEach(() => {
    process.env.META_MUTATION_ENABLED = 'true';
    process.env.META_AD_ACCOUNT_ID = 'act_2887010388338951';
    delete process.env.META_BUSINESS_ID;
    resetMetaPreflightCacheForTesting();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
    setBrandMetaClientFactoryForTesting(null);
    resetMetaPreflightCacheForTesting();
  });

  it('usa o portfólio Norqva (1361471345973932) como padrão', () => {
    expect(NORQVA_BUSINESS_ID).toBe('1361471345973932');
  });

  it('confere Página e Instagram pela API e marca VERIFIED', async () => {
    const brandId = await mkBrand();
    setBrandMetaClientFactoryForTesting(() => new MetaMutatingClient(vi.fn(), undefined, fakeGet()));
    const forbidden = await request(app).post(`/api/brands/${brandId}/verify`).set('Authorization', `Bearer ${creativeToken}`);
    expect(forbidden.status).toBe(403);
    const r = await request(app).post(`/api/brands/${brandId}/verify`).set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ asset_type: 'FACEBOOK_PAGE', status: 'VERIFIED', ok: true }),
        expect.objectContaining({ asset_type: 'INSTAGRAM', status: 'VERIFIED', ok: true })
      ])
    );
    const rows = (await pool.query(`SELECT asset_type, status, verified_at FROM brand_meta_assets WHERE brand_id = $1`, [brandId])).rows;
    expect(rows.every((x: any) => x.status === 'VERIFIED' && x.verified_at)).toBe(true);
  });

  it('aceita Página compartilhada como parceira e explica quando o token não vê Páginas', async () => {
    const brandId = await mkBrand();
    setBrandMetaClientFactoryForTesting(() =>
      new MetaMutatingClient(vi.fn(), undefined, fakeGet({ [`/${NORQVA_BUSINESS_ID}/owned_pages`]: { data: [] }, [`/${NORQVA_BUSINESS_ID}/client_pages`]: { data: [{ id: PAGE }] } }))
    );
    const r = await request(app).post(`/api/brands/${brandId}/verify`).set('Authorization', `Bearer ${adminToken}`);
    expect(r.body.results.find((x: any) => x.asset_type === 'FACEBOOK_PAGE')).toMatchObject({ status: 'VERIFIED', ok: true, detail: expect.stringContaining('parceiro') });

    const other = await mkBrand();
    setBrandMetaClientFactoryForTesting(() =>
      new MetaMutatingClient(vi.fn(), undefined, fakeGet({ [`/${NORQVA_BUSINESS_ID}/owned_pages`]: { data: [] }, [`/${NORQVA_BUSINESS_ID}/client_pages`]: { data: [] } }))
    );
    const r2 = await request(app).post(`/api/brands/${other}/verify`).set('Authorization', `Bearer ${adminToken}`);
    const page = r2.body.results.find((x: any) => x.asset_type === 'FACEBOOK_PAGE');
    expect(page).toMatchObject({ status: 'LINKED', ok: false });
    expect(page.detail).toContain('business_management');
  });

  it('Instagram diferente fica LINKED com o motivo; erro de leitura não rebaixa', async () => {
    const brandId = await mkBrand();
    setBrandMetaClientFactoryForTesting(() =>
      new MetaMutatingClient(vi.fn(), undefined, fakeGet({ [`/${PAGE}`]: { id: PAGE, instagram_business_account: { id: '999' } }, [`/${NORQVA_BUSINESS_ID}/owned_pages`]: new Error('[META GRAPH API ERROR]: sem permissão') }))
    );
    const r = await request(app).post(`/api/brands/${brandId}/verify`).set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    const ig = r.body.results.find((x: any) => x.asset_type === 'INSTAGRAM');
    expect(ig).toMatchObject({ status: 'LINKED', ok: false });
    expect(ig.detail).toContain('999');
    const page = (await pool.query(`SELECT status, last_error FROM brand_meta_assets WHERE brand_id = $1 AND asset_type = 'FACEBOOK_PAGE'`, [brandId])).rows[0];
    expect(page.status).toBe('LINKED');
    expect(page.last_error).toContain('sem permissão');
  });

  it('Instagram: aceita connected_instagram_account e orienta quando a Página não informa o vínculo', async () => {
    const a = await mkBrand();
    setBrandMetaClientFactoryForTesting(() => new MetaMutatingClient(vi.fn(), undefined, fakeGet({ [`/${PAGE}`]: { id: PAGE, connected_instagram_account: { id: IG } } })));
    const r = await request(app).post(`/api/brands/${a}/verify`).set('Authorization', `Bearer ${adminToken}`);
    expect(r.body.results.find((x: any) => x.asset_type === 'INSTAGRAM')).toMatchObject({ status: 'VERIFIED', ok: true });

    const b = await mkBrand();
    setBrandMetaClientFactoryForTesting(() =>
      new MetaMutatingClient(vi.fn(), undefined, fakeGet({ [`/${PAGE}`]: { id: PAGE }, [`/${IG}`]: { id: IG, username: 'x' } }))
    );
    const r2 = await request(app).post(`/api/brands/${b}/verify`).set('Authorization', `Bearer ${adminToken}`);
    const ig = r2.body.results.find((x: any) => x.asset_type === 'INSTAGRAM');
    expect(ig).toMatchObject({ status: 'LINKED', ok: false });
    expect(ig.detail).toContain('Empresa');
  });

  it('cria o pixel com as travas da D-0007, verifica e não cria um segundo', async () => {
    const brandId = await mkBrand();
    const post = vi.fn(async (endpoint: string, payload: any) => {
      if (endpoint === `/${NORQVA_BUSINESS_ID}/adspixels`) return { id: NEW_PIXEL, name: payload.name };
      if (endpoint === `/${NEW_PIXEL}/shared_accounts`) return { success: true } as any;
      throw new Error('unexpected POST ' + endpoint);
    });
    setBrandMetaClientFactoryForTesting(() => new MetaMutatingClient(post, undefined, fakeGet()));

    process.env.META_MUTATION_ENABLED = 'false';
    const blocked = await request(app).post(`/api/brands/${brandId}/provision/pixel`).set('Authorization', `Bearer ${adminToken}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toContain('META_MUTATION_ENABLED');
    expect(post).not.toHaveBeenCalled();

    process.env.META_MUTATION_ENABLED = 'true';
    expect((await request(app).post(`/api/brands/${brandId}/provision/pixel`).set('Authorization', `Bearer ${creativeToken}`)).status).toBe(403);

    const ok = await request(app).post(`/api/brands/${brandId}/provision/pixel`).set('Authorization', `Bearer ${adminToken}`);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ pixel_id: NEW_PIXEL, shared_with_ad_account: true });
    expect(post).toHaveBeenCalledWith(`/${NORQVA_BUSINESS_ID}/adspixels`, { name: 'Marca Prov (NORQVA)' });
    expect(post).toHaveBeenCalledWith(`/${NEW_PIXEL}/shared_accounts`, { account_id: '2887010388338951', business: NORQVA_BUSINESS_ID });

    const px = (await pool.query(`SELECT * FROM brand_meta_assets WHERE brand_id = $1 AND asset_type = 'PIXEL'`, [brandId])).rows[0];
    expect(px).toMatchObject({ external_id: NEW_PIXEL, status: 'VERIFIED', created_by: 'API', routing_enabled: false });

    const again = await request(app).post(`/api/brands/${brandId}/provision/pixel`).set('Authorization', `Bearer ${adminToken}`);
    expect(again.status).toBe(409);
    expect(post.mock.calls.filter(c => c[0].endsWith('/adspixels'))).toHaveLength(1);
  });

  it('falha da Meta vira FAILED com o motivo', async () => {
    const brandId = await mkBrand();
    const post = vi.fn(async () => {
      throw new Error('[META GRAPH API ERROR]: Limite de pixels atingido');
    });
    setBrandMetaClientFactoryForTesting(() => new MetaMutatingClient(post as any, undefined, fakeGet()));
    const r = await request(app).post(`/api/brands/${brandId}/provision/pixel`).set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(502);
    expect(r.body.error).toContain('Limite de pixels');
    const px = (await pool.query(`SELECT status, last_error FROM brand_meta_assets WHERE brand_id = $1 AND asset_type = 'PIXEL'`, [brandId])).rows[0];
    expect(px.status).toBe('FAILED');
    expect(px.last_error).toContain('Limite de pixels');
  });

  it('roteamento: só liga com pixel VERIFIED e muda para onde vão as vendas', async () => {
    const brandId = await mkBrand();
    const url = `/api/brands/${brandId}/pixel-routing`;
    expect((await request(app).put(url).set('Authorization', `Bearer ${adminToken}`).send({ enabled: true })).status).toBe(409);
    await pool.query(
      `INSERT INTO brand_meta_assets (brand_id, asset_type, external_id, status, created_by) VALUES ($1, 'PIXEL', $2, 'LINKED', 'API')`,
      [brandId, NEW_PIXEL]
    );
    expect((await request(app).put(url).set('Authorization', `Bearer ${adminToken}`).send({ enabled: true })).status).toBe(409);
    await pool.query(`UPDATE brand_meta_assets SET status = 'VERIFIED' WHERE brand_id = $1 AND asset_type = 'PIXEL'`, [brandId]);
    expect((await request(app).put(url).set('Authorization', `Bearer ${adminToken}`).send({ enabled: 'sim' })).status).toBe(400);
    expect((await request(app).put(url).set('Authorization', `Bearer ${creativeToken}`).send({ enabled: true })).status).toBe(403);

    const product = (
      await pool.query(`INSERT INTO products (human_id, name, category, description, brand_id) VALUES ($1, 'P', 'T', 'x', $2) RETURNING id`, [`PRD-R-${brandId.slice(0, 8)}`, brandId])
    ).rows[0].id;
    const offer = (
      await pool.query(`INSERT INTO offers (human_id, product_id, name, price, description, status) VALUES ($1, $2, 'O', 10, 'x', 'ATIVA') RETURNING id`, [`OFF-R-${brandId.slice(0, 8)}`, product])
    ).rows[0].id;
    expect(await resolveBrandPixelId(pool, { offerId: offer })).toBeNull();
    const on = await request(app).put(url).set('Authorization', `Bearer ${adminToken}`).send({ enabled: true });
    expect(on.status).toBe(200);
    expect(await resolveBrandPixelId(pool, { offerId: offer })).toBe(NEW_PIXEL);
    await request(app).put(url).set('Authorization', `Bearer ${adminToken}`).send({ enabled: false });
    expect(await resolveBrandPixelId(pool, { offerId: offer })).toBeNull();
  });
});
