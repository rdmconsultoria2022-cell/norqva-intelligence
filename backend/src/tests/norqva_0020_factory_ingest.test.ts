import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import {
  setFactoryStorageVerifierForTests,
  factoryStoragePath,
  FACTORY_RELEASE_SCHEMA
} from '../services/creative/factoryIngestService';

// NORQVA-0020: ponte Creative Factory → NORQVA. Release certificado entra como criativo DRAFT,
// com a certificação guardada como evidência. Tudo em modo demo.
describe('NORQVA-0020 — Creative Factory → NORQVA (ingest)', () => {
  let pool: Pool;
  let adminToken: string;
  const AUTOMATION = 'test-automation-token-0020-abcdefghijklmnop';
  const ENV = ['NORQVA_AUTOMATION_TOKEN', 'SUPABASE_URL'] as const;
  const backup: Record<string, string | undefined> = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
  const productId = crypto.randomUUID();
  const otherProductId = crypto.randomUUID();
  const offerHumanId = `OFF-CF-0020-${Date.now().toString(36).toUpperCase()}`;
  const storage = new Map<string, number>(); // public URL -> bytes "uploaded"

  const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
  const release = (over: Record<string, any> = {}) => {
    const sha256 = over.sha256 || sha('video-v5');
    const campaign = over.campaign_id || 'cf-test-0020';
    const version = over.creative_version || 'V5';
    const { sha256: _s, ...rest } = over;
    return {
      schema: FACTORY_RELEASE_SCHEMA,
      campaign_id: campaign,
      creative_version: version,
      factory_version: '1.0.1',
      certified: true,
      approval_timestamp: '2026-09-19T22:33:22Z',
      offer_human_id: offerHumanId,
      media: { sha256, size_bytes: 21461148, mime: 'video/mp4', duration_seconds: 24, resolution: '1080x1920', aspect_ratio: '9:16' },
      storage: { bucket: 'creative-assets', path: factoryStoragePath(campaign, version, sha256, 'video/mp4') },
      copy: { hook: 'Seu salário evapora antes do fim do mês?', script: 'Hook. Problema. Solução. CTA.', cta: 'Toque no link abaixo.' },
      claim_codes: ['CF20-CL-01'],
      qa_certifications: { TECHNICAL_QA: 'PASS', HUMAN_VISUAL_QA: 'APPROVED' },
      lineage: { GEN1_TASK_ID: 'abc' },
      ...rest
    };
  };
  const upload = (body: any) => storage.set(`https://test.supabase.co/storage/v1/object/public/creative-assets/${body.storage.path}`, body.media.size_bytes);
  const ingest = (body: any, token = AUTOMATION) =>
    request(app).post('/api/automation/creative-factory/ingest?mode=demo').set('X-Norqva-Automation-Token', token).send(body);

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    process.env.NORQVA_AUTOMATION_TOKEN = AUTOMATION;
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    setFactoryStorageVerifierForTests(async (url, bytes) =>
      storage.get(url) === bytes ? { ok: true, detail: 'ok' } : { ok: false, detail: 'objeto ausente' }
    );
    const u = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'admin.norqva0020@norqva.test', 'Admin 0020', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`
    );
    adminToken = signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role: 'ADMIN' });
    for (const [id, hid] of [[productId, `PRD-CF20-${productId.slice(0, 6)}`], [otherProductId, `PRD-CF20-${otherProductId.slice(0, 6)}`]]) {
      await pool.query(
        `INSERT INTO products (id, human_id, name, category, description, status) VALUES ($1, $2, 'Produto 0020', 'Teste', 'Fixture', 'PLANEJADO')`,
        [id, hid]
      );
    }
    await pool.query(
      `INSERT INTO offers (id, human_id, product_id, name, price, description, status) VALUES (gen_random_uuid(), $1, $2, 'Oferta 0020', 29.90, 'Fixture', 'RASCUNHO')`,
      [offerHumanId, productId]
    );
    const claim = (code: string, prod: string, status: string) =>
      pool.query(
        `INSERT INTO claims_registry (human_id, product_id, claim_text, claim_type, source, status, is_demo)
         VALUES ($1, $2, 'Claim 0020', 'FEATURE', 'Teste', $3, TRUE) ON CONFLICT (human_id) DO NOTHING`,
        [`${code}-DEMO`, prod, status]
      );
    await claim('CF20-CL-01', productId, 'UNVERIFIED');
    await claim('CF20-CL-REJ', productId, 'REJECTED');
    await claim('CF20-CL-OTHER', otherProductId, 'UNVERIFIED');
  });

  afterAll(() => {
    setFactoryStorageVerifierForTests(null);
    for (const k of ENV) {
      if (backup[k] === undefined) delete process.env[k];
      else process.env[k] = backup[k];
    }
  });

  it('exige o token de automação', async () => {
    expect((await ingest(release(), '')).status).toBe(401);
    expect((await ingest(release(), 'errado')).status).toBe(401);
  });

  it('recusa release não certificado, sem claims ou fora do padrão de Storage', async () => {
    expect((await ingest(release({ certified: false }))).status).toBe(422);
    expect((await ingest(release({ claim_codes: [] }))).status).toBe(422);
    expect((await ingest(release({ qa_certifications: {} }))).status).toBe(422);
    const b = release();
    expect((await ingest({ ...b, storage: { bucket: 'creative-assets', path: 'outro/lugar.mp4' } })).status).toBe(422);
    expect((await ingest(release({ campaign_id: 'Campanha Com Espaço' }))).status).toBe(422);
  });

  it('recusa oferta inexistente e claims ausentes, rejeitadas ou de outro produto', async () => {
    const b = release();
    upload(b);
    expect((await ingest({ ...b, offer_human_id: 'OFF-NAO-EXISTE' })).status).toBe(422);
    const missing = await ingest({ ...b, claim_codes: ['CF20-CL-NOPE'] });
    expect(missing.status).toBe(422);
    expect(missing.body.error).toContain('CF20-CL-NOPE');
    expect((await ingest({ ...b, claim_codes: ['CF20-CL-REJ'] })).status).toBe(422);
    expect((await ingest({ ...b, claim_codes: ['CF20-CL-OTHER'] })).status).toBe(422);
  });

  it('recusa quando o arquivo não está no Storage', async () => {
    const r = await ingest(release({ campaign_id: 'cf-test-0020-nofile', sha256: sha('sem-upload') }));
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('Storage');
  });

  it('release certificado entra como DRAFT no lote da campanha, com evidência, e aparece na Fábrica', async () => {
    const b = release();
    upload(b);
    const r = await ingest(b);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'INGESTED', human_id: 'CF-cf-test-0020-V5-DEMO', batch_code: 'CF-cf-test-0020', approval_status: 'DRAFT' });

    const c = await pool.query('SELECT * FROM creatives WHERE id = $1', [r.body.creative_id]);
    expect(c.rows[0].approval_status).toBe('DRAFT');
    expect(c.rows[0].generation_source).toBe('FACTORY');
    expect(c.rows[0].format).toBe('VIDEO');
    expect(c.rows[0].file_url).toBe(`https://test.supabase.co/storage/v1/object/public/creative-assets/${b.storage.path}`);

    const batch = await pool.query(`SELECT source, imported_at FROM creative_batches WHERE code = 'CF-cf-test-0020' AND is_demo = TRUE`);
    expect(batch.rows[0].source).toBe('FACTORY');
    expect(batch.rows[0].imported_at).not.toBeNull();

    const list = await request(app)
      .get('/api/creative-factory/creatives?mode=demo&batch=CF-cf-test-0020&period=all')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    const item = list.body.creatives.find((x: any) => x.id === r.body.creative_id);
    expect(item.factory_release).toMatchObject({ campaign_id: 'cf-test-0020', creative_version: 'V5', sha256: b.media.sha256 });
    expect(item.claims.map((cl: any) => cl.human_id)).toEqual(['CF20-CL-01-DEMO']);
    expect(item.claims_all_verified).toBe(false);
  });

  it('é idempotente; o mesmo release com outro arquivo ou o mesmo arquivo com outra chave é recusado', async () => {
    const again = await ingest(release());
    expect(again.status).toBe(200);
    expect(again.body.status).toBe('ALREADY_INGESTED');
    const count = await pool.query(`SELECT COUNT(*)::int AS n FROM creatives WHERE human_id = 'CF-cf-test-0020-V5-DEMO'`);
    expect(count.rows[0].n).toBe(1);

    const changed = release({ sha256: sha('outro-video') });
    upload(changed);
    expect((await ingest(changed)).status).toBe(409);

    const dup = release({ creative_version: 'V6' });
    upload(dup);
    expect((await ingest(dup)).status).toBe(409);
  });

  it('segunda versão da mesma campanha entra no mesmo lote; a aprovação continua exigindo claims verificadas', async () => {
    const v6 = release({ creative_version: 'V6', sha256: sha('video-v6') });
    upload(v6);
    const r = await ingest(v6);
    expect(r.status).toBe(201);
    const batch = await pool.query(`SELECT payload FROM creative_batches WHERE code = 'CF-cf-test-0020' AND is_demo = TRUE`);
    expect(batch.rows[0].payload.creatives.map((x: any) => x.key).sort()).toEqual(['CF-cf-test-0020-V5', 'CF-cf-test-0020-V6']);

    const approve = await request(app)
      .post(`/api/creative-factory/creatives/${r.body.creative_id}/review?mode=demo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVED' });
    expect(approve.status).toBe(409);
    const still = await pool.query('SELECT approval_status FROM creatives WHERE id = $1', [r.body.creative_id]);
    expect(still.rows[0].approval_status).toBe('DRAFT');
  });

  it('upload-url: valida a entrada e não precisa reenviar arquivo já presente', async () => {
    const bad = await request(app)
      .post('/api/automation/creative-factory/upload-url')
      .set('X-Norqva-Automation-Token', AUTOMATION)
      .send({ campaign_id: 'cf-test-0020', creative_version: 'V5', sha256: 'xyz', size_bytes: 10, mime: 'video/mp4' });
    expect(bad.status).toBe(422);
    const big = await request(app)
      .post('/api/automation/creative-factory/upload-url')
      .set('X-Norqva-Automation-Token', AUTOMATION)
      .send({ campaign_id: 'cf-test-0020', creative_version: 'V9', sha256: sha('big'), size_bytes: 60 * 1024 * 1024, mime: 'video/mp4' });
    expect(big.status).toBe(413);
    const b = release();
    const present = await request(app)
      .post('/api/automation/creative-factory/upload-url')
      .set('X-Norqva-Automation-Token', AUTOMATION)
      .send({ campaign_id: 'cf-test-0020', creative_version: 'V5', sha256: b.media.sha256, size_bytes: b.media.size_bytes, mime: 'video/mp4' });
    expect(present.status).toBe(200);
    expect(present.body).toMatchObject({ already_uploaded: true, upload_url: null, path: b.storage.path });
    // The file of an ingested release is never re-signed (would allow replacing certified bytes)
    const replace = await request(app)
      .post('/api/automation/creative-factory/upload-url')
      .set('X-Norqva-Automation-Token', AUTOMATION)
      .send({ campaign_id: 'cf-test-0020', creative_version: 'V5', sha256: b.media.sha256, size_bytes: b.media.size_bytes + 1, mime: 'video/mp4' });
    expect(replace.status).toBe(409);
  });

  it('recusa CTA acima de 100 caracteres e duração inválida sem gravar nada', async () => {
    const b = release({ campaign_id: 'cf-test-0020-val', sha256: sha('val') });
    upload(b);
    expect((await ingest({ ...b, copy: { ...b.copy, cta: 'x'.repeat(101) } })).status).toBe(422);
    expect((await ingest({ ...b, media: { ...b.media, duration_seconds: 'abc' } })).status).toBe(422);
    const batch = await pool.query(`SELECT 1 FROM creative_batches WHERE code = 'CF-cf-test-0020-val'`);
    expect(batch.rows).toHaveLength(0);
  });
});
