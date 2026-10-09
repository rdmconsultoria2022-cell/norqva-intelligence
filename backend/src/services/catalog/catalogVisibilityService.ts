import { Pool } from 'pg';
import { writeAuditLog } from '../../db/audit';

// NORQVA-0034: produtos da conta real que nasceram com procedência "UNKNOWN" (criados pela tela antes desta
// correção) não aparecem em Produtos/Ofertas. O ADMIN vê a lista e traz cada um, de propósito, para a produção
// comercial (produto + ofertas dele que também estavam UNKNOWN). Nada é feito sozinho; dados de teste (QA) e de
// demonstração ficam de fora.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CatalogVisibilityError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class CatalogVisibilityService {
  constructor(private pool: Pool) {}

  async hidden() {
    const r = await this.pool.query(
      `SELECT p.id, p.human_id, p.name, p.category, p.status, p.created_at,
              (SELECT count(*)::int FROM offers o WHERE o.product_id = p.id AND o.is_deleted = FALSE) AS offers_count
       FROM products p
       WHERE p.is_demo = FALSE AND p.is_deleted = FALSE AND p.data_provenance = 'UNKNOWN'
       ORDER BY p.created_at DESC LIMIT 50`
    );
    const t = await this.pool.query(`SELECT count(*)::int AS n FROM products WHERE is_demo = FALSE AND is_deleted = FALSE AND data_provenance = 'UNKNOWN'`);
    return { products: r.rows, total: t.rows[0].n };
  }

  async promote(productId: string, userId: string | null) {
    if (!UUID_RE.test(String(productId))) throw new CatalogVisibilityError(404, 'Produto não encontrado.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const p = (await client.query('SELECT * FROM products WHERE id = $1 AND is_deleted = FALSE FOR UPDATE', [productId])).rows[0];
      if (!p) throw new CatalogVisibilityError(404, 'Produto não encontrado.');
      if (p.is_demo) throw new CatalogVisibilityError(409, 'Produto de demonstração não entra na conta real.');
      if (p.data_provenance !== 'UNKNOWN') {
        throw new CatalogVisibilityError(
          409,
          p.data_provenance === 'COMMERCIAL_PRODUCTION' ? 'Este produto já está na lista.' : `Este produto tem outra classificação (${p.data_provenance}) e não é trazido por aqui.`
        );
      }
      await client.query(`UPDATE products SET data_provenance = 'COMMERCIAL_PRODUCTION' WHERE id = $1`, [p.id]);
      const offers = await client.query(
        `UPDATE offers SET data_provenance = 'COMMERCIAL_PRODUCTION'
         WHERE product_id = $1 AND is_demo = FALSE AND is_deleted = FALSE AND data_provenance = 'UNKNOWN'
         RETURNING human_id`,
        [p.id]
      );
      const actor = userId && UUID_RE.test(userId) ? ((await client.query('SELECT id FROM users WHERE id = $1', [userId])).rows[0]?.id || null) : null;
      await writeAuditLog(
        client,
        actor,
        'PRODUCT_BROUGHT_TO_COMMERCIAL',
        `${p.human_id} (${p.name}) trazido para a produção comercial${offers.rows.length ? ` com as ofertas ${offers.rows.map((o: any) => o.human_id).join(', ')}` : ''}`,
        JSON.stringify({ data_provenance: 'UNKNOWN' }),
        JSON.stringify({ data_provenance: 'COMMERCIAL_PRODUCTION', offers: offers.rows.map((o: any) => o.human_id) }),
        false,
        true
      );
      await client.query('COMMIT');
      return { product_id: p.id, human_id: p.human_id, offers: offers.rows.map((o: any) => o.human_id) };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
}
