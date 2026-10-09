import { Pool, PoolClient } from 'pg';
import { writeAuditLog } from '../../db/audit';

// NORQVA-0032: adicional na hora do Pix (order bump).
// Regras: o preço cobrado vem SEMPRE daqui (servidor); a caixinha nasce desmarcada no checkout; o adicional
// é outra oferta, com arquivo próprio e sem arquivo em comum com a oferta principal; a entrega dos dois só
// acontece com o pedido PAID (fluxo de entrega já existente, que percorre todos os itens do pedido).

export class OfferBumpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Q = Pool | PoolClient;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELLABLE = ['ATIVA', 'TESTE'];
export const BUMP_MAX_PRICE = 500;

export interface ActiveBump {
  bump_offer: any;
  bump_product: any;
  price: number;
  headline: string | null;
}

async function assetIds(q: Q, offerId: string): Promise<string[]> {
  const r = await q.query('SELECT asset_id FROM offer_digital_assets WHERE offer_id = $1', [offerId]);
  return r.rows.map((x: any) => String(x.asset_id));
}

/** Motivo pelo qual o adicional não pode ser vendido agora (null = pode). */
async function sellBlocker(q: Q, mainOffer: any, bumpOffer: any): Promise<string | null> {
  if (!bumpOffer || bumpOffer.is_deleted) return 'A oferta do adicional não existe mais.';
  if (Boolean(bumpOffer.is_demo) !== Boolean(mainOffer.is_demo)) return 'O adicional precisa ser do mesmo ambiente (real ou demonstração) da oferta.';
  if (!SELLABLE.includes(bumpOffer.status)) return 'A oferta do adicional precisa estar em TESTE ou ATIVA.';
  const [mainAssets, bumpAssets] = await Promise.all([assetIds(q, mainOffer.id), assetIds(q, bumpOffer.id)]);
  if (bumpAssets.length === 0) return 'A oferta do adicional ainda não tem arquivo de entrega.';
  if (bumpAssets.some(a => mainAssets.includes(a))) return 'O adicional e a oferta principal têm o mesmo arquivo: cada um precisa do seu.';
  return null;
}

export class OfferBumpService {
  /** Adicional ligado e vendável para esta oferta, ou null. Usado no checkout (dentro da transação). */
  async active(q: Q, mainOffer: any): Promise<ActiveBump | null> {
    const r = await q.query(
      `SELECT b.*, row_to_json(o) AS bump_offer
       FROM offer_bumps b JOIN offers o ON o.id = b.bump_offer_id
       WHERE b.offer_id = $1 AND b.is_active = TRUE AND b.is_demo = $2`,
      [mainOffer.id, Boolean(mainOffer.is_demo)]
    );
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    const bumpOffer = typeof row.bump_offer === 'string' ? JSON.parse(row.bump_offer) : row.bump_offer;
    if (await sellBlocker(q, mainOffer, bumpOffer)) return null;
    const p = await q.query('SELECT * FROM products WHERE id = $1 AND is_deleted = FALSE', [bumpOffer.product_id]);
    if (p.rows.length === 0) return null;
    if (Boolean(p.rows[0].is_demo) !== Boolean(mainOffer.is_demo)) return null;
    return { bump_offer: bumpOffer, bump_product: p.rows[0], price: Math.round(parseFloat(row.bump_price) * 100) / 100, headline: row.headline || null };
  }

  /** O que a página pública mostra (sem ids internos além do código da oferta). */
  async publicView(pool: Pool, mainOffer: any) {
    try {
      const b = await this.active(pool, mainOffer);
      if (!b) return null;
      return { offer_human_id: b.bump_offer.human_id, name: b.bump_offer.name, headline: b.headline, price: b.price };
    } catch {
      return null; // o checkout nunca quebra por causa do adicional
    }
  }

