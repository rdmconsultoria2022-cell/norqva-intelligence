// NORQVA-0058: lixeira de criativos, com as regras da lixeira de produtos e ofertas (D-0057, aprovada pelo
// Ricardo em 13/10/2026 17h11). Excluir leva TODAS as versões do criativo (mesma linhagem) para a lixeira;
// restaurar traz de volta as mesmas versões. Nada é apagado e nada muda na Meta.
import { Pool } from 'pg';
import { writeAuditLog } from '../../db/audit';

export class CreativeTrashError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
// planos que existem (ou estão sendo criados) na Meta
const LIVE_PLAN_STATUSES = ['CREATING', 'CREATED_PAUSED', 'AWAITING_OPERATOR', 'APPROVED', 'ACTIVE'];
const obj = (v: any) => (v && typeof v === 'object' ? v : typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return {}; } })() : {});

async function actorId(pool: Pool, userId: string | null) {
  if (!userId || !UUID_RE.test(userId)) return null;
  return (await pool.query('SELECT id FROM users WHERE id = $1', [userId])).rows[0]?.id || null;
}

async function lineageOf(pool: Pool, creativeId: string) {
  const c = (await pool.query('SELECT * FROM creatives WHERE id = $1 AND is_demo = FALSE', [creativeId])).rows[0];
  if (!c) return null;
  const root = c.root_creative_id || c.id;
  const rows = (await pool.query('SELECT * FROM creatives WHERE (id = $1 OR root_creative_id = $1) AND is_demo = FALSE', [root])).rows;
  return { creative: c, root, rows };
}

/** Por que este criativo não pode ir para a lixeira agora (lista vazia = pode). */
export async function creativeBlockers(pool: Pool, ids: string[], keys: string[]): Promise<string[]> {
  const out: string[] = [];
  // anúncio ligado à mão ou pelo nome igual à chave do criativo (como no resto do NORQVA)
  const upperKeys = Array.from(new Set(keys.map(k => k.toUpperCase())));
  const running = await pool.query(
    `SELECT DISTINCT ma.name FROM meta_ads ma
     WHERE ma.is_demo = FALSE AND ma.effective_status = 'ACTIVE'
       AND (UPPER(ma.name) = ANY($2::text[])
            OR EXISTS (SELECT 1 FROM creative_meta_ads cma WHERE cma.meta_ad_id = ma.meta_ad_id AND cma.creative_id = ANY($1::uuid[])))`,
    [ids, upperKeys]
  );
  for (const r of running.rows) out.push(`O anúncio ${r.name} está rodando na Meta com este criativo: pause antes.`);
  const adj = await pool.query(
    `SELECT count(*)::int AS n FROM creative_adjustments
     WHERE creative_id = ANY($1::uuid[]) AND status IN ('QUEUED', 'DISPATCHED', 'IN_PROGRESS', 'NEEDS_INPUT')`,
    [ids]
  );
  if (Number(adj.rows[0]?.n || 0) > 0) out.push('Há um ajuste deste criativo em andamento com o Claude: espere terminar.');
  const plans = await pool.query(`SELECT code, spec, ad_creatives FROM launch_plans WHERE status = ANY($1::text[])`, [LIVE_PLAN_STATUSES]);
  const keySet = new Set(keys.map(k => k.toUpperCase()));
  for (const p of plans.rows) {
    const chosen = Object.values(obj(p.ad_creatives)).map(String);
    const ads: any[] = Array.isArray(obj(p.spec).ads) ? obj(p.spec).ads : [];
    if (chosen.some(id => ids.includes(id)) || ads.some(a => keySet.has(String(a?.name || '').toUpperCase()))) {
      out.push(`A campanha ${p.code} usa este criativo.`);
    }
  }
  return out;
}

export class CreativeTrashService {
  constructor(private pool: Pool) {}

