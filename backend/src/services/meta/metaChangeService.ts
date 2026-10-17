import { Pool } from 'pg';
import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { writeAuditLog } from '../../db/audit';
import { setMetaEntityStatus, setMetaEntityDailyBudget, planOfEntity, readMetaEntity } from '../../controllers/metaControlController';

// NORQVA-0097 (D-0097): fichas de alteração na Meta (pausar, reativar, orçamento diário).
// Pedir → revisar → autorizar → enviar → confirmar relendo a Meta.
// - O envio reaproveita as rotas de controle que já existem (mesmas travas: chave geral, credencial,
//   registro de decisão, escopo, teto, Sim, código do plano pausado, limite de orçamento).
// - "Confirmado pela Meta" só depois de reler o objeto na Meta e ver o valor pedido.
// - O id da ficha vem de quem pede: repetir o mesmo pedido não envia de novo.
// - Administrador pede e autoriza no mesmo passo. Performance pede; só a pausa sai sem esperar
//   (reduz gasto). Reativar e orçamento de Performance esperam o administrador (24 h).

export class MetaChangeError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

type EntityType = 'CAMPAIGN' | 'ADSET' | 'AD';
type Kind = 'STATUS' | 'DAILY_BUDGET';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const META_ID_RE = /^[A-Za-z0-9_-]{3,64}$/;
const ENTITY: Record<string, EntityType> = { campaign: 'CAMPAIGN', adset: 'ADSET', ad: 'AD' };
const TABLE: Record<EntityType, { table: string; idCol: string; campaignJoin: string }> = {
  CAMPAIGN: { table: 'meta_campaigns', idCol: 'meta_campaign_id', campaignJoin: 'x.meta_campaign_id' },
  ADSET: { table: 'meta_ad_sets', idCol: 'meta_adset_id', campaignJoin: '(SELECT c.meta_campaign_id FROM meta_campaigns c WHERE c.id = x.campaign_id)' },
  AD: {
    table: 'meta_ads',
    idCol: 'meta_ad_id',
    campaignJoin: '(SELECT c.meta_campaign_id FROM meta_ad_sets s JOIN meta_campaigns c ON c.id = s.campaign_id WHERE s.id = x.adset_id)'
  }
};
const APPROVAL_HOURS = 24;
const OPEN_STATES = ['AWAITING_APPROVAL', 'SENDING'];

const isDemoReq = (req: AuthenticatedRequest) => req.query.mode === 'demo';
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** Roda uma rota de controle já existente e devolve o que ela responderia (mesmas travas). */
async function runHandler(
  handler: (req: AuthenticatedRequest, res: Response) => Promise<any>,
  req: AuthenticatedRequest,
  params: Record<string, string>,
  body: Record<string, unknown>
): Promise<{ status: number; body: any }> {
  const inner: any = Object.create(req);
  inner.params = params;
  inner.body = body;
  let status = 200;
  let payload: any = null;
  const res: any = {
    status(code: number) {
      status = code;
      return res;
    },
    json(b: any) {
      payload = b;
      return res;
    }
  };
  await handler(inner, res);
  return { status, body: payload };
}

/** Compara a releitura com o pedido. */
export function readbackMatches(kind: Kind, requested: string, read: { status: string | null; daily_budget: number | null }): boolean {
  if (kind === 'STATUS') return String(read.status || '').toUpperCase() === requested;
  return read.daily_budget !== null && Math.abs(read.daily_budget - Number(requested)) < 0.005;
}

export class MetaChangeService {
  constructor(private pool: Pool) {}

  private async entity(type: EntityType, id: string, isDemo: boolean) {
    const t = TABLE[type];
    const r = await this.pool.query(
      `SELECT x.${t.idCol} AS meta_id, x.name, x.status, ${type === 'AD' ? 'NULL' : 'x.daily_budget'} AS daily_budget, ${t.campaignJoin} AS meta_campaign_id
       FROM ${t.table} x WHERE (x.${t.idCol} = $1 OR x.id::text = $1) AND x.is_demo = $2 LIMIT 1`,
      [id, isDemo]
    );
    if (r.rows.length === 0) throw new MetaChangeError(404, 'Objeto não encontrado. Sincronize a Meta primeiro.');
    return r.rows[0];
  }