  async get(pool: Pool, offerId: string) {
    if (!UUID_RE.test(offerId)) throw new OfferBumpError(404, 'Oferta não encontrada.');
    const o = await pool.query('SELECT * FROM offers WHERE id = $1 AND is_deleted = FALSE', [offerId]);
    if (o.rows.length === 0) throw new OfferBumpError(404, 'Oferta não encontrada.');
    const r = await pool.query(
      `SELECT b.*, bo.human_id AS bump_offer_human_id, bo.name AS bump_offer_name, bo.status AS bump_offer_status
       FROM offer_bumps b JOIN offers bo ON bo.id = b.bump_offer_id WHERE b.offer_id = $1`,
      [offerId]
    );
    const row = r.rows[0] || null;
    let blocker: string | null = null;
    if (row) {
      const bo = await pool.query('SELECT * FROM offers WHERE id = $1', [row.bump_offer_id]);
      blocker = await sellBlocker(pool, o.rows[0], bo.rows[0]);
    }
    return {
      offer_id: offerId,
      bump: row
        ? {
            bump_offer_id: row.bump_offer_id,
            bump_offer_human_id: row.bump_offer_human_id,
            bump_offer_name: row.bump_offer_name,
            bump_offer_status: row.bump_offer_status,
            bump_price: parseFloat(row.bump_price),
            headline: row.headline,
            is_active: row.is_active,
            updated_at: row.updated_at
          }
        : null,
      sellable: !!row && row.is_active && !blocker,
      blocker
    };
  }

  async save(pool: Pool, offerId: string, input: any, userId: string | null) {
    if (!UUID_RE.test(offerId)) throw new OfferBumpError(404, 'Oferta não encontrada.');
    const main = (await pool.query('SELECT * FROM offers WHERE id = $1 AND is_deleted = FALSE', [offerId])).rows[0];
    if (!main) throw new OfferBumpError(404, 'Oferta não encontrada.');
    const bumpOfferId = String(input?.bump_offer_id || '');
    if (!UUID_RE.test(bumpOfferId)) throw new OfferBumpError(400, 'Escolha a oferta do adicional.');
    if (bumpOfferId === offerId) throw new OfferBumpError(400, 'O adicional precisa ser outra oferta.');
    const bump = (await pool.query('SELECT * FROM offers WHERE id = $1 AND is_deleted = FALSE', [bumpOfferId])).rows[0];
    if (!bump) throw new OfferBumpError(404, 'Oferta do adicional não encontrada.');
    if (Boolean(bump.is_demo) !== Boolean(main.is_demo)) throw new OfferBumpError(400, 'O adicional precisa ser do mesmo ambiente (real ou demonstração) da oferta.');
    const price = Math.round(Number(String(input?.bump_price ?? '').replace(',', '.')) * 100) / 100;
    if (!Number.isFinite(price) || price < 1 || price > BUMP_MAX_PRICE) throw new OfferBumpError(400, `Preço do adicional: use um valor entre R$ 1,00 e R$ ${BUMP_MAX_PRICE},00.`);
    const headline = input?.headline === undefined || input?.headline === null ? null : String(input.headline).trim().slice(0, 200) || null;
    const isActive = input?.is_active === true;
    if (isActive) {
      const blocker = await sellBlocker(pool, main, bump);
      if (blocker) throw new OfferBumpError(409, `${blocker} O adicional não foi ligado.`);
    } else {
      // Mesmo desligado, não aceita arquivo em comum (evita surpresa ao ligar depois)
      const [a, b] = await Promise.all([assetIds(pool, main.id), assetIds(pool, bump.id)]);
      if (b.some(x => a.includes(x))) throw new OfferBumpError(409, 'O adicional e a oferta principal têm o mesmo arquivo: cada um precisa do seu.');
    }
    const prev = await pool.query('SELECT bump_offer_id, bump_price, headline, is_active FROM offer_bumps WHERE offer_id = $1', [offerId]);
    await pool.query(
      `INSERT INTO offer_bumps (offer_id, bump_offer_id, bump_price, headline, is_active, is_demo, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (offer_id) DO UPDATE SET bump_offer_id = EXCLUDED.bump_offer_id, bump_price = EXCLUDED.bump_price,
         headline = EXCLUDED.headline, is_active = EXCLUDED.is_active, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [offerId, bumpOfferId, price, headline, isActive, Boolean(main.is_demo), userId]
    );
    await writeAuditLog(
      pool,
      userId,
      'OFFER_BUMP_SAVED',
      `${main.human_id}: adicional ${bump.human_id} por R$ ${price.toFixed(2)} ${isActive ? 'LIGADO' : 'desligado'}`,
      prev.rows[0] ? JSON.stringify(prev.rows[0]) : null,
      JSON.stringify({ bump_offer_id: bumpOfferId, bump_price: price, headline, is_active: isActive }),
      Boolean(main.is_demo)
    ).catch(() => {});
    return this.get(pool, offerId);
  }
}