  /** Uma linha por criativo excluído (a versão mais nova da linhagem). */
  async trash() {
    const r = await this.pool.query(
      `SELECT c.id, c.human_id, c.hook, c.headline, c.version, c.approval_status, c.deleted_at, c.root_creative_id, u.name AS deleted_by_name,
              p.name AS product_name
       FROM creatives c LEFT JOIN users u ON u.id = c.deleted_by LEFT JOIN products p ON p.id = c.product_id
       WHERE c.is_demo = FALSE AND c.is_deleted = TRUE AND c.deleted_at IS NOT NULL
       ORDER BY c.deleted_at DESC, c.version DESC LIMIT 500`
    );
    const seen = new Set<string>();
    const out: any[] = [];
    for (const row of r.rows) {
      const root = String(row.root_creative_id || row.id);
      if (seen.has(root)) continue;
      seen.add(root);
      out.push(row);
    }
    return { creatives: out.slice(0, 200) };
  }

  async deleteCreative(id: string, confirm: unknown, userId: string | null) {
    if (!UUID_RE.test(String(id || ''))) throw new CreativeTrashError(404, 'Criativo não encontrado.');
    const lin = await lineageOf(this.pool, id);
    if (!lin || lin.creative.is_deleted) throw new CreativeTrashError(404, 'Criativo não encontrado (ou já está na lixeira).');
    const hid = String(lin.creative.human_id);
    if (String(confirm || '').trim().toUpperCase() !== hid.toUpperCase()) {
      throw new CreativeTrashError(400, `Para excluir, digite o código do criativo (${hid}).`);
    }
    const live = lin.rows.filter((r: any) => !r.is_deleted);
    const ids = live.map((r: any) => String(r.id));
    const keys = live.flatMap((r: any) => [r.human_id, r.utm_content_key].filter(Boolean).map(String));
    const blockers = await creativeBlockers(this.pool, ids, keys);
    if (blockers.length) throw new CreativeTrashError(409, `Não dá para excluir ${hid} agora: ${blockers.join(' ')}`);
    const actor = await actorId(this.pool, userId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const stamp = (await client.query('SELECT NOW() AS t')).rows[0].t;
      const upd = await client.query(
        `UPDATE creatives SET is_deleted = TRUE, deleted_at = $2, deleted_by = $3, updated_at = NOW()
         WHERE id = ANY($1::uuid[]) AND is_deleted = FALSE RETURNING id`,
        [ids, stamp, actor]
      );
      await writeAuditLog(client, actor, 'CREATIVE_DELETED', `Criativo ${hid} foi para a lixeira (${upd.rows.length} versão(ões)).`,
        JSON.stringify({ is_deleted: false, versions: live.map((r: any) => r.human_id) }), JSON.stringify({ is_deleted: true }), false, true);
      await client.query('COMMIT');
      return { id, human_id: hid, versions: upd.rows.length };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async restoreCreative(id: string, confirm: unknown, userId: string | null) {
    if (!UUID_RE.test(String(id || ''))) throw new CreativeTrashError(404, 'Criativo não encontrado.');
    const lin = await lineageOf(this.pool, id);
    if (!lin || !lin.creative.is_deleted || !lin.creative.deleted_at) throw new CreativeTrashError(409, 'O criativo não está na lixeira.');
    const hid = String(lin.creative.human_id);
    if (String(confirm || '').trim().toUpperCase() !== hid.toUpperCase()) {
      throw new CreativeTrashError(400, `Para restaurar, digite o código do criativo (${hid}).`);
    }
    // volta só o que saiu junto (mesmo momento da exclusão)
    const stamp = new Date(lin.creative.deleted_at).getTime();
    const ids = lin.rows.filter((r: any) => r.is_deleted && r.deleted_at && new Date(r.deleted_at).getTime() === stamp).map((r: any) => String(r.id));
    const actor = await actorId(this.pool, userId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const upd = await client.query(
        `UPDATE creatives SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, updated_at = NOW() WHERE id = ANY($1::uuid[]) RETURNING id`,
        [ids]
      );
      await writeAuditLog(client, actor, 'CREATIVE_RESTORED', `Criativo ${hid} restaurado da lixeira (${upd.rows.length} versão(ões)).`,
        JSON.stringify({ is_deleted: true }), JSON.stringify({ is_deleted: false }), false, true);
      await client.query('COMMIT');
      return { id, human_id: hid, versions: upd.rows.length };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
}