  private async get(id: string, isDemo: boolean) {
    if (!UUID_RE.test(String(id || ''))) throw new MetaChangeError(404, 'Alteração não encontrada.');
    const r = await this.pool.query(`SELECT * FROM meta_change_requests WHERE id = $1 AND is_demo = $2`, [id, isDemo]);
    if (r.rows.length === 0) throw new MetaChangeError(404, 'Alteração não encontrada.');
    return r.rows[0];
  }

  async create(req: AuthenticatedRequest, body: any) {
    const isDemo = isDemoReq(req);
    const role = String(req.user?.role || '');
    if (role !== 'ADMIN' && role !== 'PERFORMANCE') throw new MetaChangeError(403, 'Só Administrador e Performance pedem alterações.');
    const id = String(body?.id || '');
    if (!UUID_RE.test(id)) throw new MetaChangeError(400, 'Pedido sem identificador.');

    // mesmo pedido de novo (toque duplo, rede): devolve a ficha, sem enviar outra vez
    const again = await this.pool.query(`SELECT * FROM meta_change_requests WHERE id = $1 AND is_demo = $2`, [id, isDemo]);
    if (again.rows.length > 0) return { change: this.sameRequest(again.rows[0], body), repeated: true };

    const type = ENTITY[String(body?.entity_type || '').toLowerCase()];
    if (!type) throw new MetaChangeError(400, 'Tipo inválido. Use campaign, adset ou ad.');
    const metaIdIn = String(body?.meta_id || '');
    if (!META_ID_RE.test(metaIdIn)) throw new MetaChangeError(400, 'Objeto inválido.');
    const kind: Kind = body?.kind === 'DAILY_BUDGET' ? 'DAILY_BUDGET' : body?.kind === 'STATUS' ? 'STATUS' : (null as any);
    if (!kind) throw new MetaChangeError(400, 'Alteração inválida. Use STATUS ou DAILY_BUDGET.');

    let requested: string;
    if (kind === 'STATUS') {
      requested = String(body?.value || '').toUpperCase();
      if (requested !== 'ACTIVE' && requested !== 'PAUSED') throw new MetaChangeError(400, 'Situação inválida. Use ACTIVE ou PAUSED.');
    } else {
      if (type === 'AD') throw new MetaChangeError(400, 'Orçamento só em campanha ou conjunto.');
      const n = Number(body?.value);
      if (!Number.isFinite(n) || n <= 0) throw new MetaChangeError(400, 'Informe o orçamento diário em reais.');
      requested = money(n);
    }

    const ent = await this.entity(type, metaIdIn, isDemo);
    const owner = await planOfEntity(this.pool, type, String(ent.meta_id), isDemo).catch(() => null);
    const previous =
      kind === 'STATUS' ? (ent.status ? String(ent.status).toUpperCase() : null) : ent.daily_budget !== null && ent.daily_budget !== undefined ? money(parseFloat(ent.daily_budget)) : null;
    const immediate = role === 'ADMIN' || (kind === 'STATUS' && requested === 'PAUSED');
    const scope = body?.scope_campaign ? String(body.scope_campaign).slice(0, 64) : null;

    const ins = await this.pool.query(
      `INSERT INTO meta_change_requests
         (id, plan_id, plan_code, entity_type, meta_id, entity_name, meta_campaign_id, kind, previous_value, requested_value, state,
          requested_by, requested_by_name, requested_by_role, scope_campaign, expires_at, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (id) DO NOTHING RETURNING *`,
      [
        id,
        owner?.plan?.id || null,
        owner?.plan?.code || null,
        type,
        String(ent.meta_id),
        ent.name || null,
        ent.meta_campaign_id ? String(ent.meta_campaign_id) : null,
        kind,
        previous,
        requested,
        immediate ? 'SENDING' : 'AWAITING_APPROVAL',
        UUID_RE.test(String(req.user?.id || '')) ? req.user!.id : null,
        req.user?.name || null,
        role,
        scope,
        immediate ? null : new Date(Date.now() + APPROVAL_HOURS * 3600 * 1000),
        isDemo
      ]
    );
    if (ins.rows.length === 0) {
      const r = await this.pool.query(`SELECT * FROM meta_change_requests WHERE id = $1`, [id]);
      if (!r.rows[0] || Boolean(r.rows[0].is_demo) !== isDemo) throw new MetaChangeError(409, 'Identificador de pedido já usado.');
      return { change: this.sameRequest(r.rows[0], body), repeated: true };
    }
    const change = ins.rows[0];
    await writeAuditLog(
      this.pool,
      change.requested_by,
      'META_CHANGE_REQUESTED',
      `Alteração pedida: ${label(change)} em ${change.entity_name || change.meta_id}${change.plan_code ? ` (plano ${change.plan_code})` : ''}`,
      previous,
      requested,
      isDemo
    );
    if (!immediate) return { change };
    return { change: await this.execute(req, change, { approvedBy: role === 'ADMIN' ? req.user : null, confirmCode: body?.confirm_code }) };
  }

