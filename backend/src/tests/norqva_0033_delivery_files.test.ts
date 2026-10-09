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
  newAssetBase,
  versionedPath,
  cleanStoragePath,
  cleanFileName,
  MAX_PDF_BYTES,
  supabaseStorage
} from '../services/delivery/deliveryFileService';

const pdf = (label: string) => Buffer.from(`%PDF-1.7\n% ${label}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n`, 'latin1');

class FakeStorage implements StorageClient {
  files = new Map<string, Buffer>();
  uploads: string[] = [];
  failUpload = false;
  hideAfterUpload = false;
  async exists(bucket: string, path: string) {
    return this.files.has(`${bucket}/${path}`);
  }
  async upload(bucket: string, path: string, data: Buffer) {
    const key = `${bucket}/${path}`;
    if (this.failUpload) throw new Error('falha simulada de envio');
    if (this.files.has(key)) throw new Error('já existe');
    this.uploads.push(key);
    if (!this.hideAfterUpload) this.files.set(key, Buffer.from(data));
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
  const KEY = `digital-products/${PATH}`; // onde o arquivo antigo está de verdade
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
      [assetId, `digital-products/${PATH}`] // cadastro antigo com o bucket repetido (a entrega limpa isso)
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

  const vCount = async () => (await pool.query('SELECT count(*)::int AS n FROM digital_asset_versions WHERE asset_id = $1', [assetId])).rows[0].n;
  const assetRow = async () => (await pool.query('SELECT * FROM digital_assets WHERE id = $1', [assetId])).rows[0];

  it('só ADMIN vê, troca, volta versão ou envia', async () => {
    expect((await as(perfToken).get(`/api/offers/${offerWith}/delivery-files`)).status).toBe(403);
    expect((await sendPdf(as(perfToken).put(`/api/digital-assets/${assetId}/file`), NEW)).status).toBe(403);
    expect((await sendPdf(as(perfToken).post(`/api/offers/${offerNew}/delivery-files`), NEW)).status).toBe(403);
    expect((await as(perfToken).get(`/api/digital-assets/${assetId}/check-link`)).status).toBe(403);
    expect((await request(app).put(`/api/digital-assets/${assetId}/file`).set('Content-Type', 'application/pdf').send(NEW)).status).toBe(401);
    expect(fake.uploads).toHaveLength(0);
    expect((await assetRow()).storage_path).toBe(`digital-products/${PATH}`);
  });

  it('mostra o arquivo que a oferta entrega', async () => {
    const r = await as(adminToken).get(`/api/offers/${offerWith}/delivery-files`);
    expect(r.status).toBe(200);
    expect(r.body.assets).toHaveLength(1);
    expect(r.body.assets[0]).toMatchObject({ id: assetId, storage_bucket: 'digital-products', versions: [], also_used_by: [], file_size_bytes: null });
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
    expect(await vCount()).toBe(0);
  });

  it('se o envio falha ou o arquivo não aparece, o cadastro não muda', async () => {
    fake.failUpload = true;
    const r1 = await sendPdf(as(adminToken).put(`/api/digital-assets/${assetId}/file`), NEW);
    expect(r1.status).toBe(500);
    expect(r1.body.error).toMatch(/Nada foi trocado/);
    fake.failUpload = false;
    fake.hideAfterUpload = true;
    const r2 = await sendPdf(as(adminToken).put(`/api/digital-assets/${assetId}/file`), NEW);
    expect(r2.status).toBe(502);
    const a = await assetRow();
    expect(a.storage_path).toBe(`digital-products/${PATH}`);
    expect(a.file_sha256).toBeNull();
    expect(await vCount()).toBe(0);
  });

  it('troca: PDF novo em endereço novo (limpo), cadastro aponta para ele e o antigo vai para o histórico', async () => {
    const r = await sendPdf(as(adminToken).put(`/api/digital-assets/${assetId}/file`), NEW, 'TRATTORIA_EM_CASA_PREMIUM_FINAL_4.pdf');
    expect(r.status).toBe(200);
    // o cadastro antigo tinha o bucket repetido no endereço: o novo sai limpo, no mesmo lugar
    expect(r.body.storage_path).toMatch(new RegExp(`^books/0033-${tag}__\\d{8}-\\d{6}-[0-9a-f]{8}\\.pdf$`));
    expect(fake.uploads).toEqual([`digital-products/${r.body.storage_path}`]);
    expect(fake.files.get(`digital-products/${r.body.storage_path}`)!.equals(NEW)).toBe(true);
    expect(fake.files.get(KEY)!.equals(OLD)).toBe(true); // o antigo segue intacto
    const a = await assetRow();
    expect(a.storage_path).toBe(r.body.storage_path);
    expect(Number(a.file_size_bytes)).toBe(NEW.length);
    expect(a.file_sha256).toBe(crypto.createHash('sha256').update(NEW).digest('hex'));
    expect(a.file_original_name).toBe('TRATTORIA_EM_CASA_PREMIUM_FINAL_4.pdf');
    // o vínculo com a oferta não muda: quem já comprou recebe o novo, porque o link sai do cadastro na hora
    const link = await pool.query('SELECT asset_id FROM offer_digital_assets WHERE offer_id = $1', [offerWith]);
    expect(link.rows.map((x: any) => x.asset_id)).toEqual([assetId]);
    const v = (await pool.query('SELECT * FROM digital_asset_versions WHERE asset_id = $1', [assetId])).rows;
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ storage_bucket: 'digital-products', storage_path: `digital-products/${PATH}`, sha256: null });
    const audit = await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'DELIVERY_FILE_REPLACED' AND description LIKE $1`, [`%${r.body.storage_path}%`]);
    expect(audit.rows.length).toBe(1);
    const view = await as(adminToken).get(`/api/offers/${offerWith}/delivery-files`);
    expect(view.body.assets[0].versions).toHaveLength(1);
    expect(view.body.assets[0].file_original_name).toBe('TRATTORIA_EM_CASA_PREMIUM_FINAL_4.pdf');
  });

  it('mesmo arquivo que já está sendo entregue: recusa sem enviar', async () => {
    const r = await sendPdf(as(adminToken).put(`/api/digital-assets/${assetId}/file`), NEW);
    expect(r.status).toBe(409);
    expect(fake.uploads).toHaveLength(0);
    expect(await vCount()).toBe(1);
  });

  it('outra troca no meio do envio: recusa e não grava histórico', async () => {
    const before = await assetRow();
    // simula outra troca terminando enquanto este envio estava em andamento
    const realUpload = fake.upload.bind(fake);
    fake.upload = async (bucket: string, path: string, data: Buffer) => {
      await realUpload(bucket, path, data);
      await pool.query('UPDATE digital_assets SET storage_path = $1 WHERE id = $2', [`${before.storage_path}.mexido`, assetId]);
    };
    const r = await sendPdf(as(adminToken).put(`/api/digital-assets/${assetId}/file`), pdf('terceira'));
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/ao mesmo tempo/);
    expect((await assetRow()).storage_path).toBe(`${before.storage_path}.mexido`);
    expect(await vCount()).toBe(1);
    await pool.query('UPDATE digital_assets SET storage_path = $1 WHERE id = $2', [before.storage_path, assetId]);
  });

  it('volta para uma versão guardada (e a que sai entra no histórico)', async () => {
    const cur = await assetRow();
    fake.files.set(`digital-products/${cur.storage_path}`, NEW);
    const v = (await pool.query('SELECT * FROM digital_asset_versions WHERE asset_id = $1', [assetId])).rows[0];
    const r = await as(adminToken).post(`/api/digital-assets/${assetId}/versions/${v.id}/restore`);
    expect(r.status).toBe(200);
    const a = await assetRow();
    expect(a.storage_path).toBe(PATH); // endereço limpo do original
    expect(a.file_sha256).toBeNull();
    const vs = (await pool.query('SELECT * FROM digital_asset_versions WHERE asset_id = $1', [assetId])).rows;
    expect(vs).toHaveLength(1);
    expect(vs[0].storage_path).toBe(cur.storage_path);
    expect(vs[0].sha256).toBe(crypto.createHash('sha256').update(NEW).digest('hex'));
    expect(fake.uploads).toHaveLength(0);

    expect((await as(adminToken).post(`/api/digital-assets/${assetId}/versions/${crypto.randomUUID()}/restore`)).status).toBe(404);
    fake.files.clear();
    const missing = await as(adminToken).post(`/api/digital-assets/${assetId}/versions/${vs[0].id}/restore`);
    expect(missing.status).toBe(404);
    expect((await assetRow()).storage_path).toBe(PATH);
  });

  it('oferta sem arquivo: envia em endereço novo, cria o cadastro e liga; a segunda vez pede "Trocar arquivo"', async () => {
    const dolci = pdf('Dolci della Nonna');
    const r = await sendPdf(as(adminToken).post(`/api/offers/${offerNew}/delivery-files`), dolci, 'DOLCI_DELLA_NONNA.pdf');
    expect(r.status).toBe(201);
    expect(r.body.storage_path).toMatch(new RegExp(`^DOLCI_DELLA_NONNA_OFF-D${tag}__\\d{8}-\\d{6}-[0-9a-f]{8}\\.pdf$`));
    expect(fake.files.get(`${r.body.storage_bucket}/${r.body.storage_path}`)!.equals(dolci)).toBe(true);
    const view = await as(adminToken).get(`/api/offers/${offerNew}/delivery-files`);
    expect(view.body.assets).toHaveLength(1);
    expect(view.body.assets[0]).toMatchObject({ id: r.body.asset_id, is_demo: true, file_original_name: 'DOLCI_DELLA_NONNA.pdf' });

    const again = await sendPdf(as(adminToken).post(`/api/offers/${offerNew}/delivery-files`), pdf('outro'));
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/Trocar arquivo/);
  });

  it('link de conferência usa o endereço cadastrado', async () => {
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
    expect(validatePdf(Buffer.concat([pdf('com sobra'), Buffer.alloc(5000, 0x20)])).length).toBeGreaterThan(5000);
    expect(() => validatePdf(Buffer.alloc(MAX_PDF_BYTES + 1))).toThrow(/50 MB/);
    expect(newAssetBase('Dolci della Nonna', 'OFF-000012')).toBe('DOLCI_DELLA_NONNA_OFF-000012.pdf');
    expect(newAssetBase('Pão & Café', '')).toBe('PAO_CAFE.pdf');
    const at = new Date('2026-10-09T04:12:30Z');
    expect(versionedPath('TRATTORIA.pdf', at, 'abcdef0123456789')).toBe('TRATTORIA__20261009-041230-abcdef01.pdf');
    // trocar de novo não acumula sufixos
    expect(versionedPath('TRATTORIA__20261001-000000-11111111.pdf', at, 'abcdef0123456789')).toBe('TRATTORIA__20261009-041230-abcdef01.pdf');
    expect(cleanStoragePath('digital-products', '/digital-products/a/b.pdf')).toBe('a/b.pdf');
    expect(() => cleanStoragePath('b', '../segredo.pdf')).toThrow(/inválido/);
    expect(() => cleanStoragePath('b', 'a//b.pdf')).toThrow(/inválido/);
    expect(cleanFileName(encodeURIComponent('../a/b.pdf'))).toBe('.._a_b.pdf');
    expect(cleanFileName('nome‮fdp.exe')).toBe('nomefdp.exe');
    expect(cleanFileName(undefined)).toBeNull();
  });

  it('o cliente real do armazenamento fica desligado nos testes', async () => {
    await expect(supabaseStorage.exists('b', 'p')).rejects.toThrow('STORAGE_DISABLED_IN_TESTS');
    await expect(supabaseStorage.upload('b', 'p', Buffer.from('x'))).rejects.toThrow('STORAGE_DISABLED_IN_TESTS');
  });
});
