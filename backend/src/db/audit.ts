import { Pool, PoolClient } from 'pg';
import crypto from 'crypto';

export async function writeAuditLog(
  db: Pool | PoolClient,
  userId: string | null,
  eventType: string,
  description: string,
  previousValue: string | null = null,
  newValue: string | null = null,
  isDemo: boolean = false,
  isCritical: boolean = false
) {
  const id = crypto.randomUUID();
  const queryText = `
    INSERT INTO audit_logs (id, user_id, event_type, description, previous_value, new_value, is_demo)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `;
  const params = [id, userId, eventType, description, previousValue, newValue, isDemo];

  if (isCritical) {
    // Critical audit log runs inside transaction and propagates errors to trigger rollback
    await db.query(queryText, params);
  } else {
    // Non-critical audit log runs best-effort
    try {
      await db.query(queryText, params);
    } catch (err) {
      console.error('[Non-Critical Audit Log Error]:', err);
    }
  }
}
