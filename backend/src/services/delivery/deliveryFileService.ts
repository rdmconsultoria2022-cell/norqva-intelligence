import { Pool, PoolClient } from 'pg';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { writeAuditLog } from '../../db/audit';

// NORQVA-0033: o PDF que o comprador recebe, trocado pela tela (ADMIN).
// Regras: só PDF de verdade, até 50 MB; o arquivo que está no endereço vai antes para _versoes/ no mesmo bucket
// (se a cópia falhar, nada é trocado); o novo entra no MESMO endereço, então quem já comprou passa a receber a
// versão nova pelo link assinado de sempre. Trocar arquivo não libera entrega para ninguém.

export const MAX_PDF_BYTES = 50 * 1024 * 1024;
export const VERSIONS_PREFIX = '_versoes/';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class DeliveryFileError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Acesso ao armazenamento. Nos testes é sempre um simulado; nunca fala com o Supabase de verdade. */
export interface StorageClient {
  /** Conteúdo do objeto, ou null se não existe. */
  download(bucket: string, path: string): Promise<Buffer | null>;
  upload(bucket: string, path: string, data: Buffer, opts: { upsert: boolean }): Promise<void>;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function supabaseRequest(method: string, objectPath: string, body?: Buffer, extraHeaders: Record<string, string> = {}): Promise<{ status: number; body: Buffer }> {
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !key || key === 'MOCK') {
    return Promise.reject(new DeliveryFileError(503, 'O armazenamento de arquivos não está configurado no servidor (SUPABASE_URL / chave de serviço).'));
  }
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/${objectPath}`);
  const lib = url.protocol === 'http:' ? http : https;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'http:' ? 80 : 443),
        path: url.pathname,
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
          ...(body ? { 'Content-Length': String(body.length) } : {}),
          ...extraHeaders
        },
        timeout: 120000
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      }
    );
    req.on('timeout', () => req.destroy(new Error('STORAGE_TIMEOUT')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const looksNotFound = (status: number, body: Buffer) =>
  status === 404 || (status === 400 && /not.?found|Object not found/i.test(body.toString('utf8').slice(0, 500)));

export const supabaseStorage: StorageClient = {
  async download(bucket, path) {
    if (process.env.NODE_ENV === 'test') throw new Error('STORAGE_DISABLED_IN_TESTS');
    const r = await supabaseRequest('GET', `authenticated/${encodeURIComponent(bucket)}/${encodePath(path)}`);
    if (looksNotFound(r.status, r.body)) return null;
    if (r.status < 200 || r.status >= 300) throw new DeliveryFileError(502, `O armazenamento recusou a leitura do arquivo atual (status ${r.status}). Nada foi trocado.`);
    return r.body;
  },
  async upload(bucket, path, data, opts) {
    if (process.env.NODE_ENV === 'test') throw new Error('STORAGE_DISABLED_IN_TESTS');
    const r = await supabaseRequest('POST', `${encodeURIComponent(bucket)}/${encodePath(path)}`, data, {
      'Content-Type': 'application/pdf',
      'cache-control': 'max-age=60',
      'x-upsert': opts.upsert ? 'true' : 'false'
    });
    if (r.status < 200 || r.status >= 300) {
      throw new DeliveryFileError(502, `O armazenamento recusou o envio (status ${r.status}): ${r.body.toString('utf8').slice(0, 200)}`);
    }
  }
};

let storage: StorageClient = supabaseStorage;
export function setStorageClient(c: StorageClient | null) {
  storage = c || supabaseStorage;
}

export const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

/** Recusa o que não é PDF de verdade. */
export function validatePdf(buf: any): Buffer {
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw new DeliveryFileError(400, 'Nenhum arquivo chegou. Escolha o PDF e envie de novo.');
  if (buf.length > MAX_PDF_BYTES) throw new DeliveryFileError(413, 'Arquivo maior que 50 MB.');
  const head = buf.subarray(0, 1024).toString('latin1');
  const tail = buf.subarray(Math.max(0, buf.length - 2048)).toString('latin1');
  if (!head.includes('%PDF-') || !tail.includes('%%EOF')) {
    throw new DeliveryFileError(400, 'Esse arquivo não é um PDF válido (ou está incompleto). Nada foi trocado.');
  }
  return buf;
}

export function cleanFileName(raw: any): string | null {
  if (raw === undefined || raw === null) return null;
  let s = String(raw);
  try {
    s = decodeURIComponent(s);
  } catch {
    /* mantém como veio */
  }
  s = s.replace(/[\\/]/g, '_').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200);
  return s || null;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

export function versionPathFor(storagePath: string, at: Date, sha: string): string {
  const base = storagePath.replace(/^\/+/, '').replace(/\.pdf$/i, '');
  return `${VERSIONS_PREFIX}${base}__${stamp(at)}-${sha.slice(0, 8)}.pdf`;
}

/** Endereço de um arquivo novo: nome da oferta + código, só letras simples. */
export function newAssetPath(offerName: string, humanId: string): string {
  const slug = String(offerName || 'arquivo')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'ARQUIVO';
  const code = String(humanId || '').toUpperCase().replace(/[^A-Z0-9-]+/g, '');
  return `${slug}${code ? `_${code}` : ''}.pdf`;
}

const publicAsset = (a: any) => ({
  id: a.id,
  name: a.name,
  storage_provider: a.storage_provider,
  storage_bucket: a.storage_bucket,
  storage_path: a.storage_path,
  is_demo: a.is_demo,
  file_size_bytes: a.file_size_bytes === null || a.file_size_bytes === undefined ? null : Number(a.file_size_bytes),
  file_sha256: a.file_sha256 || null,
  file_original_name: a.file_original_name || null,
  file_updated_at: a.file_updated_at || null
});

export class DeliveryFileService {
  constructor(private pool: Pool) {}

  private async versions(q: Pool | PoolClient, assetId: string) {
    const r = await q.query(
      `SELECT v.id, v.storage_path, v.size_bytes, v.sha256, v.original_name, v.replaced_at, u.email AS replaced_by_email
       FROM digital_asset_versions v LEFT JOIN users u ON u.id = v.replaced_by
       WHERE v.asset_id = $1 ORDER BY v.replaced_at DESC LIMIT 20`,
      [assetId]
    );
    return r.rows.map((v: any) => ({ ...v, size_bytes: Number(v.size_bytes) }));
  }

  private async loadOffer(offerId: string) {
    if (!UUID_RE.test(String(offerId))) throw new DeliveryFileError(404, 'Oferta não encontrada.');
    const o = await this.pool.query('SELECT id, human_id, name, is_demo, is_deleted FROM offers WHERE id = $1', [offerId]);
    if (o.rows.length === 0 || o.rows[0].is_deleted) throw new DeliveryFileError(404, 'Oferta não encontrada.');
    return o.rows[0];
  }

  /** Arquivos que a oferta entrega hoje, com o histórico de cada um. */
  async forOffer(offerId: string) {
    const offer = await this.loadOffer(offerId);
    const r = await this.pool.query(
      `SELECT a.* FROM offer_digital_assets oda JOIN digital_assets a ON a.id = oda.asset_id
       WHERE oda.offer_id = $1 ORDER BY oda.created_at ASC`,
      [offerId]
    );
    const assets = [];
    for (const a of r.rows) {
      const shared = await this.pool.query(
        `SELECT o.human_id FROM offer_digital_assets oda JOIN offers o ON o.id = oda.offer_id WHERE oda.asset_id = $1 AND oda.offer_id <> $2 ORDER BY o.human_id`,
        [a.id, offerId]
      );
      assets.push({ ...publicAsset(a), versions: await this.versions(this.pool, a.id), also_used_by: shared.rows.map((x: any) => x.human_id) });
    }
    return { offer_id: offer.id, offer_human_id: offer.human_id, assets };
  }

  async asset(assetId: string) {
    if (!UUID_RE.test(String(assetId))) throw new DeliveryFileError(404, 'Arquivo não encontrado.');
    const r = await this.pool.query('SELECT * FROM digital_assets WHERE id = $1', [assetId]);
    if (r.rows.length === 0) throw new DeliveryFileError(404, 'Arquivo não encontrado.');
    return r.rows[0];
  }

  /**
   * Põe `data` no endereço do arquivo, guardando antes o que estava lá. Usado na troca e na volta de versão.
   * A linha do arquivo fica travada (FOR UPDATE) do começo ao fim: duas trocas ao mesmo tempo não se atropelam.
   */
  private async put(assetId: string, data: Buffer, fileName: string | null, userId: string | null, action: 'REPLACED' | 'RESTORED') {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query('SELECT * FROM digital_assets WHERE id = $1 FOR UPDATE', [assetId]);
      const a = r.rows[0];
      if (!a) throw new DeliveryFileError(404, 'Arquivo não encontrado.');
      if (String(a.storage_provider || 'SUPABASE').toUpperCase() !== 'SUPABASE') {
        throw new DeliveryFileError(409, 'Este arquivo não fica no Supabase; não dá para trocar pela tela.');
      }
      const newSha = sha256(data);
      const now = new Date();

      // 1. Cópia de segurança do que está no endereço hoje
      const current = await storage.download(a.storage_bucket, a.storage_path);
      let backup: any = null;
      if (current) {
        const curSha = sha256(current);
        if (curSha === newSha) throw new DeliveryFileError(409, 'Esse é exatamente o arquivo que já está sendo entregue. Nada foi trocado.');
        const vPath = versionPathFor(a.storage_path, now, curSha);
        await storage.upload(a.storage_bucket, vPath, current, { upsert: false });
        const check = await storage.download(a.storage_bucket, vPath);
        if (!check || sha256(check) !== curSha) {
          throw new DeliveryFileError(502, 'A cópia de segurança não conferiu. Nada foi trocado.');
        }
        backup = { path: vPath, size: current.length, sha: curSha };
      }

      // 2. O novo no mesmo endereço
      await storage.upload(a.storage_bucket, a.storage_path, data, { upsert: true });

      if (backup) {
        await client.query(
          `INSERT INTO digital_asset_versions (asset_id, storage_path, size_bytes, sha256, original_name, replaced_by, is_demo)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [a.id, backup.path, backup.size, backup.sha, a.file_original_name || null, userId, Boolean(a.is_demo)]
        );
      }
      await client.query(
        `UPDATE digital_assets SET file_size_bytes = $1, file_sha256 = $2, file_original_name = $3, file_updated_at = NOW(), file_updated_by = $4 WHERE id = $5`,
        [data.length, newSha, fileName, userId, a.id]
      );
      await client.query('COMMIT');
      await writeAuditLog(
        this.pool,
        userId,
        `DELIVERY_FILE_${action}`,
        `${a.name}: ${action === 'RESTORED' ? 'versão anterior restaurada' : 'arquivo trocado'} em ${a.storage_bucket}/${a.storage_path} (${data.length} bytes)${backup ? `; cópia do anterior em ${backup.path}` : '; não havia arquivo anterior no endereço'}`,
        backup ? JSON.stringify({ sha256: backup.sha, size: backup.size, backup_path: backup.path }) : null,
        JSON.stringify({ sha256: newSha, size: data.length, file_name: fileName }),
        Boolean(a.is_demo)
      ).catch(() => {});
      return { asset_id: a.id, size_bytes: data.length, sha256: newSha, backup_path: backup?.path || null };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async replace(assetId: string, body: any, rawName: any, userId: string | null) {
    await this.asset(assetId);
    const data = validatePdf(body);
    return this.put(assetId, data, cleanFileName(rawName), userId, 'REPLACED');
  }

  async restore(assetId: string, versionId: string, userId: string | null) {
    await this.asset(assetId);
    if (!UUID_RE.test(String(versionId))) throw new DeliveryFileError(404, 'Versão não encontrada.');
    const v = await this.pool.query('SELECT * FROM digital_asset_versions WHERE id = $1 AND asset_id = $2', [versionId, assetId]);
    if (v.rows.length === 0) throw new DeliveryFileError(404, 'Versão não encontrada.');
    const a = await this.asset(assetId);
    const data = await storage.download(a.storage_bucket, v.rows[0].storage_path);
    if (!data) throw new DeliveryFileError(404, 'A cópia dessa versão não está mais no armazenamento.');
    if (sha256(data) !== v.rows[0].sha256) throw new DeliveryFileError(409, 'A cópia dessa versão não confere com o registro. Nada foi trocado.');
    return this.put(assetId, validatePdf(data), v.rows[0].original_name || null, userId, 'RESTORED');
  }

  /** Oferta sem arquivo: cria o registro, sobe o PDF num endereço novo e liga à oferta. */
  async createForOffer(offerId: string, body: any, rawName: any, userId: string | null) {
    const offer = await this.loadOffer(offerId);
    const data = validatePdf(body);
    const linked = await this.pool.query('SELECT 1 FROM offer_digital_assets WHERE offer_id = $1 LIMIT 1', [offer.id]);
    if (linked.rows.length > 0) throw new DeliveryFileError(409, 'Esta oferta já tem arquivo de entrega. Use "Trocar arquivo".');

    const b = await this.pool.query(
      `SELECT storage_bucket FROM digital_assets WHERE storage_provider = 'SUPABASE' AND is_demo = $1 ORDER BY created_at DESC LIMIT 1`,
      [Boolean(offer.is_demo)]
    );
    const bucket = b.rows[0]?.storage_bucket || (process.env.SUPABASE_DELIVERY_BUCKET || '').trim() || 'digital-products';
    const path = newAssetPath(offer.name, offer.human_id);
    const taken = await this.pool.query('SELECT 1 FROM digital_assets WHERE storage_bucket = $1 AND storage_path = $2 LIMIT 1', [bucket, path]);
    if (taken.rows.length > 0) throw new DeliveryFileError(409, `Já existe um arquivo cadastrado em ${path}.`);
    if (await storage.download(bucket, path)) {
      throw new DeliveryFileError(409, `Já existe um arquivo em ${bucket}/${path} no armazenamento. Nada foi enviado.`);
    }
    await storage.upload(bucket, path, data, { upsert: false });

    const fileName = cleanFileName(rawName);
    const client = await this.pool.connect();
    let assetId: string;
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO digital_assets (name, storage_provider, storage_bucket, storage_path, is_demo, file_size_bytes, file_sha256, file_original_name, file_updated_at, file_updated_by)
         VALUES ($1, 'SUPABASE', $2, $3, $4, $5, $6, $7, NOW(), $8) RETURNING id`,
        [`${offer.name} — PDF`.slice(0, 255), bucket, path, Boolean(offer.is_demo), data.length, sha256(data), fileName, userId]
      );
      assetId = ins.rows[0].id;
      await client.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [offer.id, assetId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    await writeAuditLog(
      this.pool,
      userId,
      'DELIVERY_FILE_CREATED',
      `${offer.human_id}: arquivo de entrega enviado pela tela em ${bucket}/${path} (${data.length} bytes) e ligado à oferta`,
      null,
      JSON.stringify({ asset_id: assetId, sha256: sha256(data), size: data.length, file_name: fileName }),
      Boolean(offer.is_demo)
    ).catch(() => {});
    return { asset_id: assetId, storage_bucket: bucket, storage_path: path, size_bytes: data.length };
  }
}
