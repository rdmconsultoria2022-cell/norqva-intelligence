import { Request, Response } from 'express';
import { Pool } from 'pg';

const ALLOWED_EVENT_TYPES = ['LANDING_PAGE_VIEW', 'OFFER_VIEW', 'CHECKOUT_STARTED'] as const;
type AllowedEventType = typeof ALLOWED_EVENT_TYPES[number];

export async function recordFunnelEvent(req: Request, res: Response) {
  const pool: Pool = req.app.get('db');
  if (!pool) {
    return res.status(500).json({ error: 'Database connection not available.' });
  }

  const isDemo = req.query.mode === 'demo';
  const body = req.body || {};

  // 1. Strict Validation
  const event_id = typeof body.event_id === 'string' ? body.event_id.trim().slice(0, 255) : null;
  const event_type = typeof body.event_type === 'string' ? body.event_type.trim().toUpperCase() : null;
  const visitor_id = typeof body.visitor_id === 'string' ? body.visitor_id.trim().slice(0, 100) : null;
  const session_id = typeof body.session_id === 'string' ? body.session_id.trim().slice(0, 100) : null;
  const offer_human_id = typeof body.offer_human_id === 'string' ? body.offer_human_id.trim().slice(0, 100) : null;
  const path = typeof body.path === 'string' ? body.path.trim().slice(0, 500) : null;
  const fbclid = typeof body.fbclid === 'string' ? body.fbclid.trim().slice(0, 255) : null;
  const utm_source = typeof body.utm_source === 'string' ? body.utm_source.trim().slice(0, 255) : null;
  const utm_medium = typeof body.utm_medium === 'string' ? body.utm_medium.trim().slice(0, 255) : null;
  const utm_campaign = typeof body.utm_campaign === 'string' ? body.utm_campaign.trim().slice(0, 255) : null;
  const utm_content = typeof body.utm_content === 'string' ? body.utm_content.trim().slice(0, 255) : null;

  if (!event_id) {
    return res.status(400).json({ error: 'event_id is required.' });
  }

  if (!event_type || !ALLOWED_EVENT_TYPES.includes(event_type as AllowedEventType)) {
    return res.status(400).json({ error: `Invalid event_type. Allowed types: ${ALLOWED_EVENT_TYPES.join(', ')}` });
  }

  if (!visitor_id) {
    return res.status(400).json({ error: 'visitor_id is required.' });
  }

  // Sanitize metadata - strictly exclude financial/status mutation attempts
  let metadata: Record<string, any> | null = null;
  if (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
    const raw = { ...body.metadata };
    delete raw.status;
    delete raw.payment_status;
    delete raw.total_amount;
    delete raw.price;
    delete raw.amount;
    delete raw.order_id;
    metadata = Object.keys(raw).length > 0 ? raw : null;
  }

  try {
    // 2. Resolve offer_id if offer_human_id is provided
    let resolvedOfferId: string | null = null;
    if (offer_human_id) {
      const offerRes = await pool.query(
        'SELECT id FROM offers WHERE human_id = $1 AND is_demo = $2 LIMIT 1',
        [offer_human_id, isDemo]
      );
      if (offerRes.rows.length > 0) {
        resolvedOfferId = offerRes.rows[0].id;
      }
    }

    // 3. Idempotent Upsert (Deduplicated on event_id, is_demo)
    const query = `
      INSERT INTO commercial_funnel_events (
        event_id, event_type, visitor_id, session_id,
        offer_id, offer_human_id, path,
        fbclid, utm_source, utm_medium, utm_campaign, utm_content,
        metadata, is_demo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (event_id, is_demo) DO NOTHING
      RETURNING id, event_id, created_at
    `;

    const values = [
      event_id, event_type, visitor_id, session_id,
      resolvedOfferId, offer_human_id, path,
      fbclid, utm_source, utm_medium, utm_campaign, utm_content,
      metadata ? JSON.stringify(metadata) : null,
      isDemo
    ];

    const result = await pool.query(query, values);
    const recorded = result.rows.length > 0;

    return res.status(recorded ? 201 : 200).json({
      success: true,
      event_id,
      recorded,
      timestamp: recorded ? result.rows[0].created_at : new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[Telemetry Error]: Failed to record funnel event:', err);
    return res.status(500).json({ error: 'Failed to record telemetry event.' });
  }
}

export async function getFunnelEventsSummary(req: Request, res: Response) {
  const pool: Pool = req.app.get('db');
  if (!pool) {
    return res.status(500).json({ error: 'Database connection not available.' });
  }

  const isDemo = req.query.mode === 'demo';

  try {
    const summaryRes = await pool.query(
      `SELECT 
         event_type,
         COUNT(*)::bigint as total_events,
         COUNT(DISTINCT visitor_id)::bigint as unique_visitors,
         COUNT(DISTINCT session_id)::bigint as unique_sessions
       FROM commercial_funnel_events
       WHERE is_demo = $1
       GROUP BY event_type`,
      [isDemo]
    );

    const recentEventsRes = await pool.query(
      `SELECT id, event_id, event_type, visitor_id, session_id, offer_human_id,
              path, fbclid, utm_source, utm_campaign, created_at
       FROM commercial_funnel_events
       WHERE is_demo = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [isDemo]
    );

    return res.status(200).json({
      summary: summaryRes.rows,
      recentEvents: recentEventsRes.rows
    });
  } catch (err: any) {
    console.error('[Telemetry Error]: Failed to query funnel events summary:', err);
    return res.status(500).json({ error: 'Failed to query telemetry summary.' });
  }
}
