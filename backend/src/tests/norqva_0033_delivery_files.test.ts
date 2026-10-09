// NORQVA-0033: PDF entregue ao comprador trocado pela tela, com cópia de segurança antes de trocar.
// O armazenamento é sempre simulado aqui: nenhum teste fala com o Supabase (nem com Meta/Asaas).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import {
  setStorageClient,
  StorageClient,
  validatePdf,
  newAssetPath,
  versionPathFor,
  cleanFileName,
  MAX_PDF_BYTES,
  supabaseStorage
} from '../services/delivery/deliveryFileService';

const pdf = (label: string) => Buffer.from(`%PDF-1.7\n% ${label}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n`, 'latin1');

class FakeStorage implements StorageClient {
  files = new Map<string, Buffer>();
  uploads: Array<{ key: string; upsert: boolean }> = [];
  failUploadTo: RegExp | null = null;
  corruptBackup = false;
  async download(bucket: string, path: string) {
    return this.files.get(`${bucket}/${path}`) || null;
  }
  async upload(bucket: string, path: string, data: Buffer, opts: { upsert: boolean }) {
    const key = `${bucket}/${path}`;
    if (this.failUploadTo && this.failUploadTo.test(path)) throw new Error('falha simulada de envio');
    if (!opts.upsert && this.files.has(key)) throw new Error('já existe');
    this.uploads.push({ key, upsert: opts.upsert });
    this.files.set(key, this.corruptBackup && path.startsWith('_versoes/') ? Buffer.from('x') : Buffer.from(data));
  }
}