  /** O id repetido precisa ser do mesmo pedido (mesmo objeto, mesma alteração). */
  private sameRequest(row: any, body: any) {
    const kind = body?.kind === 'DAILY_BUDGET' ? 'DAILY_BUDGET' : 'STATUS';
    const value = kind === 'STATUS' ? String(body?.value || '').toUpperCase() : Number.isFinite(Number(body?.value)) ? money(Number(body.value)) : '';
    if (row.kind !== kind || String(row.requested_value) !== value) {
      throw new MetaChangeError(409, 'Identificador de pedido já usado para outra alteração.');
    }
    return row;
  }

  async approve(req: AuthenticatedRequest, id: string, body: any) {
    if (req.user?.role !== 'ADMIN') throw new MetaChangeError(403, 'Só o administrador autoriza.');
    const isDemo = isDemoReq(req);
    await this.expireOld(isDemo);
    const claimed = await this.pool.query(
      `UPDATE meta_change_requests SET state = 'SENDING', updated_at = NOW()
       WHERE id = $1 AND is_demo = $2 AND state = 'AWAITING_APPROVAL' AND (expires_at IS NULL OR expires_at > NOW()) RETURNING *`,
      [id, isDemo]
    );
    if (claimed.rows.length === 0) {
      const c = await this.get(id, isDemo);
      throw new MetaChangeError(409, c.state === 'EXPIRED' ? 'O pedido expirou (24 h). Peça de novo se ainda fizer sentido.' : 'Este pedido já foi tratado.');
    }
    return { change: await this.execute(req, claimed.rows[0], { approvedBy: req.user, confirmCode: body?.confirm_code }) };
  }

  async reject(req: AuthenticatedRequest, id: string, cancel: boolean) {
    const isDemo = isDemoReq(req);
    const c = await this.get(id, isDemo);
    const isAdmin = req.user?.role === 'ADMIN';
    if (!cancel && !isAdmin) throw new MetaChangeError(403, 'Só o administrador recusa.');
    if (cancel && !isAdmin && String(c.requested_by) !== String(req.user?.id)) throw new MetaChangeError(403, 'Só quem pediu (ou o administrador) cancela.');
    const next = cancel ? 'CANCELLED' : 'REJECTED';
    const r = await this.pool.query(
      `UPDATE meta_change_requests SET state = $3, approved_by = $4, approved_by_name = $5, updated_at = NOW()
       WHERE id = $1 AND is_demo = $2 AND state = 'AWAITING_APPROVAL' RETURNING *`,
      [id, isDemo, next, UUID_RE.test(String(req.user?.id || '')) ? req.user!.id : null, req.user?.name || null]
    );
    if (r.rows.length === 0) throw new MetaChangeError(409, 'Este pedido já foi tratado.');
    await writeAuditLog(this.pool, req.user?.id || null, cancel ? 'META_CHANGE_CANCELLED' : 'META_CHANGE_REJECTED', `Pedido ${cancel ? 'cancelado' : 'recusado'}: ${label(c)} em ${c.entity_name || c.meta_id}`, c.previous_value, c.requested_value, isDemo);
    return { change: r.rows[0] };
  }

