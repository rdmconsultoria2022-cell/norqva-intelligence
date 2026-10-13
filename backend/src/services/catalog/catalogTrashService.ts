// NORQVA-0057 (contrato aprovado pelo Ricardo em 13/10/2026 17h11): excluir e restaurar produtos e ofertas.
// Excluir = lixeira (is_deleted + quando e quem). Nada é apagado do banco: pedidos, pagamentos e downloads
// dos compradores dependem do cadastro. Restaurar devolve o item pausado, sem voltar a vender sozinho.
// O mesmo "Restaurar" tira do arquivo (ARQUIVADA/ARQUIVADO), que antes não tinha volta.
import { Pool, PoolClient } from 'pg';
import { writeAuditLog } from '../../db/audit';
import { humanIdFromUrl } from '../launchPlans/launchPlanService';

export class CatalogTrashError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
// campanha que existe (ou está sendo criada) na Meta
const LIVE_PLAN_STATUSES = ['CREATING', 'CREATED_PAUSED', 'AWAITING_OPERATOR', 'APPROVED', 'ACTIVE'];
// pedido aguardando pagamento nesse prazo ainda pode virar venda (Pix e link do cartão)
const PENDING_ORDER_DAYS = 3;
const obj = (v: any) => (v && typeof v === 'object' ? v : typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return {}; } })() : {});

function confirmOk(code: unknown, humanId: string) {
  return String(code || '').trim().toUpperCase() === String(humanId).toUpperCase();
}

async function actorId(db: Pool | PoolClient, userId: string | null) {
  if (!userId || !UUID_RE.test(userId)) return null;
  return (await db.query('SELECT id FROM users WHERE id = $1', [userId])).rows[0]?.id || null;
}

/** Por que esta oferta não pode ir para a lixeira agora (lista vazia = pode). */
export async function offerBlockers(db: Pool | PoolClient, offer: any): Promise<string[]> {
  const out: string[] = [];
  if (offer.status === 'ATIVA' || offer.status === 'TESTE') {
    out.push(`A oferta está ${offer.status === 'ATIVA' ? 'ativa' : 'em teste'}: pause antes de excluir.`);
  }
  const plans = await db.query(`SELECT code, status, offer_human_id, spec FROM launch_plans WHERE status = ANY($1::text[])`, [LIVE_PLAN_STATUSES]);
  for (const p of plans.rows) {
    const ads: any[] = Array.isArray(obj(p.spec).ads) ? obj(p.spec).ads : [];
    const uses = p.offer_human_id === offer.human_id || ads.some(a => humanIdFromUrl(String(a?.destination_url || '')) === offer.human_id);
    if (uses) out.push(`A campanha ${p.code} leva para esta oferta.`);
  }
  const bumps = await db.query(
    `SELECT o.human_id FROM offer_bumps b JOIN offers o ON o.id = b.offer_id
     WHERE b.bump_offer_id = $1 AND b.is_active = TRUE AND o.is_deleted = FALSE`,
    [offer.id]
  );
  for (const b of bumps.rows) out.push(`É o adicional no Pix da oferta ${b.human_id}.`);
  const since = new Date(Date.now() - PENDING_ORDER_DAYS * 86400000).toISOString();
  const pending = await db.query(
    `SELECT count(DISTINCT o.id)::int AS n FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE oi.offer_id = $1 AND o.status = 'PENDING' AND o.created_at >= $2`,
    [offer.id, since]
  );
  const n = Number(pending.rows[0]?.n || 0);
  if (n > 0) out.push(`${n} pedido(s) aguardando pagamento (Pix ou cartão) dos últimos ${PENDING_ORDER_DAYS} dias.`);
  return out;
}

export class CatalogTrashService {
  constructor(private pool: Pool) {}

