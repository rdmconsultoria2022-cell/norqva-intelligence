import { Pool } from 'pg';
import { getCommercialOrderClause } from '../utils/commercialTruthPolicy';

export type SalesAggregateFilter = 'ALL' | 'PAID' | 'PENDING' | 'PROBLEM';
export interface SalesAggregateOptions {
  isDemo: boolean;
  includeTests: boolean;
  filter: SalesAggregateFilter;
  startIso: string | null;
  endIso: string | null;
}

/**
 * Independent financial aggregate: no presentation LIMIT, no customer PII.
 * Revenue here is PAID gross order value, NOT settled/net cash.
 * Keep the exact commercial provenance and date semantics of the sales list.
 */
export async function aggregateSales(pool: Pool, opts: SalesAggregateOptions) {
  const orderEligibility = opts.includeTests
    ? `o.is_demo = ${opts.isDemo ? 'TRUE' : 'FALSE'}`
    : getCommercialOrderClause('o', opts.isDemo);
  const externalEligibility = opts.includeTests
    ? `e.is_demo = ${opts.isDemo ? 'TRUE' : 'FALSE'}`
    : getCommercialOrderClause('e', opts.isDemo);
  const orderStatus = opts.filter === 'PAID' ? "AND o.status = 'PAID'"
    : opts.filter === 'PENDING' ? "AND o.status = 'PENDING'"
    : opts.filter === 'PROBLEM' ? `AND o.status = 'PAID' AND (
        (COALESCE(dl.downloads,0) = 0 AND pay.confirmed_at < NOW() - INTERVAL '30 minutes')
        OR COALESCE(dl.expired,0) > 0 OR COALESCE(oae.has_failed,FALSE))` : '';
  const externalEnabled = opts.filter !== 'PENDING' && opts.filter !== 'PROBLEM';
  const externalStatus = opts.filter === 'PAID' ? "AND e.status = 'PAID'" : '';
  const query = `
    WITH internal AS (
      SELECT o.id, o.status, o.total_amount,
        (o.status = 'PAID' AND (
          (COALESCE(dl.downloads,0) = 0 AND pay.confirmed_at < NOW() - INTERVAL '30 minutes')
          OR COALESCE(dl.expired,0) > 0 OR COALESCE(oae.has_failed,FALSE)
        )) AS problem
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      LEFT JOIN LATERAL (
        SELECT p.confirmed_at FROM payments p WHERE p.order_id=o.id
        ORDER BY p.created_at DESC LIMIT 1
      ) pay ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(d.download_count)::int AS downloads,
          COUNT(*) FILTER (WHERE d.status='EXPIRED')::int AS expired
        FROM order_deliveries d WHERE d.order_id=o.id
      ) dl ON TRUE
      LEFT JOIN LATERAL (
        SELECT BOOL_OR(a.status = 'FAILED') AS has_failed
        FROM order_access_emails a WHERE a.order_id=o.id
      ) oae ON TRUE
      WHERE ${orderEligibility}
        AND ($1::timestamptz IS NULL OR o.created_at >= $1::timestamptz)
        AND ($2::timestamptz IS NULL OR o.created_at <= $2::timestamptz)
        ${orderStatus}
    ),
    external AS (
      SELECT e.id, e.status, e.gross_amount AS total_amount, FALSE AS problem
      FROM external_sales e
      WHERE ${externalEligibility}
        AND ($1::timestamptz IS NULL OR COALESCE(e.approved_at,e.created_at) >= $1::timestamptz)
        AND ($2::timestamptz IS NULL OR COALESCE(e.approved_at,e.created_at) <= $2::timestamptz)
        AND $3::boolean
        ${externalStatus}
    ),
    combined AS (
      SELECT status,total_amount,problem FROM internal
      UNION ALL
      SELECT status,total_amount,problem FROM external
    )
    SELECT COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE status='PAID')::bigint AS paid,
      COUNT(*) FILTER (WHERE status='PENDING')::bigint AS pending,
      COUNT(*) FILTER (WHERE problem)::bigint AS problem,
      COALESCE(SUM(total_amount) FILTER (WHERE status='PAID'),0)::numeric AS revenue
    FROM combined`;
  const r = await pool.query(query, [opts.startIso, opts.endIso, externalEnabled]);
  const x = r.rows[0];
  return {
    total: Number(x.total), paid: Number(x.paid), pending: Number(x.pending),
    problem: Number(x.problem), revenue: Math.round(Number(x.revenue) * 100) / 100
  };
}
