import { Pool } from 'pg';
import { isDbInMemory } from '../../db/db';
import { MetaCapiService } from './metaCapiService';
import { OFFICIAL_NORQVA_PIXEL_ID } from './metaMutatingClient';

export interface CapiRetryResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

export async function processCapiRetries(pool: Pool): Promise<CapiRetryResult> {
  const result: CapiRetryResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Select pending/failed events respecting exponential backoff and 6-day TTL
    const lockClause = isDbInMemory() ? '' : 'FOR UPDATE SKIP LOCKED';
    const query = `
      SELECT id, event_id, pixel_id, payload, attempts, max_attempts, is_demo, response_status
      FROM capi_events
      WHERE status IN ('PENDING', 'FAILED')
        AND attempts < max_attempts
        AND created_at > NOW() - INTERVAL '6 days'
        AND (response_status IS NULL OR response_status = 429 OR response_status < 400 OR response_status >= 500)
        AND (
          last_attempt_at IS NULL OR
          last_attempt_at <= NOW() - (
            CASE
              WHEN attempts = 0 THEN INTERVAL '0 seconds'
              WHEN attempts = 1 THEN INTERVAL '5 minutes'
              WHEN attempts = 2 THEN INTERVAL '15 minutes'
              WHEN attempts = 3 THEN INTERVAL '1 hour'
              WHEN attempts = 4 THEN INTERVAL '3 hours'
              ELSE INTERVAL '12 hours'
            END
          )
        )
      ORDER BY created_at ASC
      LIMIT 50
      ${lockClause}
    `;

    const candidateRows = await client.query(query);
    await client.query('COMMIT');

    const accessToken = process.env.META_ACCESS_TOKEN;
    const apiVersion = MetaCapiService.getApiVersion();
    const testCode = process.env.META_TEST_EVENT_CODE;

    for (const row of candidateRows.rows) {
      result.processed++;
      const isDemo = !!row.is_demo;
      const pixelId = row.pixel_id || process.env.META_PIXEL_ID || OFFICIAL_NORQVA_PIXEL_ID;
      const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;

      if (!accessToken) {
        await pool.query(
          `UPDATE capi_events SET
             status = 'SKIPPED',
             error_message = 'META_ACCESS_TOKEN ausente',
             last_attempt_at = NOW(),
             updated_at = NOW()
           WHERE id = $1`,
          [row.id]
        );
        result.skipped++;
        continue;
      }

      let sentSuccess = false;
      let lastError: string | null = null;
      let responseStatus: number | null = null;
      let responseBody: any = null;
      let isFatalClientError = false;

      try {
        const endpoint = `https://graph.facebook.com/${apiVersion}/${pixelId}/events`;
        const postData: any = {
          data: [payload],
          access_token: accessToken
        };
        if (testCode) {
          postData.test_event_code = testCode;
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(postData),
          signal: AbortSignal.timeout(8000)
        });

        responseStatus = res.status;
        try {
          responseBody = await res.json();
        } catch {
          responseBody = null;
        }

        if (res.ok && (!responseBody || !responseBody.error)) {
          sentSuccess = true;
        } else {
          lastError = responseBody?.error?.message || `HTTP ${res.status}`;
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            isFatalClientError = true;
          }
        }
      } catch (reqErr: any) {
        lastError = reqErr.message;
      }

      const finalStatus = sentSuccess ? 'SENT' : 'FAILED';
      if (sentSuccess) {
        result.sent++;
      } else {
        result.failed++;
      }

      await pool.query(
        `UPDATE capi_events SET
           status = $1,
           attempts = CASE WHEN $2 = TRUE THEN max_attempts ELSE attempts + 1 END,
           last_attempt_at = NOW(),
           response_status = $3,
           response_body = $4,
           error_message = $5,
           updated_at = NOW()
         WHERE id = $6`,
        [
          finalStatus,
          isFatalClientError,
          responseStatus,
          responseBody ? JSON.stringify(responseBody) : null,
          lastError,
          row.id
        ]
      );
    }
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    console.warn('[CapiRetryJob] Error during retry batch processing:', err.message);
  } finally {
    client.release();
  }

  return result;
}

export function startCapiRetryJob(pool: Pool, intervalMs: number = 300000): { stop: () => void } {
  let isRunning = false;

  const runTick = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await processCapiRetries(pool);
    } catch (e: any) {
      console.warn('[CapiRetryJob] Tick error:', e.message);
    } finally {
      isRunning = false;
    }
  };

  const timer = setInterval(runTick, intervalMs);

  return {
    stop: () => {
      clearInterval(timer);
    }
  };
}