  /** Releitura manual ("Conferir agora") de uma alteração aceita pela Meta e ainda não confirmada. */
  async verify(req: AuthenticatedRequest, id: string) {
    const c = await this.get(id, isDemoReq(req));
    if (c.state !== 'UNCONFIRMED') throw new MetaChangeError(409, 'Só alterações aguardando conferência podem ser conferidas.');
    return { change: await this.readback(c) };
  }

  async list(req: AuthenticatedRequest, filter: { planId?: string; campaign?: string; state?: string }) {
    const isDemo = isDemoReq(req);
    await this.expireOld(isDemo);
    const where: string[] = ['is_demo = $1'];
    const params: any[] = [isDemo];
    if (filter.planId && UUID_RE.test(filter.planId)) {
      params.push(filter.planId);
      where.push(`plan_id = $${params.length}`);
    }
    if (filter.campaign && META_ID_RE.test(filter.campaign)) {
      params.push(filter.campaign);
      where.push(`meta_campaign_id = $${params.length}`);
    }
    if (filter.state && /^[A-Z_]{3,30}$/.test(filter.state)) {
      params.push(filter.state);
      where.push(`state = $${params.length}`);
    }
    const r = await this.pool.query(`SELECT * FROM meta_change_requests WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 100`, params);
    // releitura automática das que a Meta aceitou mas ainda não confirmaram (no máximo 3 por vez, a cada 2 min)
    const stale = r.rows
      .filter((c) => c.state === 'UNCONFIRMED' && (!c.verified_at || Date.now() - new Date(c.verified_at).getTime() > 120000))
      .slice(0, 3);
    for (const c of stale) {
      const updated = await this.readback(c).catch(() => c);
      const i = r.rows.findIndex((x) => x.id === c.id);
      if (i >= 0) r.rows[i] = updated;
    }
    return { changes: r.rows };
  }

  private async expireOld(isDemo: boolean) {
    await this.pool.query(
      `UPDATE meta_change_requests SET state = 'EXPIRED', updated_at = NOW() WHERE is_demo = $1 AND state = 'AWAITING_APPROVAL' AND expires_at < NOW()`,
      [isDemo]
    );
    // "Enviando" há mais de 5 min (queda no meio do envio): a releitura decide
    await this.pool.query(
      `UPDATE meta_change_requests SET state = 'UNCONFIRMED', updated_at = NOW() WHERE is_demo = $1 AND state = 'SENDING' AND updated_at < NOW() - INTERVAL '5 minutes'`,
      [isDemo]
    );
  }

  /** Envia pela rota de controle existente e confere relendo a Meta. A ficha já está em SENDING. */
  private async execute(req: AuthenticatedRequest, change: any, opts: { approvedBy: any; confirmCode?: unknown }) {
    try {
      return await this.executeInner(req, change, opts);
    } catch (err: any) {
      // nada fica preso em "Enviando": sem saber se a Meta recebeu, vai para conferência (a releitura decide)
      console.error('[META CHANGE] erro depois de enviar; fica aguardando conferência', err);
      const r = await this.pool
        .query(`UPDATE meta_change_requests SET state = 'UNCONFIRMED', error = $2, updated_at = NOW() WHERE id = $1 AND state = 'SENDING' RETURNING *`, [
          change.id,
          String(err?.message || 'erro interno').slice(0, 500)
        ])
        .catch(() => ({ rows: [] as any[] }));
      return r.rows[0] || { ...change, state: 'UNCONFIRMED' };
    }
  }

