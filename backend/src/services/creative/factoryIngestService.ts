import https from 'https';
import { URL } from 'url';
import { Pool } from 'pg';
import { CreativeBatch, BatchCreative } from '../../data/creativeBatches';
import { CreativeFactoryError, CreativeFactoryService } from './creativeFactoryService';
import { writeAuditLog } from '../../db/audit';

// NORQVA-0020: ponte Creative Factory → NORQVA.
// Factory → release certificado → Supabase Storage → ingest → creative_batches → importBatchData → creatives (DRAFT).
// A certificação da Factory é guardada como evidência (factory_releases); aprovar e publicar continuam no NORQVA (D-0011).

export const FACTORY_RELEASE_SCHEMA = 'norqva.factory-release.v1';
export const FACTORY_BUCKET = 'creative-assets';
export const FACTORY_MAX_BYTES = 50 * 1024 * 1024; // limite por arquivo do Supabase Storage no plano atual

const MIME_EXT: Record<string, string> = { 'video/mp4': 'mp4', 'image/png': 'png', 'image/jpeg': 'jpg' };
const FORMAT_BY_MIME: Record<string, BatchCreative['format']> = { 'video/mp4': 'VIDEO', 'image/png': 'IMAGE', 'image/jpeg': 'IMAGE' };

const CAMPAIGN_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._]{0,7}$/;
const SHA_RE = /^[a-f0-9]{64}$/;

export interface FactoryReleasePayload {
  schema: string;
  campaign_id: string;
  creative_version: string;
  factory_version?: string;
  certified: boolean;
  approval_timestamp?: string;
  offer_human_id: string;
  media: { sha256: string; size_bytes: number; mime: string; duration_seconds?: number | null; resolution?: string; aspect_ratio?: string };
  storage: { bucket: string; path: string };
  copy: { hook: string; hook_family?: string; mechanism?: string; script?: string; primary_text?: string; headline?: string; cta?: string };
  claim_codes: string[];
  qa_certifications: Record<string, unknown>;
  lineage?: Record<string, unknown>;
  manifest?: Record<string, unknown>;
}

/** Confirms the object is really in Storage with the declared size. Replaceable only in tests. */
export type StorageVerifier = (publicUrl: string, expectedBytes: number) => Promise<{ ok: boolean; detail: string }>;

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

function supabaseBase(): string {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  if (!url) throw new CreativeFactoryError(503, 'SUPABASE_URL não configurado.');
  return url;
}

function serviceKey(): string {
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) throw new CreativeFactoryError(503, 'SUPABASE_SERVICE_ROLE_KEY não configurado.');
  return key;
}

export function factoryStoragePath(campaignId: string, version: string, sha256: string, mime: string): string {
  return `factory/${campaignId}/${version}/${sha256}.${MIME_EXT[mime]}`;
}

export function factoryPublicUrl(bucket: string, path: string): string {
  return `${supabaseBase()}/storage/v1/object/public/${bucket}/${path}`;
}

export const factoryBatchCode = (campaignId: string) => `CF-${campaignId}`;
export const factoryCreativeKey = (campaignId: string, version: string) => `CF-${campaignId}-${version}`;

function httpJson(method: string, url: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: any; headers: Record<string, any> }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method,
        headers: { ...headers, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) },
        timeout: 20000
      },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          let parsed: any = data;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            /* corpo não-JSON */
          }
          resolve({ status: res.statusCode || 0, body: parsed, headers: res.headers as any });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const defaultVerifier: StorageVerifier = async (publicUrl, expectedBytes) => {
  try {
    const r = await httpJson('HEAD', publicUrl, {});
    if (r.status !== 200) return { ok: false, detail: `Storage respondeu ${r.status}` };
    const len = Number(r.headers['content-length']);
    if (len !== expectedBytes) return { ok: false, detail: `tamanho no Storage ${len} ≠ declarado ${expectedBytes}` };
    return { ok: true, detail: 'ok' };
  } catch (err: any) {
    return { ok: false, detail: String(err?.message || err) };
  }
};

let verifier: StorageVerifier = defaultVerifier;

/** Tests only: swap the Storage check (never available outside NODE_ENV=test). */
export function setFactoryStorageVerifierForTests(v: StorageVerifier | null) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Somente em testes.');
  verifier = v || defaultVerifier;
}

