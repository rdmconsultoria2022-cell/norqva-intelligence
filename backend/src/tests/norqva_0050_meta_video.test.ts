// NORQVA-0050: trazer o vídeo de um criativo importado da Meta. Meta simulada (só leitura).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { setCreativeGraphReaderForTests } from '../controllers/creativeFactoryController';

describe.sequential('NORQVA-0050 — vídeo do criativo importado da Meta', () => {
  let pool: Pool;
  let admin: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const productId = crypto.randomUUID();
  let withAd = '';
  let noAd = '';
  const adId = `1202${Date.now().toString().slice(-9)}`;
  const calls: string[] = [];

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const u = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.norqva0050@norqva.test', 'Admin 0050', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    admin = signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role: 'ADMIN' });
    await pool.query(`INSERT INTO products (id, human_id, name, category, description, status, is_demo) VALUES ($1, $2, 'P 0050', 'Receitas', 'x', 'PLANEJADO', FALSE)`, [productId, `PRD-V50${tag}`]);
    const mk = async (key: string) =>
      (await pool.query(
        `INSERT INTO creatives (human_id, product_id, hook, concept, copy, primary_text, headline, cta, format, status, is_demo, utm_content_key, approval_status)
         VALUES ($1, $2, 'g', 'Importado da Meta', 't', 't', 'h', 'SEE_DETAILS', 'VIDEO', 'IDEIA', FALSE, $1, 'DRAFT') RETURNING id`,
        [key, productId]
      )).rows[0].id;
    withAd = await mk(`EXT-V50${tag}-A`);
    noAd = await mk(`EXT-V50${tag}-B`);
    await pool.query(`INSERT INTO creative_meta_ads (creative_id, meta_ad_id, link_method) VALUES ($1, $2, 'MANUAL')`, [withAd, adId]);
    setCreativeGraphReaderForTests(() => ({
      readGraph: async (endpoint: string) => {
        calls.push(endpoint);
        if (endpoint === `/${adId}`) return { creative: { object_story_spec: { video_data: { video_id: '998877665544' } } } };
        if (endpoint === '/998877665544') return { source: 'https://video.fbcdn.example/v/t42/abc.mp4?oe=1' };
        throw new Error('inesperado');
      }
    }));
  });

  afterAll(async () => {
    setCreativeGraphReaderForTests(null);
    if (!pool) return;
    await pool.query('DELETE FROM products WHERE id = $1', [productId]).catch(() => {});
  });

  it('traz o link do vídeo do anúncio ligado e anexa ao criativo (sem aprovar)', async () => {
    const r = await request(app).post(`/api/creative-factory/creatives/${withAd}/meta-video?mode=real`).set('Authorization', `Bearer ${admin}`);
    expect(r.status).toBe(200);
    expect(r.body.video_id).toBe('998877665544');
    const c = (await pool.query('SELECT file_url, approval_status FROM creatives WHERE id = $1', [withAd])).rows[0];
    expect(c.file_url).toBe('https://video.fbcdn.example/v/t42/abc.mp4?oe=1');
    expect(c.approval_status).toBe('DRAFT');
    expect(calls).toEqual([`/${adId}`, '/998877665544']);
  });

  it('sem anúncio ligado explica o que fazer', async () => {
    const r = await request(app).post(`/api/creative-factory/creatives/${noAd}/meta-video?mode=real`).set('Authorization', `Bearer ${admin}`);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Ligar anúncio/);
  });
});