describe.sequential('NORQVA-0033 — arquivo de entrega pela tela', () => {
  let pool: Pool;
  let adminToken: string;
  let perfToken: string;
  let fake: FakeStorage;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const productId = crypto.randomUUID();
  const offerWith = crypto.randomUUID();
  const offerNew = crypto.randomUUID();
  const assetId = crypto.randomUUID();
  const PATH = `books/0033-${tag}.pdf`;
  const KEY = `digital-products/${PATH}`;
  const OLD = pdf('versao antiga');
  const NEW = pdf('versao nova de 39 paginas');

  const as = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    put: (url: string) => request(app).put(url).set('Authorization', `Bearer ${token}`)
  });
  const sendPdf = (r: request.Test, buf: Buffer, name = 'TRATTORIA_FINAL_4.pdf') =>
    r.set('Content-Type', 'application/pdf').set('x-file-name', encodeURIComponent(name)).send(buf);

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
    adminToken = await mk('admin.norqva0033@norqva.test', 'ADMIN');
    perfToken = await mk('perf.norqva0033@norqva.test', 'PERFORMANCE');
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo) VALUES ($1, $2, 'Trattoria 0033', 'Receitas', 'Fixture', 'PLANEJADO', true)`,
      [productId, `PRD-${tag}`]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, 'Trattoria 0033', $3, 19.9, 'ATIVA', 'Fixture', true)`,
      [offerWith, `OFF-T${tag}`, productId]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, 'Dolci della Nonna', $3, 14.9, 'TESTE', 'Fixture', true)`,
      [offerNew, `OFF-D${tag}`, productId]
    );
    await pool.query(
      `INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo) VALUES ($1, 'Trattoria PDF 0033', 'SUPABASE', 'digital-products', $2, true)`,
      [assetId, PATH]
    );
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [offerWith, assetId]);
  });

  beforeEach(() => {
    fake = new FakeStorage();
    fake.files.set(KEY, OLD);
    setStorageClient(fake);
  });

  afterAll(async () => {
    setStorageClient(null);
    if (!pool) return;
    const q = (sql: string, p: any[]) => pool.query(sql, p).catch(() => {});
    const created = await pool.query('SELECT asset_id FROM offer_digital_assets WHERE offer_id = $1', [offerNew]).catch(() => ({ rows: [] as any[] }));
    const ids = [assetId, ...created.rows.map((r: any) => r.asset_id)];
    await q('DELETE FROM offer_digital_assets WHERE offer_id = ANY($1::uuid[])', [[offerWith, offerNew]]);
    await q('DELETE FROM digital_asset_versions WHERE asset_id = ANY($1::uuid[])', [ids]);
    await q('DELETE FROM digital_assets WHERE id = ANY($1::uuid[])', [ids]);
    await q('DELETE FROM offers WHERE id = ANY($1::uuid[])', [[offerWith, offerNew]]);
    await q('DELETE FROM products WHERE id = $1', [productId]);
  });

  it('só ADMIN vê, troca, volta versão ou envia', async () => {
    expect((await as(perfToken).get(`/api/offers/${offerWith}/delivery-files`)).status).toBe(403);
    expect((await sendPdf(as(perfToken).put(`/api/digital-assets/${assetId}/file`), NEW)).status).toBe(403);
    expect((await sendPdf(as(perfToken).post(`/api/offers/${offerNew}/delivery-files`), NEW)).status).toBe(403);
    expect((await as(perfToken).get(`/api/digital-assets/${assetId}/check-link`)).status).toBe(403);
    expect((await request(app).put(`/api/digital-assets/${assetId}/file`).set('Content-Type', 'application/pdf').send(NEW)).status).toBe(401);
    expect(fake.uploads).toHaveLength(0);
    expect(fake.files.get(KEY)!.equals(OLD)).toBe(true);
  });

  it('mostra o arquivo que a oferta entrega', async () => {
    const r = await as(adminToken).get(`/api/offers/${offerWith}/delivery-files`);
    expect(r.status).toBe(200);
    expect(r.body.assets).toHaveLength(1);
    expect(r.body.assets[0]).toMatchObject({ id: assetId, storage_bucket: 'digital-products', storage_path: PATH, versions: [], also_used_by: [] });
    const empty = await as(adminToken).get(`/api/offers/${offerNew}/delivery-files`);
    expect(empty.body.assets).toEqual([]);
  });

  it('recusa o que não é PDF e não mexe em nada', async () => {
    const notPdf = await sendPdf(as(adminToken).put(`/api/digital-assets/${assetId}/file`), Buffer.from('<html>oi</html>'));
    expect(notPdf.status).toBe(400);
    expect(notPdf.body.error).toMatch(/não é um PDF válido/);
    const cut = await sendPdf(as(adminToken).put(`/api/digital-assets/${assetId}/file`), NEW.subarray(0, 20));
    expect(cut.status).toBe(400);
    const json = await as(adminToken).put(`/api/digital-assets/${assetId}/file`).send({ file: 'x' });
    expect(json.status).toBe(400);
    expect(fake.uploads).toHaveLength(0);
    expect(fake.files.get(KEY)!.equals(OLD)).toBe(true);
  });

  it('troca: guarda o antigo em _versoes, põe o novo no mesmo endereço e registra', async () => {
    const r = await sendPdf(as(adminToken).put(`/api/digital-assets/${assetId}/file`), NEW, 'TRATTORIA_EM_CASA_PREMIUM_FINAL_4.pdf');
    expect(r.status).toBe(200);
    expect(r.body.backup_path).toMatch(new RegExp(`^_versoes/books/0033-${tag}__\\d{8}-\\d{6}-[0-9a-f]{8}\\.pdf$`));
    expect(fake.files.get(KEY)!.equals(NEW)).toBe(true);
    expect(fake.files.get(`digital-products/${r.body.backup_path}`)!.equals(OLD)).toBe(true);
    // a cópia vai antes, sem sobrescrever nada; o novo vai com upsert no mesmo endereço
    expect(fake.uploads.map(u => [u.key.startsWith('digital-products/_versoes/'), u.upsert])).toEqual([
      [true, false],
      [false, true]
    ]);
    const a = (await pool.query('SELECT * FROM digital_assets WHERE id = $1', [assetId])).rows[0];
    expect(a.storage_path).toBe(PATH);
    expect(Number(a.file_size_bytes)).toBe(NEW.length);
    expect(a.file_sha256).toBe(crypto.createHash('sha256').update(NEW).digest('hex'));
    expect(a.file_original_name).toBe('TRATTORIA_EM_CASA_PREMIUM_FINAL_4.pdf');
    // o vínculo com a oferta não muda: quem já comprou recebe o novo pelo mesmo endereço
    const link = await pool.query('SELECT asset_id FROM offer_digital_assets WHERE offer_id = $1', [offerWith]);
    expect(link.rows.map((x: any) => x.asset_id)).toEqual([assetId]);
    const v = await pool.query('SELECT * FROM digital_asset_versions WHERE asset_id = $1', [assetId]);
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0].sha256).toBe(crypto.createHash('sha256').update(OLD).digest('hex'));
    const audit = await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'DELIVERY_FILE_REPLACED' AND description LIKE $1`, [`%${PATH}%`]);
    expect(audit.rows.length).toBeGreaterThan(0);
    const view = await as(adminToken).get(`/api/offers/${offerWith}/delivery-files`);
    expect(view.body.assets[0].versions).toHaveLength(1);
    expect(view.body.assets[0].file_original_name).toBe('TRATTORIA_EM_CASA_PREMIUM_FINAL_4.pdf');
  });

  it('mesmo arquivo que já está lá: recusa sem criar versão', async () => {
    fake.files.set(KEY, NEW);
    const before = (await pool.query('SELECT count(*)::int AS n FROM digital_asset_versions WHERE asset_id = $1', [assetId])).rows[0].n;
    const r = await sendPdf(as(adminToken).put(`/api/digital-assets/${assetId}/file`), NEW);
    expect(r.status).toBe(409);
    expect(fake.uploads).toHaveLength(0);
    const after = (await pool.query('SELECT count(*)::int AS n FROM digital_asset_versions WHERE asset_id = $1', [assetId])).rows[0].n;
    expect(after).toBe(before);
  });

  it('se a cópia de segurança falha ou não confere, nada é trocado', async () => {
    const before = (await pool.query('SELECT count(*)::int AS n FROM digital_asset_versions WHERE asset_id = $1', [assetId])).rows[0].n;
    fake.failUploadTo = /^_versoes\//;
    const r1 = await sendPdf(as(adminToken).put(`/api/digital-assets/${assetId}/file`), pdf('outra'));
    expect(r1.status).toBe(500);
    expect(fake.files.get(KEY)!.equals(OLD)).toBe(true);

    fake.failUploadTo = null;
    fake.corruptBackup = true;
    const r2 = await sendPdf(as(adminToken).put(`/api/digital-assets/${assetId}/file`), pdf('outra'));
    expect(r2.status).toBe(502);
    expect(r2.body.error).toMatch(/cópia de segurança não conferiu/);
    expect(fake.files.get(KEY)!.equals(OLD)).toBe(true);
    const after = (await pool.query('SELECT count(*)::int AS n FROM digital_asset_versions WHERE asset_id = $1', [assetId])).rows[0].n;
    expect(after).toBe(before);
  });

  it('volta para uma versão guardada (e guarda a que sai)', async () => {
    // estado: no endereço está o NEW (troca anterior); a versão guardada é o OLD
    const v = (await pool.query('SELECT * FROM digital_asset_versions WHERE asset_id = $1 ORDER BY replaced_at ASC LIMIT 1', [assetId])).rows[0];
    fake.files.set(KEY, NEW);
    fake.files.set(`digital-products/${v.storage_path}`, OLD);
    const r = await as(adminToken).post(`/api/digital-assets/${assetId}/versions/${v.id}/restore`);
    expect(r.status).toBe(200);
    expect(fake.files.get(KEY)!.equals(OLD)).toBe(true);
    expect(fake.files.get(`digital-products/${r.body.backup_path}`)!.equals(NEW)).toBe(true);
    const n = (await pool.query('SELECT count(*)::int AS n FROM digital_asset_versions WHERE asset_id = $1', [assetId])).rows[0].n;
    expect(n).toBe(2);

    const gone = crypto.randomUUID();
    expect((await as(adminToken).post(`/api/digital-assets/${assetId}/versions/${gone}/restore`)).status).toBe(404);
  });

  it('oferta sem arquivo: envia, cria o registro e liga; a segunda vez pede "Trocar arquivo"', async () => {
    const dolci = pdf('Dolci della Nonna');
    const r = await sendPdf(as(adminToken).post(`/api/offers/${offerNew}/delivery-files`), dolci, 'DOLCI_DELLA_NONNA.pdf');
    expect(r.status).toBe(201);
    expect(r.body.storage_path).toBe(`DOLCI_DELLA_NONNA_OFF-D${tag}.pdf`);
    expect(fake.files.get(`${r.body.storage_bucket}/${r.body.storage_path}`)!.equals(dolci)).toBe(true);
    expect(fake.uploads[0].upsert).toBe(false);
    const view = await as(adminToken).get(`/api/offers/${offerNew}/delivery-files`);
    expect(view.body.assets).toHaveLength(1);
    expect(view.body.assets[0]).toMatchObject({ id: r.body.asset_id, is_demo: true, file_original_name: 'DOLCI_DELLA_NONNA.pdf' });

    const again = await sendPdf(as(adminToken).post(`/api/offers/${offerNew}/delivery-files`), pdf('outro'));
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/Trocar arquivo/);
  });

  it('não sobrescreve um arquivo que já existe no armazenamento com o mesmo nome', async () => {
    const otherOffer = crypto.randomUUID();
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, 'Extra', $3, 9.9, 'TESTE', 'Fixture', true)`,
      [otherOffer, `OFF-X${tag}`, productId]
    );
    try {
      const target = newAssetPath('Extra', `OFF-X${tag}`);
      // o balde escolhido é o do arquivo mais recente do ambiente
      const bucket = (await pool.query(`SELECT storage_bucket FROM digital_assets WHERE storage_provider = 'SUPABASE' AND is_demo = true ORDER BY created_at DESC LIMIT 1`)).rows[0].storage_bucket;
      fake.files.set(`${bucket}/${target}`, OLD);
      const r = await sendPdf(as(adminToken).post(`/api/offers/${otherOffer}/delivery-files`), pdf('extra'));
      expect(r.status).toBe(409);
      expect(fake.files.get(`${bucket}/${target}`)!.equals(OLD)).toBe(true);
      const link = await pool.query('SELECT 1 FROM offer_digital_assets WHERE offer_id = $1', [otherOffer]);
      expect(link.rows).toHaveLength(0);
    } finally {
      await pool.query('DELETE FROM offers WHERE id = $1', [otherOffer]).catch(() => {});
    }
  });

  it('link de conferência usa o mesmo endereço', async () => {
    const r = await as(adminToken).get(`/api/digital-assets/${assetId}/check-link`);
    expect(r.status).toBe(200);
    expect(r.body.url).toContain(PATH);
  });
});

describe('NORQVA-0033 — regras puras', () => {
  it('valida PDF, tamanho, nomes e endereços', () => {
    expect(() => validatePdf(Buffer.alloc(0))).toThrow(/Nenhum arquivo/);
    expect(() => validatePdf(Buffer.from('%PDF-1.4 sem fim'))).toThrow(/não é um PDF válido/);
    expect(validatePdf(pdf('ok')).length).toBeGreaterThan(0);
    const big = Buffer.alloc(MAX_PDF_BYTES + 1);
    expect(() => validatePdf(big)).toThrow(/50 MB/);
    expect(newAssetPath('Dolci della Nonna', 'OFF-000012')).toBe('DOLCI_DELLA_NONNA_OFF-000012.pdf');
    expect(newAssetPath('Pão & Café', '')).toBe('PAO_CAFE.pdf');
    expect(versionPathFor('/TRATTORIA.pdf', new Date('2026-10-09T04:12:30Z'), 'abcdef0123456789')).toBe('_versoes/TRATTORIA__20261009-041230-abcdef01.pdf');
    expect(cleanFileName(encodeURIComponent('../a/b.pdf'))).toBe('.._a_b.pdf');
    expect(cleanFileName(undefined)).toBeNull();
  });

  it('o cliente real do armazenamento fica desligado nos testes', async () => {
    await expect(supabaseStorage.download('b', 'p')).rejects.toThrow('STORAGE_DISABLED_IN_TESTS');
    await expect(supabaseStorage.upload('b', 'p', Buffer.from('x'), { upsert: true })).rejects.toThrow('STORAGE_DISABLED_IN_TESTS');
  });
});