function validate(p: any): FactoryReleasePayload {
  const bad = (msg: string) => {
    throw new CreativeFactoryError(422, msg);
  };
  if (!p || typeof p !== 'object') bad('Corpo inválido.');
  if (p.schema !== FACTORY_RELEASE_SCHEMA) bad(`schema deve ser ${FACTORY_RELEASE_SCHEMA}.`);
  if (!CAMPAIGN_RE.test(String(p.campaign_id || ''))) bad('campaign_id inválido (a-z, 0-9, hífen; até 32 caracteres).');
  if (!VERSION_RE.test(String(p.creative_version || ''))) bad('creative_version inválido (até 8 caracteres).');
  if (p.certified !== true) bad('Somente releases certificados pela Factory entram no NORQVA.');
  if (!p.qa_certifications || typeof p.qa_certifications !== 'object' || Object.keys(p.qa_certifications).length === 0) {
    bad('qa_certifications é obrigatório (evidência da certificação).');
  }
  if (p.approval_timestamp !== undefined && p.approval_timestamp !== null && Number.isNaN(Date.parse(String(p.approval_timestamp)))) {
    bad('approval_timestamp inválido.');
  }
  if (!clip(p.offer_human_id, 50)) bad('offer_human_id é obrigatório (mapeado no export da Factory).');
  const m = p.media || {};
  if (!SHA_RE.test(String(m.sha256 || ''))) bad('media.sha256 inválido.');
  if (!MIME_EXT[m.mime]) bad('media.mime deve ser video/mp4, image/png ou image/jpeg.');
  if (!Number.isInteger(m.size_bytes) || m.size_bytes <= 0) bad('media.size_bytes inválido.');
  if (m.size_bytes > FACTORY_MAX_BYTES) bad('Arquivo acima de 50 MB.');
  const s = p.storage || {};
  if (s.bucket !== FACTORY_BUCKET) bad(`storage.bucket deve ser ${FACTORY_BUCKET}.`);
  if (s.path !== factoryStoragePath(p.campaign_id, p.creative_version, m.sha256, m.mime)) bad('storage.path fora do padrão factory/<campanha>/<versão>/<sha256>.<ext>.');
  if (!clip(p.copy?.hook, 2000)) bad('copy.hook é obrigatório.');
  if (!Array.isArray(p.claim_codes) || p.claim_codes.length === 0) {
    bad('claim_codes é obrigatório: o criativo precisa declarar as claims registradas que afirma (sem isso não pode ser aprovado).');
  }
  if (p.claim_codes.some((c: unknown) => typeof c !== 'string' || !c.trim())) bad('claim_codes contém valor inválido.');
  return p as FactoryReleasePayload;
}

export class FactoryIngestService {
  constructor(private factory = new CreativeFactoryService()) {}

  /** Returns a signed upload URL for the release file (the Factory never holds the Supabase admin key). */
  async createUploadUrl(input: { campaign_id: string; creative_version: string; sha256: string; size_bytes: number; mime: string }) {
    if (!CAMPAIGN_RE.test(String(input.campaign_id || ''))) throw new CreativeFactoryError(422, 'campaign_id inválido.');
    if (!VERSION_RE.test(String(input.creative_version || ''))) throw new CreativeFactoryError(422, 'creative_version inválido.');
    if (!SHA_RE.test(String(input.sha256 || ''))) throw new CreativeFactoryError(422, 'sha256 inválido.');
    if (!MIME_EXT[input.mime]) throw new CreativeFactoryError(422, 'mime não suportado.');
    if (!Number.isInteger(input.size_bytes) || input.size_bytes <= 0) throw new CreativeFactoryError(422, 'size_bytes inválido.');
    if (input.size_bytes > FACTORY_MAX_BYTES) throw new CreativeFactoryError(413, 'Arquivo acima de 50 MB.');

    const path = factoryStoragePath(input.campaign_id, input.creative_version, input.sha256, input.mime);
    const publicUrl = factoryPublicUrl(FACTORY_BUCKET, path);

    // Already uploaded with the same size (path carries the sha256): nothing to send
    const existing = await verifier(publicUrl, input.size_bytes);
    if (existing.ok) return { bucket: FACTORY_BUCKET, path, public_url: publicUrl, already_uploaded: true, upload_url: null };

    const base = supabaseBase();
    const key = serviceKey();
    const auth = { Authorization: `Bearer ${key}`, apikey: key };

    // Public bucket for ad media (the same files are public on Meta); idempotent
    const bucket = await httpJson('POST', `${base}/storage/v1/bucket`, auth, {
      id: FACTORY_BUCKET,
      name: FACTORY_BUCKET,
      public: true,
      file_size_limit: FACTORY_MAX_BYTES,
      allowed_mime_types: Object.keys(MIME_EXT)
    });
    const exists = bucket.status === 409 || /already exists/i.test(JSON.stringify(bucket.body || ''));
    if (!(bucket.status >= 200 && bucket.status < 300) && !exists) {
      throw new CreativeFactoryError(502, `Falha ao preparar o bucket (${bucket.status}).`);
    }

    const sign = await httpJson('POST', `${base}/storage/v1/object/upload/sign/${FACTORY_BUCKET}/${path}`, { ...auth, 'x-upsert': 'true' }, {});
    if (sign.status < 200 || sign.status >= 300 || !sign.body?.url) {
      throw new CreativeFactoryError(502, `Falha ao gerar URL de upload (${sign.status}).`);
    }
    const rel = String(sign.body.url);
    return {
      bucket: FACTORY_BUCKET,
      path,
      public_url: publicUrl,
      already_uploaded: false,
      upload_url: `${base}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`
    };
  }

