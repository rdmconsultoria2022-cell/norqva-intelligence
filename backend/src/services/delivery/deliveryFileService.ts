import { Pool, PoolClient } from 'pg';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { writeAuditLog } from '../../db/audit';

// NORQVA-0033: o PDF que o comprador recebe, trocado pela tela (ADMIN).
//
// Como a troca funciona (troca por endereço novo):
// 1. o PDF novo sobe num endereço NOVO e único (nome + data + impressão digital), sem sobrescrever nada;
// 2. confere-se que o objeto existe no armazenamento;
// 3. numa transação curta, o cadastro do arquivo passa a apontar para o endereço novo e o endereço antigo vai para
//    o histórico (o arquivo antigo continua lá, intacto: é a cópia de segurança).
// O link do comprador é gerado na hora do clique a partir do cadastro, então quem já comprou passa a receber a
// versão nova; e como o endereço é novo, nenhum cache de CDN devolve o PDF antigo. Se algo falha antes do passo 3,
// o cadastro não mudou: nada foi trocado de verdade (no máximo sobra um objeto novo sem uso). Trocar arquivo não
// libera entrega para ninguém: a entrega continua só com pedido PAID.

export const MAX_PDF_BYTES = 50 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_SUFFIX_RE = /__\d{8}-\d{6}-[0-9a-f]{8}$/i;

export class DeliveryFileError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Acesso ao armazenamento. Nos testes é sempre um simulado; nunca fala com o Supabase de verdade. */
export interface StorageClient {
  exists(bucket: string, path: string): Promise<boolean>;
  /** Envia sem sobrescrever: se já existir algo no endereço, falha. */
  upload(bucket: string, path: string, data: Buffer): Promise<void>;
}