  private async executeInner(req: AuthenticatedRequest, change: any, opts: { approvedBy: any; confirmCode?: unknown }) {
    const approvedBy = opts.approvedBy || {};
    await this.pool.query(
      `UPDATE meta_change_requests SET approved_by = $2, approved_by_name = $3, approved_at = NOW(), sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [change.id, UUID_RE.test(String(approvedBy.id || '')) ? approvedBy.id : null, approvedBy.name || null]
    );
    const params = { entityType: change.entity_type.toLowerCase(), id: change.meta_id };
    const scope = change.scope_campaign ? { scope_campaign: change.scope_campaign } : {};
    let out: { status: number; body: any };
    try {
      out =
        change.kind === 'STATUS'
          ? await runHandler(setMetaEntityStatus, req, params, {
              status: change.requested_value,
              ...scope,
              ...(opts.confirmCode ? { confirm_code: String(opts.confirmCode) } : {})
            })
          : await runHandler(setMetaEntityDailyBudget, req, params, { daily_budget: Number(change.requested_value), ...scope });
    } catch (err: any) {
      out = { status: 500, body: { error: err?.message || 'Falha ao enviar à Meta.' } };
    }

    if (out.status !== 200) {
      const error = String(out.body?.error || 'A Meta ou uma trava do NORQVA recusou a alteração.');
      const r = await this.pool.query(`UPDATE meta_change_requests SET state = 'FAILED', error = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [change.id, error]);
      await writeAuditLog(this.pool, req.user?.id || null, 'META_CHANGE_FAILED', `Alteração não feita: ${label(change)} em ${change.entity_name || change.meta_id}`, change.previous_value, error.slice(0, 500), change.is_demo);
      return { ...r.rows[0], http_status: out.status, needs_confirm_code: out.body?.needs_confirm_code || null };
    }
    // a Meta aceitou: só fica "Confirmado" depois da releitura
    return this.readback({ ...change, state: 'UNCONFIRMED' }, true);
  }

  private async readback(change: any, first = false) {
    let state = 'UNCONFIRMED';
    let metaValue: string | null = null;
    if (change.is_demo) {
      // DEMO não fala com a Meta: não há o que reler
      state = 'CONFIRMED';
      metaValue = change.requested_value;
    } else {
      try {
        const read = await readMetaEntity(change.meta_id, change.entity_type);
        metaValue = change.kind === 'STATUS' ? read.status : read.daily_budget === null ? null : money(read.daily_budget);
        if (readbackMatches(change.kind, change.requested_value, read)) state = 'CONFIRMED';
      } catch (err) {
        console.warn('[META CHANGE] releitura falhou; fica aguardando conferência', err);
      }
    }
    const r = await this.pool.query(
      `UPDATE meta_change_requests SET state = $2, meta_value = $3, verified_at = NOW(),
              confirmed_at = CASE WHEN $4 THEN NOW() ELSE confirmed_at END, updated_at = NOW()
       WHERE id = $1 AND state IN ('SENDING', 'UNCONFIRMED') RETURNING *`,
      [change.id, state, metaValue, state === 'CONFIRMED']
    );
    const row = r.rows[0] || (await this.pool.query(`SELECT * FROM meta_change_requests WHERE id = $1`, [change.id])).rows[0];
    if (state === 'CONFIRMED' || first) {
      await writeAuditLog(
        this.pool,
        null,
        state === 'CONFIRMED' ? 'META_CHANGE_CONFIRMED' : 'META_CHANGE_UNCONFIRMED',
        `${state === 'CONFIRMED' ? 'Confirmado pela Meta' : 'Aceito pela Meta, aguardando conferência'}: ${label(change)} em ${change.entity_name || change.meta_id}`,
        change.previous_value,
        metaValue,
        change.is_demo
      );
    }
    return row;
  }
}

function label(c: { kind: string; requested_value: string }) {
  if (c.kind === 'STATUS') return c.requested_value === 'PAUSED' ? 'pausar' : 'reativar';
  return `orçamento R$ ${String(c.requested_value).replace('.', ',')}/dia`;
}

export { OPEN_STATES };
