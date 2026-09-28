import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { CREATIVE_BATCHES } from '../data/creativeBatches';

// NORQVA-0007: attach produced files to Factory creatives without creating a new version
// (a new version = new key = breaks the link with the Meta ad name).
describe('NORQVA-0007 — attach produced files to creatives', () => {
  let pool: Pool;
  let adminToken: string;
  let creativeToken: string;
  let perfToken: string;
  const FILE_KEYS = Object.keys(CREATIVE_BATCHES['BB-B01'].producedAssets || {});

  const as = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: any = {}) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body)
  });

  const byKey = async (key: string) =>
    (await pool.query(`SELECT * FROM creatives WHERE human_id = $1 AND is_demo = TRUE`, [`${key}-DEMO`])).rows[0];

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const r = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status)
         VALUES (gen_random_uuid(), $1, $2, $2, $3, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE'
         RETURNING auth_user_id, email`,
        [crypto.randomUUID(), email, role]
      );
      return signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role });
    };
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
    adminToken = await mk('admin.norqva0007@norqva.test', 'ADMIN');
    creativeToken = await mk('creative.norqva0007@norqva.test', 'CREATIVE');
    perfToken = await mk('perf.norqva0007@norqva.test', 'PERFORMANCE');

    const imp = await as(adminToken).post('/api/creative-factory/batches/BB-B01/import?mode=demo');
    expect(imp.status).toBe(200);
    // Start from a clean state for the produced-file creatives, whatever other suites did
    await pool.query(
      `UPDATE creatives SET file_url = NULL WHERE is_demo = TRUE AND batch_code = 'BB-B01' AND human_id = ANY($1::text[])`,
      [FILE_KEYS.map(k => `${k}-DEMO`)]
    );
  });

  it('batch data points every produced file to a public https URL of a real creative key', () => {
    const b = CREATIVE_BATCHES['BB-B01'];
    const keys = new Set(b.creatives.map(c => c.key));
    expect(FILE_KEYS).toEqual(
      expect.arrayContaining(['BB-B01-H01-M1-C1', 'BB-B01-H03-M1-C1', 'BB-B01-H04-M1-C1', 'BB-B01-H05-M1-C1', 'BB-B01-H05-M2-C1'])
    );
    for (const [k, url] of Object.entries(b.producedAssets || {})) {
      expect(keys.has(k)).toBe(true);
      expect(url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/.+\.(mp4|png)$/);
    }
  });

  it('attaching a file to an APPROVED creative keeps version, key and approval', async () => {
    const target = await byKey('BB-B01-H04-M1-C1');
    await pool.query(`UPDATE creatives SET approval_status = 'APPROVED' WHERE id = $1`, [target.id]);
    const before = (await pool.query(`SELECT COUNT(*)::int AS n FROM creatives WHERE is_demo = TRUE AND batch_code = 'BB-B01'`)).rows[0].n;

    const bad = await as(adminToken).post(`/api/creative-factory/creatives/${target.id}/file?mode=demo`, { file_url: 'javascript:alert(1)' });
    expect(bad.status).toBe(400);

    const r = await as(creativeToken).post(`/api/creative-factory/creatives/${target.id}/file?mode=demo`, { file_url: 'https://cdn.test/h04.mp4' });
    expect(r.status).toBe(200);
    const after = await byKey('BB-B01-H04-M1-C1');
    expect(after.id).toBe(target.id);
    expect(after.file_url).toBe('https://cdn.test/h04.mp4');
    expect(after.approval_status).toBe('APPROVED');
    expect(after.version).toBe(target.version);
    const count = (await pool.query(`SELECT COUNT(*)::int AS n FROM creatives WHERE is_demo = TRUE AND batch_code = 'BB-B01'`)).rows[0].n;
    expect(count).toBe(before);

    const denied = await as(perfToken).post(`/api/creative-factory/creatives/${target.id}/file?mode=demo`, { file_url: 'https://cdn.test/x.mp4' });
    expect(denied.status).toBe(403);
  });

  it('"Editar" with only a new file link on an approved creative attaches instead of creating V2', async () => {
    const target = await byKey('BB-B01-H05-M1-C1');
    await pool.query(`UPDATE creatives SET approval_status = 'APPROVED', file_url = NULL WHERE id = $1`, [target.id]);
    const r = await as(creativeToken).post(`/api/creative-factory/creatives/${target.id}/revise?mode=demo`, {
      headline: target.headline,
      primary_text: target.primary_text,
      file_url: 'https://cdn.test/h05.png'
    });
    expect(r.status).toBe(200);
    expect(r.body.mode).toBe('FILE_ATTACHED');
    const after = await byKey('BB-B01-H05-M1-C1');
    expect(after.approval_status).toBe('APPROVED');
    expect(after.file_url).toBe('https://cdn.test/h05.png');
    const v2 = await pool.query(`SELECT 1 FROM creatives WHERE human_id = 'BB-B01-H05-M1-C1-V2-DEMO'`);
    expect(v2.rows.length).toBe(0);
  });

  it('bulk attach fills only creatives without a file, is idempotent and ADMIN-only', async () => {
    const denied = await as(creativeToken).post('/api/creative-factory/batches/BB-B01/attach-assets?mode=demo');
    expect(denied.status).toBe(403);

    const r = await as(adminToken).post('/api/creative-factory/batches/BB-B01/attach-assets?mode=demo');
    expect(r.status).toBe(200);
    expect(r.body.attached).toEqual(expect.arrayContaining(['BB-B01-H01-M1-C1', 'BB-B01-H03-M1-C1', 'BB-B01-H05-M2-C1']));
    // H04 and H05-M1 already had a file from the previous tests: kept
    expect(r.body.skipped).toEqual(expect.arrayContaining(['BB-B01-H04-M1-C1', 'BB-B01-H05-M1-C1']));
    expect((await byKey('BB-B01-H04-M1-C1')).file_url).toBe('https://cdn.test/h04.mp4');
    expect((await byKey('BB-B01-H01-M1-C1')).file_url).toBe(CREATIVE_BATCHES['BB-B01'].producedAssets!['BB-B01-H01-M1-C1']);

    const again = await as(adminToken).post('/api/creative-factory/batches/BB-B01/attach-assets?mode=demo');
    expect(again.body.attached).toEqual([]);

    const unknown = await as(adminToken).post('/api/creative-factory/batches/XX-B99/attach-assets?mode=demo');
    expect(unknown.status).toBe(404);
  });

  it('the list exposes the produced file keys and the Creative Lab list returns the attached URL', async () => {
    const list = await as(adminToken).get('/api/creative-factory/creatives?mode=demo&batch=BB-B01&period=all');
    expect(list.body.producedAssets['BB-B01']).toEqual(expect.arrayContaining(FILE_KEYS));

    const lab = await as(adminToken).get('/api/creatives?mode=demo');
    expect(lab.status).toBe(200);
    const h03 = lab.body.creatives.find((c: any) => c.human_id === 'BB-B01-H03-M1-C1-DEMO');
    expect(h03.file_url).toMatch(/^https:\/\//);
  });
});