  async ingest(pool: Pool, raw: unknown, isDemo: boolean) {
    const p = validate(raw);
    const batchCode = factoryBatchCode(p.campaign_id);
    const key = factoryCreativeKey(p.campaign_id, p.creative_version);
    const humanId = `${key}${isDemo ? '-DEMO' : ''}`;

    // 1. Idempotência: release é imutável por (campanha, versão)
    const prior = await pool.query(
      'SELECT id, creative_id, sha256 FROM factory_releases WHERE campaign_id = $1 AND creative_version = $2 AND is_demo = $3',
      [p.campaign_id, p.creative_version, isDemo]
    );
    if (prior.rows[0]) {
      if (prior.rows[0].sha256 !== p.media.sha256) {
        throw new CreativeFactoryError(409, `Release ${p.campaign_id} ${p.creative_version} já existe com outro arquivo. Releases são imutáveis: gere uma versão nova.`);
      }
      return { status: 'ALREADY_INGESTED', creative_id: prior.rows[0].creative_id, human_id: humanId, batch_code: batchCode };
    }
    // O mesmo arquivo não entra duas vezes com chaves diferentes
    const sameFile = await pool.query(
      'SELECT campaign_id, creative_version FROM factory_releases WHERE sha256 = $1 AND is_demo = $2 LIMIT 1',
      [p.media.sha256, isDemo]
    );
    if (sameFile.rows[0]) {
      throw new CreativeFactoryError(409, `Este arquivo já entrou como ${sameFile.rows[0].campaign_id} ${sameFile.rows[0].creative_version}.`);
    }

    // 2. Oferta e claims precisam existir no NORQVA (nada é criado por inferência)
    const offer = await pool.query('SELECT id, product_id, human_id FROM offers WHERE human_id = $1 AND is_deleted = FALSE', [clip(p.offer_human_id, 50)]);
    if (!offer.rows[0]) throw new CreativeFactoryError(422, `Oferta ${p.offer_human_id} não existe no NORQVA.`);
    const productId = String(offer.rows[0].product_id);

    const codes = [...new Set(p.claim_codes.map(c => c.trim()))];
    const suffix = isDemo ? '-DEMO' : '';
    const claimRows = await pool.query(
      `SELECT human_id, product_id, status FROM claims_registry WHERE human_id IN (${codes.map((_, i) => `$${i + 1}`).join(', ')})`,
      codes.map(c => `${c}${suffix}`)
    );
    const found = new Map<string, any>(claimRows.rows.map(r => [String(r.human_id).replace(/-DEMO$/, ''), r] as [string, any]));
    const missing = codes.filter(c => !found.has(c));
    if (missing.length) throw new CreativeFactoryError(422, `Claims não registradas no NORQVA: ${missing.join(', ')}.`);
    const rejected = codes.filter(c => found.get(c).status === 'REJECTED');
    if (rejected.length) throw new CreativeFactoryError(422, `Claims rejeitadas não podem ser usadas: ${rejected.join(', ')}.`);
    const otherProduct = codes.filter(c => String(found.get(c).product_id) !== productId);
    if (otherProduct.length) throw new CreativeFactoryError(422, `Claims de outro produto: ${otherProduct.join(', ')}.`);

    // 3. O arquivo tem que estar no Storage com o tamanho declarado
    const fileUrl = factoryPublicUrl(p.storage.bucket, p.storage.path);
    const check = await verifier(fileUrl, p.media.size_bytes);
    if (!check.ok) throw new CreativeFactoryError(422, `Arquivo não confirmado no Storage: ${check.detail}.`);

    // 4. Lote da campanha (creative_batches, fonte FACTORY) + import pelo caminho padrão
    const creative: BatchCreative = {
      key,
      hookCode: p.creative_version,
      hookFamily: clip(p.copy.hook_family, 50) || 'FACTORY',
      hook: clip(p.copy.hook, 2000),
      mechanismCode: '',
      mechanism: clip(p.copy.mechanism, 2000),
      ctaCode: '',
      cta: clip(p.copy.cta, 500),
      format: FORMAT_BY_MIME[p.media.mime],
      durationSeconds: p.media.duration_seconds ? Math.round(Number(p.media.duration_seconds)) : null,
      script: clip(p.copy.script, 8000),
      primaryText: clip(p.copy.primary_text, 4000),
      headline: clip(p.copy.headline, 500),
      claimCodes: codes,
      fileUrl,
      generationSource: 'FACTORY'
    };
    const existingBatch = await pool.query('SELECT payload FROM creative_batches WHERE code = $1 AND is_demo = $2', [batchCode, isDemo]);
    const prev: CreativeBatch | undefined = existingBatch.rows[0]?.payload;
    if (prev && prev.offerId !== String(offer.rows[0].id)) {
      throw new CreativeFactoryError(409, `A campanha ${p.campaign_id} já está ligada a outra oferta no NORQVA.`);
    }
    const batch: CreativeBatch = {
      code: batchCode,
      productId,
      offerId: String(offer.rows[0].id),
      offerHumanId: String(offer.rows[0].human_id),
      description: `Creative Factory — campanha ${p.campaign_id}`,
      claims: [],
      creatives: [...(prev?.creatives || []).filter(c => c.key !== key), creative]
    };
    if (prev) {
      await pool.query('UPDATE creative_batches SET payload = $1 WHERE code = $2 AND is_demo = $3', [JSON.stringify(batch), batchCode, isDemo]);
    } else {
      await pool.query(
        `INSERT INTO creative_batches (code, product_id, offer_id, name, source, payload, is_demo)
         VALUES ($1, $2, $3, $4, 'FACTORY', $5, $6)`,
        [batchCode, productId, batch.offerId, `Factory ${p.campaign_id}`, JSON.stringify(batch), isDemo]
      );
    }
    await this.factory.importBatchData(pool, { ...batch, creatives: [creative] }, null, isDemo);
    await pool.query('UPDATE creative_batches SET imported_at = NOW() WHERE code = $1 AND is_demo = $2', [batchCode, isDemo]);

    const cRow = await pool.query('SELECT id, batch_code, file_url FROM creatives WHERE human_id = $1', [humanId]);
    const c = cRow.rows[0];
    if (!c || c.batch_code !== batchCode || c.file_url !== fileUrl) {
      throw new CreativeFactoryError(409, `Já existe um criativo ${humanId} que não corresponde a este release.`);
    }

    // 5. Evidência da Factory
    await pool.query(
      `INSERT INTO factory_releases (
         campaign_id, creative_version, creative_id, batch_code, factory_version, sha256, size_bytes,
         storage_bucket, storage_path, file_url, media, qa_certifications, lineage, manifest, approval_timestamp, is_demo
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (campaign_id, creative_version, is_demo) DO NOTHING`,
      [
        p.campaign_id, p.creative_version, c.id, batchCode, clip(p.factory_version, 30) || null, p.media.sha256, p.media.size_bytes,
        p.storage.bucket, p.storage.path, fileUrl, JSON.stringify(p.media), JSON.stringify(p.qa_certifications),
        p.lineage ? JSON.stringify(p.lineage) : null, JSON.stringify(p.manifest || p), p.approval_timestamp || null, isDemo
      ]
    );
    await writeAuditLog(
      pool,
      null,
      'FACTORY_RELEASE_INGESTED',
      `Release ${p.campaign_id} ${p.creative_version} (Factory ${p.factory_version || '?'}) entrou como ${humanId} em DRAFT.`,
      null,
      p.media.sha256,
      isDemo
    );
    return { status: 'INGESTED', creative_id: c.id, human_id: humanId, batch_code: batchCode, approval_status: 'DRAFT', file_url: fileUrl };
  }
}
