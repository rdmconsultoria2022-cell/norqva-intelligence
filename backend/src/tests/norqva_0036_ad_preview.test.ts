// NORQVA-0036: prévia oficial do anúncio e mais fontes de imagem. A Meta é sempre simulada aqui.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { MetaClient } from '../services/meta/metaClient';
import { clearPreviewCache } from '../controllers/adPreviewController';

describe.sequential('NORQVA-0036 — prévia do anúncio', () => {
  let pool: Pool;
  let token: string;
  const n = String(Date.now()).slice(-9);
  const adId = `9${n}01`;
  const otherAd = `9${n}02`;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const r = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'perf.norqva0036@norqva.test', 'Perf 0036', 'PERFORMANCE', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'PERFORMANCE', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    token = signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role: 'PERFORMANCE' });
    ids.acc = (await pool.query(`INSERT INTO meta_ad_accounts (meta_account_id, name, is_demo) VALUES ($1, 'Conta 0036', false) RETURNING id`, [`act_${n}`])).rows[0].id;
    ids.camp = (await pool.query(
      `INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo) VALUES ($1, $2, 'EXP 0036', 'ACTIVE', 'ACTIVE', false) RETURNING id`,
      [`c${n}`, ids.acc]
    )).rows[0].id;
    ids.set = (await pool.query(
      `INSERT INTO meta_ad_sets (meta_adset_id, campaign_id, name, status, effective_status, is_demo) VALUES ($1, $2, 'Conjunto 0036', 'ACTIVE', 'ACTIVE', false) RETURNING id`,
      [`s${n}`, ids.camp]
    )).rows[0].id;
    await pool.query(
      `INSERT INTO meta_ads (meta_ad_id, adset_id, name, status, effective_status, is_demo) VALUES ($1, $2, 'TR_V1_EMO', 'ACTIVE', 'ACTIVE', false)`,
      [adId, ids.set]
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearPreviewCache();
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM meta_ad_accounts WHERE id = $1', [ids.acc]).catch(() => {});
  });

  const get = (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`);

  it('devolve o endereço da prévia da Meta, o atalho do Gerenciador e guarda em cache', async () => {
    const spy = vi.spyOn(MetaClient.prototype, 'getAdPreview').mockResolvedValue('https://www.facebook.com/ads/api/preview_iframe.php?d=abc&t=1');
    const r = await get(`/api/meta/ads/${adId}/preview?format=INSTAGRAM_STORY`);
    expect(r.status).toBe(200);
    expect(r.body.src).toBe('https://www.facebook.com/ads/api/preview_iframe.php?d=abc&t=1');
    expect(r.body.manager_url).toBe(`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${n}&selected_ad_ids=${adId}`);
    expect(spy).toHaveBeenCalledWith(adId, 'INSTAGRAM_STORY');
    const again = await get(`/api/meta/ads/${adId}/preview?format=INSTAGRAM_STORY`);
    expect(again.body.cached).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('recusa formato inválido, id inválido e anúncio que não é da conta', async () => {
    const spy = vi.spyOn(MetaClient.prototype, 'getAdPreview').mockResolvedValue('https://www.facebook.com/x');
    expect((await get(`/api/meta/ads/${adId}/preview?format=DESKTOP_RIGHT_COLUMN`)).status).toBe(400);
    expect((await get(`/api/meta/ads/abc/preview`)).status).toBe(400);
    expect((await get(`/api/meta/ads/${otherAd}/preview`)).status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
    expect((await request(app).get(`/api/meta/ads/${adId}/preview`)).status).toBe(401);
  });

  it('se a Meta falhar, responde com aviso (sem quebrar a tela)', async () => {
    vi.spyOn(MetaClient.prototype, 'getAdPreview').mockRejectedValue(new Error('[META API ERROR 100]: x'));
    const r = await get(`/api/meta/ads/${adId}/preview?format=MOBILE_FEED_STANDARD`);
    expect(r.status).toBe(200);
    expect(r.body.src).toBeNull();
    expect(r.body.error).toMatch(/não gerou a prévia/);
  });

  it('a lista de criativos leva a situação do conjunto e da campanha', async () => {
    const r = await get('/api/creative-factory/creatives?mode=real');
    expect(r.status).toBe(200);
    const camp = (r.body.campaigns || []).find((c: any) => c.meta_campaign_id === `c${n}`);
    const ad = camp.ads.find((a: any) => a.meta_ad_id === adId);
    expect(ad).toMatchObject({ adset_effective_status: 'ACTIVE', campaign_effective_status: 'ACTIVE' });
  });
});

describe('NORQVA-0036 — fontes de imagem do criativo', () => {
  it('carrossel, criativo dinâmico e vídeo do asset_feed_spec', () => {
    expect(MetaClient.creativeContent({ object_story_spec: { link_data: { child_attachments: [{ picture: 'https://x/1.jpg' }] } } }).image_url).toBe('https://x/1.jpg');
    expect(MetaClient.creativeContent({ asset_feed_spec: { images: [{ url: 'https://x/d.jpg' }] } }).image_url).toBe('https://x/d.jpg');
    expect(MetaClient.creativeContent({ asset_feed_spec: { videos: [{ thumbnail_url: 'https://x/v.jpg' }] } }).thumbnail_url).toBe('https://x/v.jpg');
    expect(MetaClient.creativeContent({ image_url: 'https://x/a.jpg', object_story_spec: { link_data: { picture: 'https://x/b.jpg' } } }).image_url).toBe('https://x/a.jpg');
  });

  it('getAdPreview só aceita iframe da Meta', async () => {
    const c = new MetaClient();
    const spy = vi.spyOn(c as any, 'fetchGraphApi');
    spy.mockResolvedValueOnce({ data: [{ body: '<iframe src="https://www.facebook.com/ads/api/preview_iframe.php?d=1&amp;t=2" width="320"></iframe>' }] });
    expect(await c.getAdPreview('123', 'INSTAGRAM_STANDARD')).toBe('https://www.facebook.com/ads/api/preview_iframe.php?d=1&t=2');
    spy.mockResolvedValueOnce({ data: [{ body: '<iframe src="https://evil.example.com/x"></iframe>' }] });
    expect(await c.getAdPreview('123', 'INSTAGRAM_STANDARD')).toBeNull();
    spy.mockResolvedValueOnce({ data: [] });
    expect(await c.getAdPreview('123', 'INSTAGRAM_STANDARD')).toBeNull();
    vi.restoreAllMocks();
  });
});
