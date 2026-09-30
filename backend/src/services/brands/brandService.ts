import { Pool } from 'pg';

// NORQVA-0018 (fase A): marcas por nicho e checklist de ativos Meta (D-0009).

export const ASSET_TYPES = ['FACEBOOK_PAGE', 'INSTAGRAM', 'AD_ACCOUNT', 'PIXEL', 'WHATSAPP'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
const SPOKESPERSON = ['BRAND_ONLY', 'REAL_CREATOR', 'ILLUSTRATED_CHARACTER'];
const BRAND_STATUS = ['DRAFT', 'PROVISIONING', 'PILOT', 'CERTIFIED', 'PAUSED'];
// Fase A: o operador registra o que criou à mão. VERIFIED só pela conferência via API (fase C).
const MANUAL_ASSET_STATUS = ['PENDING_OPERATOR', 'LINKED', 'NOT_NEEDED'];

export class BrandError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const clean = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export function normalizeBrandCode(code: unknown): string {
  const c = String(code || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (!c) throw new BrandError(400, 'Informe o código da marca.');
  return c;
}

/** Regra D-0009: marca fala como marca; criador real só com consentimento registrado. */
export function validateSpokesperson(type: unknown, consentRef: unknown): { type: string; consent: string | null } {
  const t = type === undefined || type === null ? 'BRAND_ONLY' : String(type);
  if (!SPOKESPERSON.includes(t)) throw new BrandError(400, 'Tipo de porta-voz inválido.');
  const consent = clean(consentRef, 500);
  if (t === 'REAL_CREATOR' && !consent) throw new BrandError(400, 'Criador real exige referência do consentimento registrado.');
  if (t !== 'REAL_CREATOR' && consent) throw new BrandError(400, 'Consentimento só se aplica a criador real.');
  return { type: t, consent };
}

export class BrandService {
  async list(pool: Pool) {
    const brands = (
      await pool.query(
        `SELECT b.*, n.name AS niche_name,
                (SELECT COUNT(*)::int FROM products p WHERE p.brand_id = b.id) AS products_count
         FROM brands b LEFT JOIN market_niches n ON n.id = b.niche_id
         ORDER BY b.created_at`
      )
    ).rows;
    const assets = (await pool.query(`SELECT * FROM brand_meta_assets ORDER BY asset_type`)).rows;
    return brands.map(b => {
      const own = assets.filter(a => a.brand_id === b.id);
      const checklist = ASSET_TYPES.map(t => own.find(a => a.asset_type === t) || { asset_type: t, status: 'PENDING_OPERATOR', external_id: null, handle: null });
      const done = checklist.filter(a => ['LINKED', 'VERIFIED', 'NOT_NEEDED'].includes(a.status)).length;
      return { ...b, assets: checklist, assets_done: done, assets_total: checklist.length };
    });
  }

  async create(pool: Pool, input: any, userId: string | null) {
    const code = normalizeBrandCode(input.code || input.name);
    const name = clean(input.name, 120);
    if (!name) throw new BrandError(400, 'Informe o nome da marca.');
    const sp = validateSpokesperson(input.spokesperson_type, input.real_person_consent_ref);
    try {
      const r = await pool.query(
        `INSERT INTO brands (code, name, niche_id, positioning, audience, tone, visual_identity, spokesperson_type, real_person_consent_ref, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::jsonb, '{}'::jsonb), $8, $9, $10) RETURNING *`,
        [
          code, name, input.niche_id || null, clean(input.positioning, 2000), clean(input.audience, 2000), clean(input.tone, 500),
          input.visual_identity ? JSON.stringify(input.visual_identity) : null, sp.type, sp.consent, userId
        ]
      );
      return r.rows[0];
    } catch (err: any) {
      if (err?.code === '23505') throw new BrandError(409, 'Já existe uma marca com esse código.');
      throw err;
    }
  }

  async update(pool: Pool, id: string, patch: any) {
    const current = (await pool.query(`SELECT * FROM brands WHERE id = $1`, [id])).rows[0];
    if (!current) throw new BrandError(404, 'Marca não encontrada.');
    if (patch.status !== undefined && !BRAND_STATUS.includes(String(patch.status))) throw new BrandError(400, 'Status de marca inválido.');
    const spChanged = patch.spokesperson_type !== undefined || patch.real_person_consent_ref !== undefined;
    const sp = spChanged
      ? validateSpokesperson(
          patch.spokesperson_type ?? current.spokesperson_type,
          patch.real_person_consent_ref !== undefined ? patch.real_person_consent_ref : current.real_person_consent_ref
        )
      : { type: current.spokesperson_type, consent: current.real_person_consent_ref };
    const r = await pool.query(
      `UPDATE brands SET name = COALESCE($2, name), positioning = COALESCE($3, positioning), audience = COALESCE($4, audience),
              tone = COALESCE($5, tone), status = COALESCE($6, status), spokesperson_type = $7, real_person_consent_ref = $8,
              visual_identity = COALESCE($9::jsonb, visual_identity), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [
        id, clean(patch.name, 120), clean(patch.positioning, 2000), clean(patch.audience, 2000), clean(patch.tone, 500),
        patch.status ?? null, sp.type, sp.consent, patch.visual_identity ? JSON.stringify(patch.visual_identity) : null
      ]
    );
    return r.rows[0];
  }

  /** Operador registra um ativo criado à mão (Página, Instagram, WhatsApp). */
  async recordAsset(pool: Pool, brandId: string, assetType: string, input: any) {
    if (!(ASSET_TYPES as readonly string[]).includes(assetType)) throw new BrandError(400, 'Tipo de ativo inválido.');
    const status = input.status ? String(input.status) : 'LINKED';
    if (!MANUAL_ASSET_STATUS.includes(status)) throw new BrandError(400, 'Status não permitido para registro manual.');
    const externalId = clean(input.external_id, 120);
    if (externalId && !/^[0-9]{5,30}$/.test(externalId)) throw new BrandError(400, 'ID do ativo deve conter só números.');
    const handle = clean(input.handle, 120)?.replace(/^@/, '') || null;
    if (status === 'LINKED' && !externalId && !handle) throw new BrandError(400, 'Informe o ID ou o nome de usuário do ativo.');
    const brand = (await pool.query(`SELECT id FROM brands WHERE id = $1`, [brandId])).rows[0];
    if (!brand) throw new BrandError(404, 'Marca não encontrada.');
    const r = await pool.query(
      `INSERT INTO brand_meta_assets (brand_id, asset_type, external_id, handle, status, created_by, verified_at, last_error, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'OPERATOR', NULL, NULL, NOW())
       ON CONFLICT (brand_id, asset_type) DO UPDATE SET external_id = EXCLUDED.external_id, handle = EXCLUDED.handle,
         status = EXCLUDED.status, created_by = 'OPERATOR', verified_at = NULL, last_error = NULL, updated_at = NOW()
       RETURNING *`,
      [brandId, assetType, externalId, handle, status]
    );
    return r.rows[0];
  }

  async assignProduct(pool: Pool, brandId: string, productId: string) {
    const brand = (await pool.query(`SELECT id FROM brands WHERE id = $1`, [brandId])).rows[0];
    if (!brand) throw new BrandError(404, 'Marca não encontrada.');
    const r = await pool.query(`UPDATE products SET brand_id = $1 WHERE id = $2 RETURNING id, name, brand_id`, [brandId, productId]);
    if (!r.rows[0]) throw new BrandError(404, 'Produto não encontrado.');
    return r.rows[0];
  }
}

/**
 * Fase B (D-0009): pixel da marca para uma venda ou oferta.
 * Só um PIXEL com status VERIFIED vale. Sem ele, ou em qualquer erro, retorna null
 * e quem chamou segue com o pixel padrão (META_PIXEL_ID). Nunca lança exceção.
 */
export async function resolveBrandPixelId(pool: Pool, ref: { orderId?: string | null; offerId?: string | null }): Promise<string | null> {
  try {
    if (ref.orderId) {
      const r = await pool.query(
        `SELECT a.external_id
         FROM order_items oi
         JOIN offers o ON o.id = oi.offer_id
         JOIN products p ON p.id = o.product_id
         JOIN brand_meta_assets a ON a.brand_id = p.brand_id AND a.asset_type = 'PIXEL' AND a.status = 'VERIFIED'
         WHERE oi.order_id = $1 AND a.external_id IS NOT NULL
         LIMIT 1`,
        [ref.orderId]
      );
      return r.rows[0]?.external_id || null;
    }
    if (ref.offerId) {
      const r = await pool.query(
        `SELECT a.external_id
         FROM offers o
         JOIN products p ON p.id = o.product_id
         JOIN brand_meta_assets a ON a.brand_id = p.brand_id AND a.asset_type = 'PIXEL' AND a.status = 'VERIFIED'
         WHERE o.id = $1 AND a.external_id IS NOT NULL
         LIMIT 1`,
        [ref.offerId]
      );
      return r.rows[0]?.external_id || null;
    }
    return null;
  } catch {
    return null;
  }
}