/** Mesmo endereço que a entrega usa (sem barra no início, sem o nome do bucket repetido), e nada de "..". */
export function cleanStoragePath(bucket: string, raw: string): string {
  let p = String(raw || '').trim().replace(/^\/+/, '');
  if (p.startsWith(`${bucket}/`)) p = p.slice(bucket.length + 1).replace(/^\/+/, '');
  const segs = p.split('/');
  if (!p || segs.some(s => s === '' || s === '.' || s === '..')) {
    throw new DeliveryFileError(409, 'O endereço cadastrado deste arquivo é inválido. Corrija o cadastro antes de trocar.');
  }
  return p;
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

function supabaseRequest(method: string, objectPath: string, body: Buffer | null, extraHeaders: Record<string, string> = {}): Promise<{ status: number; text: string }> {
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !key || key === 'MOCK') {
    return Promise.reject(new DeliveryFileError(503, 'O armazenamento de arquivos não está configurado no servidor. Nada foi trocado.'));
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
        let text = '';
        res.setEncoding('utf8');
        res.on('data', c => {
          if (text.length < 2000) text += c;
        });
        res.on('end', () => resolve({ status: res.statusCode || 0, text }));
        res.on('error', reject);
      }
    );
    req.on('timeout', () => req.destroy(new Error('STORAGE_TIMEOUT')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/** "Objeto não existe" (e não "bucket não existe", que é erro de configuração). */
const objectNotFound = (status: number, text: string) => {
  if (/bucket not found/i.test(text)) return false;
  return status === 404 || (status === 400 && /not_found|object not found/i.test(text));
};

export const supabaseStorage: StorageClient = {
  async exists(bucket, path) {
    if (process.env.NODE_ENV === 'test') throw new Error('STORAGE_DISABLED_IN_TESTS');
    const payload = Buffer.from(JSON.stringify({ expiresIn: 60 }));
    const r = await supabaseRequest('POST', `sign/${encodeURIComponent(bucket)}/${encodePath(path)}`, payload, { 'Content-Type': 'application/json' });
    if (r.status >= 200 && r.status < 300) return true;
    if (objectNotFound(r.status, r.text)) return false;
    throw new DeliveryFileError(502, `O armazenamento não respondeu como esperado (status ${r.status}). Nada foi trocado.`);
  },
  async upload(bucket, path, data) {
    if (process.env.NODE_ENV === 'test') throw new Error('STORAGE_DISABLED_IN_TESTS');
    const r = await supabaseRequest('POST', `${encodeURIComponent(bucket)}/${encodePath(path)}`, data, {
      'Content-Type': 'application/pdf',
      'cache-control': 'max-age=3600',
      'x-upsert': 'false'
    });
    if (r.status < 200 || r.status >= 300) {
      throw new DeliveryFileError(502, `O armazenamento recusou o envio (status ${r.status}). Nada foi trocado.`);
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
  const tail = buf.subarray(Math.max(0, buf.length - 65536)).toString('latin1');
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
  s = s
    .replace(/[\\/]/g, '_')
    .replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, '')
    .trim()
    .slice(0, 200);
  return s || null;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

/** Endereço novo e único para uma versão, no mesmo lugar do original: NOME__AAAAMMDD-HHMMSS-sha8.pdf */
export function versionedPath(cleanPath: string, at: Date, sha: string): string {
  const base = cleanPath.replace(/\.pdf$/i, '').replace(VERSION_SUFFIX_RE, '');
  return `${base}__${stamp(at)}-${sha.slice(0, 8)}.pdf`;
}

/** Nome-base de um arquivo novo: nome da oferta + código, só letras simples. */
export function newAssetBase(offerName: string, humanId: string): string {
  const slug =
    String(offerName || 'arquivo')
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
      const v = await this.pool.query(
        `SELECT v.id, v.storage_bucket, v.storage_path, v.size_bytes, v.sha256, v.original_name, v.replaced_at, u.email AS replaced_by_email
         FROM digital_asset_versions v LEFT JOIN users u ON u.id = v.replaced_by
         WHERE v.asset_id = $1 ORDER BY v.replaced_at DESC LIMIT 20`,
        [a.id]
      );
      assets.push({
        ...publicAsset(a),
        versions: v.rows.map((x: any) => ({ ...x, size_bytes: x.size_bytes === null ? null : Number(x.size_bytes) })),
        also_used_by: shared.rows.map((x: any) => x.human_id)
      });
    }
    return { offer_id: offer.id, offer_human_id: offer.human_id, assets };
  }

  /** Quem fez a troca, se for um usuário cadastrado (no modo demonstração o usuário simulado não existe). */
  private async actor(userId: string | null): Promise<string | null> {
    if (!userId || !UUID_RE.test(String(userId))) return null;
    const r = await this.pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    return r.rows[0]?.id || null;
  }

  async asset(assetId: string) {
    if (!UUID_RE.test(String(assetId))) throw new DeliveryFileError(404, 'Arquivo não encontrado.');
    const r = await this.pool.query('SELECT * FROM digital_assets WHERE id = $1', [assetId]);
    if (r.rows.length === 0) throw new DeliveryFileError(404, 'Arquivo não encontrado.');
    return r.rows[0];
  }

  /**
   * Aponta o cadastro para (bucket, path) — que já precisa existir no armazenamento — e guarda o endereço atual no
   * histórico. Transação curta, sem rede. `expect` = endereço lido antes de enviar: se outra troca aconteceu no meio,
   * recusa (o objeto enviado fica sem uso, nada muda para o comprador).
   */
  private async repoint(
    a: any,
    target: { bucket: string; path: string; size: number | null; sha: string | null; name: string | null },
    userId: string | null,
    action: 'REPLACED' | 'RESTORED',
    restoredVersionId: string | null
  ) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const cur = (await client.query('SELECT * FROM digital_assets WHERE id = $1 FOR NO KEY UPDATE', [a.id])).rows[0];
      if (!cur || cur.storage_bucket !== a.storage_bucket || cur.storage_path !== a.storage_path) {
        throw new DeliveryFileError(409, 'Outra troca deste arquivo aconteceu ao mesmo tempo. Nada foi trocado; recarregue e confira.');
      }
      await client.query(
        `INSERT INTO digital_asset_versions (asset_id, storage_bucket, storage_path, size_bytes, sha256, original_name, replaced_by, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [cur.id, cur.storage_bucket, cur.storage_path, cur.file_size_bytes ?? null, cur.file_sha256 || null, cur.file_original_name || null, userId, Boolean(cur.is_demo)]
      );
      if (restoredVersionId) await client.query('DELETE FROM digital_asset_versions WHERE id = $1 AND asset_id = $2', [restoredVersionId, cur.id]);
      await client.query(
        `UPDATE digital_assets SET storage_bucket = $1, storage_path = $2, file_size_bytes = $3, file_sha256 = $4, file_original_name = $5,
           file_updated_at = NOW(), file_updated_by = $6 WHERE id = $7`,
        [target.bucket, target.path, target.size, target.sha, target.name, userId, cur.id]
      );
      await writeAuditLog(
        client,
        userId,
        `DELIVERY_FILE_${action}`,
        `${cur.name}: ${action === 'RESTORED' ? 'versão anterior restaurada' : 'arquivo trocado'}; agora entrega ${target.bucket}/${target.path}; o anterior (${cur.storage_bucket}/${cur.storage_path}) ficou no histórico`,
        JSON.stringify({ bucket: cur.storage_bucket, path: cur.storage_path, sha256: cur.file_sha256 || null, size: cur.file_size_bytes ?? null }),
        JSON.stringify({ bucket: target.bucket, path: target.path, sha256: target.sha, size: target.size, file_name: target.name }),
        Boolean(cur.is_demo),
        true
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async replace(assetId: string, body: any, rawName: any, userId: string | null) {
    const a = await this.asset(assetId);
    if (String(a.storage_provider || 'SUPABASE').toUpperCase() !== 'SUPABASE') {
      throw new DeliveryFileError(409, 'Este arquivo não fica no Supabase; não dá para trocar pela tela.');
    }
    const data = validatePdf(body);
    const sha = sha256(data);
    if (a.file_sha256 && a.file_sha256 === sha) throw new DeliveryFileError(409, 'Esse é exatamente o arquivo que já está sendo entregue. Nada foi trocado.');
    const path = versionedPath(cleanStoragePath(a.storage_bucket, a.storage_path), new Date(), sha);
    await storage.upload(a.storage_bucket, path, data);
    if (!(await storage.exists(a.storage_bucket, path))) {
      throw new DeliveryFileError(502, 'O arquivo novo não apareceu no armazenamento. Nada foi trocado.');
    }
    const name = cleanFileName(rawName);
    await this.repoint(a, { bucket: a.storage_bucket, path, size: data.length, sha, name }, await this.actor(userId), 'REPLACED', null);
    return { asset_id: a.id, storage_bucket: a.storage_bucket, storage_path: path, size_bytes: data.length, sha256: sha, previous_path: a.storage_path };
  }

  async restore(assetId: string, versionId: string, userId: string | null) {
    const a = await this.asset(assetId);
    if (!UUID_RE.test(String(versionId))) throw new DeliveryFileError(404, 'Versão não encontrada.');
    const v = (await this.pool.query('SELECT * FROM digital_asset_versions WHERE id = $1 AND asset_id = $2', [versionId, assetId])).rows[0];
    if (!v) throw new DeliveryFileError(404, 'Versão não encontrada.');
    const path = cleanStoragePath(v.storage_bucket, v.storage_path);
    if (!(await storage.exists(v.storage_bucket, path))) throw new DeliveryFileError(404, 'O arquivo dessa versão não está mais no armazenamento. Nada foi trocado.');
    await this.repoint(
      a,
      { bucket: v.storage_bucket, path, size: v.size_bytes === null ? null : Number(v.size_bytes), sha: v.sha256 || null, name: v.original_name || null },
      await this.actor(userId),
      'RESTORED',
      v.id
    );
    return { asset_id: a.id, storage_bucket: v.storage_bucket, storage_path: path, previous_path: a.storage_path };
  }

  /** Bucket para arquivo novo: o configurado; senão o do arquivo mais recente já ligado a uma oferta do mesmo ambiente. */
  private async bucketFor(isDemo: boolean) {
    const env = (process.env.SUPABASE_DELIVERY_BUCKET || '').trim();
    if (env) return env;
    const b = await this.pool.query(
      `SELECT a.storage_bucket FROM digital_assets a
       JOIN offer_digital_assets oda ON oda.asset_id = a.id JOIN offers o ON o.id = oda.offer_id
       WHERE a.storage_provider = 'SUPABASE' AND a.is_demo = $1 AND COALESCE(o.is_deleted, FALSE) = FALSE
       ORDER BY oda.created_at DESC LIMIT 1`,
      [isDemo]
    );
    return b.rows[0]?.storage_bucket || 'digital-products';
  }

  /** Oferta sem arquivo: envia o PDF num endereço novo, cria o cadastro e liga à oferta. */
  async createForOffer(offerId: string, body: any, rawName: any, userId: string | null) {
    const offer = await this.loadOffer(offerId);
    const data = validatePdf(body);
    const already = await this.pool.query('SELECT 1 FROM offer_digital_assets WHERE offer_id = $1 LIMIT 1', [offer.id]);
    if (already.rows.length > 0) throw new DeliveryFileError(409, 'Esta oferta já tem arquivo de entrega. Use "Trocar arquivo".');

    const sha = sha256(data);
    const bucket = await this.bucketFor(Boolean(offer.is_demo));
    const path = versionedPath(newAssetBase(offer.name, offer.human_id), new Date(), sha);
    await storage.upload(bucket, path, data);
    if (!(await storage.exists(bucket, path))) throw new DeliveryFileError(502, 'O arquivo não apareceu no armazenamento. Nada foi ligado.');

    const fileName = cleanFileName(rawName);
    userId = await this.actor(userId);
    const client = await this.pool.connect();
    let assetId: string;
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM offers WHERE id = $1 FOR NO KEY UPDATE', [offer.id]);
      const again = await client.query('SELECT 1 FROM offer_digital_assets WHERE offer_id = $1 LIMIT 1', [offer.id]);
      if (again.rows.length > 0) throw new DeliveryFileError(409, 'Esta oferta já tem arquivo de entrega. Use "Trocar arquivo".');
      const ins = await client.query(
        `INSERT INTO digital_assets (name, storage_provider, storage_bucket, storage_path, is_demo, file_size_bytes, file_sha256, file_original_name, file_updated_at, file_updated_by)
         VALUES ($1, 'SUPABASE', $2, $3, $4, $5, $6, $7, NOW(), $8) RETURNING id`,
        [`${offer.name} — PDF`.slice(0, 255), bucket, path, Boolean(offer.is_demo), data.length, sha, fileName, userId]
      );
      assetId = ins.rows[0].id;
      await client.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [offer.id, assetId]);
      await writeAuditLog(
        client,
        userId,
        'DELIVERY_FILE_CREATED',
        `${offer.human_id}: arquivo de entrega enviado pela tela em ${bucket}/${path} (${data.length} bytes) e ligado à oferta`,
        null,
        JSON.stringify({ asset_id: assetId, sha256: sha, size: data.length, file_name: fileName }),
        Boolean(offer.is_demo),
        true
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    return { asset_id: assetId, storage_bucket: bucket, storage_path: path, size_bytes: data.length };
  }
}