  async trash() {
    const products = await this.pool.query(
      `SELECT p.id, p.human_id, p.name, p.status, p.deleted_at, u.name AS deleted_by_name
       FROM products p LEFT JOIN users u ON u.id = p.deleted_by
       WHERE p.is_demo = FALSE AND p.is_deleted = TRUE AND p.deleted_at IS NOT NULL
       ORDER BY p.deleted_at DESC LIMIT 200`
    );
    const offers = await this.pool.query(
      `SELECT o.id, o.human_id, o.name, o.status, o.deleted_at, p.name AS product_name, p.is_deleted AS product_deleted, u.name AS deleted_by_name
       FROM offers o JOIN products p ON p.id = o.product_id LEFT JOIN users u ON u.id = o.deleted_by
       WHERE o.is_demo = FALSE AND o.is_deleted = TRUE AND o.deleted_at IS NOT NULL
       ORDER BY o.deleted_at DESC LIMIT 200`
    );
    return { products: products.rows, offers: offers.rows };
  }

  async deleteOffer(id: string, confirm: unknown, userId: string | null) {
    if (!UUID_RE.test(String(id || ''))) throw new CatalogTrashError(404, 'Oferta não encontrada.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const offer = (await client.query('SELECT * FROM offers WHERE id = $1 AND is_demo = FALSE FOR UPDATE', [id])).rows[0];
      if (!offer || offer.is_deleted) throw new CatalogTrashError(404, 'Oferta não encontrada (ou já está na lixeira).');
      if (!confirmOk(confirm, offer.human_id)) throw new CatalogTrashError(400, `Para excluir, digite o código da oferta (${offer.human_id}).`);
      const blockers = await offerBlockers(client, offer);
      if (blockers.length) throw new CatalogTrashError(409, `Não dá para excluir ${offer.human_id} agora: ${blockers.join(' ')}`);
      const actor = await actorId(client, userId);
      const upd = await client.query(
        `UPDATE offers SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2 WHERE id = $1 RETURNING id, human_id, name, status, is_deleted, deleted_at`,
        [id, actor]
      );
      await writeAuditLog(client, actor, 'OFFER_DELETED', `Oferta ${offer.human_id} (${offer.name}) foi para a lixeira.`,
        JSON.stringify({ is_deleted: false, status: offer.status }), JSON.stringify({ is_deleted: true, status: offer.status }), false, true);
      await client.query('COMMIT');
      return upd.rows[0];
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /** Tira da lixeira ou do arquivo. Volta PAUSADA (rascunho continua rascunho). */
  async restoreOffer(id: string, confirm: unknown, userId: string | null) {
    if (!UUID_RE.test(String(id || ''))) throw new CatalogTrashError(404, 'Oferta não encontrada.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const offer = (await client.query('SELECT * FROM offers WHERE id = $1 AND is_demo = FALSE FOR UPDATE', [id])).rows[0];
      if (!offer) throw new CatalogTrashError(404, 'Oferta não encontrada.');
      if (!offer.is_deleted && offer.status !== 'ARQUIVADA') throw new CatalogTrashError(409, 'A oferta não está na lixeira nem arquivada.');
      if (!confirmOk(confirm, offer.human_id)) throw new CatalogTrashError(400, `Para restaurar, digite o código da oferta (${offer.human_id}).`);
      const product = (await client.query('SELECT human_id, is_deleted FROM products WHERE id = $1', [offer.product_id])).rows[0];
      if (product?.is_deleted) throw new CatalogTrashError(409, `Restaure antes o produto ${product.human_id}.`);
      const nextStatus = offer.status === 'RASCUNHO' ? 'RASCUNHO' : 'PAUSADA';
      const actor = await actorId(client, userId);
      const upd = await client.query(
        `UPDATE offers SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, status = $2 WHERE id = $1 RETURNING id, human_id, name, status, is_deleted`,
        [id, nextStatus]
      );
      await writeAuditLog(client, actor, 'OFFER_RESTORED', `Oferta ${offer.human_id} (${offer.name}) restaurada como ${nextStatus}.`,
        JSON.stringify({ is_deleted: offer.is_deleted, status: offer.status }), JSON.stringify({ is_deleted: false, status: nextStatus }), false, true);
      await client.query('COMMIT');
      return upd.rows[0];
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async deleteProduct(id: string, confirm: unknown, userId: string | null) {
    if (!UUID_RE.test(String(id || ''))) throw new CatalogTrashError(404, 'Produto não encontrado.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const product = (await client.query('SELECT * FROM products WHERE id = $1 AND is_demo = FALSE FOR UPDATE', [id])).rows[0];
      if (!product || product.is_deleted) throw new CatalogTrashError(404, 'Produto não encontrado (ou já está na lixeira).');
      if (!confirmOk(confirm, product.human_id)) throw new CatalogTrashError(400, `Para excluir, digite o código do produto (${product.human_id}).`);
      const open = await client.query(
        `SELECT human_id FROM offers WHERE product_id = $1 AND is_deleted = FALSE AND status <> 'ARQUIVADA' ORDER BY human_id`,
        [id]
      );
      if (open.rows.length) {
        throw new CatalogTrashError(409, `Exclua ou arquive antes as ofertas deste produto: ${open.rows.map((r: any) => r.human_id).join(', ')}.`);
      }
      // ofertas arquivadas vão junto para a lixeira (voltam pelo Restaurar de cada uma)
      const archived = await client.query(`SELECT * FROM offers WHERE product_id = $1 AND is_deleted = FALSE AND status = 'ARQUIVADA'`, [id]);
      for (const o of archived.rows) {
        const blockers = (await offerBlockers(client, o)).filter(b => !b.startsWith('A oferta está'));
        if (blockers.length) throw new CatalogTrashError(409, `A oferta ${o.human_id} ainda está em uso: ${blockers.join(' ')}`);
      }
      const actor = await actorId(client, userId);
      await client.query(`UPDATE offers SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2 WHERE product_id = $1 AND is_deleted = FALSE AND status = 'ARQUIVADA'`, [id, actor]);
      const upd = await client.query(
        `UPDATE products SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2 WHERE id = $1 RETURNING id, human_id, name, status, is_deleted, deleted_at`,
        [id, actor]
      );
      await writeAuditLog(client, actor, 'PRODUCT_DELETED', `Produto ${product.human_id} (${product.name}) foi para a lixeira.`,
        JSON.stringify({ is_deleted: false, status: product.status, archived_offers: archived.rows.map((o: any) => o.human_id) }),
        JSON.stringify({ is_deleted: true }), false, true);
      await client.query('COMMIT');
      return upd.rows[0];
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /** Tira da lixeira ou do arquivo. Produto que vendia (PRONTO/ATIVO) ou arquivado volta PAUSADO; o resto mantém a situação. */
  async restoreProduct(id: string, confirm: unknown, userId: string | null) {
    if (!UUID_RE.test(String(id || ''))) throw new CatalogTrashError(404, 'Produto não encontrado.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const product = (await client.query('SELECT * FROM products WHERE id = $1 AND is_demo = FALSE FOR UPDATE', [id])).rows[0];
      if (!product) throw new CatalogTrashError(404, 'Produto não encontrado.');
      if (!product.is_deleted && product.status !== 'ARQUIVADO') throw new CatalogTrashError(409, 'O produto não está na lixeira nem arquivado.');
      if (!confirmOk(confirm, product.human_id)) throw new CatalogTrashError(400, `Para restaurar, digite o código do produto (${product.human_id}).`);
      const nextStatus = ['PRONTO', 'ATIVO', 'ARQUIVADO'].includes(product.status) ? 'PAUSADO' : product.status;
      const actor = await actorId(client, userId);
      const upd = await client.query(
        `UPDATE products SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, status = $2 WHERE id = $1 RETURNING id, human_id, name, status, is_deleted`,
        [id, nextStatus]
      );
      await writeAuditLog(client, actor, 'PRODUCT_RESTORED', `Produto ${product.human_id} (${product.name}) restaurado como ${nextStatus}. As ofertas continuam na lixeira até serem restauradas.`,
        JSON.stringify({ is_deleted: product.is_deleted, status: product.status }), JSON.stringify({ is_deleted: false, status: nextStatus }), false, true);
      await client.query('COMMIT');
      return upd.rows[0];
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
}
