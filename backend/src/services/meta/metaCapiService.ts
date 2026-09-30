import crypto from 'crypto';
import { Pool } from 'pg';
import { OFFICIAL_NORQVA_PIXEL_ID } from './metaMutatingClient';
import { MetaClient } from './metaClient';
import { resolveBrandPixelId } from '../brands/brandService';

export interface MetaCapiUserData {
  em?: string[];
  ph?: string[];
  fbc?: string;
  fbp?: string;
  client_ip_address?: string;
  client_user_agent?: string;
}

export interface MetaCapiEventPayload {
  event_name: 'InitiateCheckout' | 'Purchase' | string;
  event_time: number;
  event_id: string;
  action_source: 'website' | 'system_generated' | 'app' | string;
  event_source_url?: string;
  user_data: MetaCapiUserData;
  custom_data?: {
    currency?: string;
    value?: number;
    order_id?: string;
    [key: string]: any;
  };
}

export interface SendCapiEventOptions {
  orderId?: string;
  eventName: 'InitiateCheckout' | 'Purchase' | string;
  eventId: string;
  pixelId?: string;
  actionSource?: string;
  eventSourceUrl?: string;
  eventTime?: number;
  value?: number;
  currency?: string;
  email?: string;
  phone?: string;
  fbc?: string;
  fbp?: string;
  clientIp?: string;
  clientUserAgent?: string;
  isDemo?: boolean;
}

export class MetaCapiService {
  public static getApiVersion(): string {
    try {
      return new MetaClient().getApiVersion();
    } catch (_) {
      return process.env.META_API_VERSION || 'v26.0';
    }
  }

  public static hashEmail(email?: string): string[] | undefined {
    if (!email || typeof email !== 'string') return undefined;
    const clean = email.trim().toLowerCase();
    if (!clean) return undefined;
    return [crypto.createHash('sha256').update(clean).digest('hex')];
  }

  public static hashPhone(phone?: string): string[] | undefined {
    if (!phone || typeof phone !== 'string') return undefined;
    let clean = phone.replace(/\D/g, '');
    if (!clean) return undefined;
    // Prefix BR country code if missing
    if (clean.length === 10 || clean.length === 11) {
      clean = '55' + clean;
    }
    return [crypto.createHash('sha256').update(clean).digest('hex')];
  }

  public static buildUserData(options: {
    email?: string;
    phone?: string;
    fbc?: string;
    fbp?: string;
    clientIp?: string;
    clientUserAgent?: string;
  }): MetaCapiUserData {
    const userData: MetaCapiUserData = {};

    const em = this.hashEmail(options.email);
    if (em) userData.em = em;

    const ph = this.hashPhone(options.phone);
    if (ph) userData.ph = ph;

    if (options.fbc) userData.fbc = options.fbc.trim();
    if (options.fbp) userData.fbp = options.fbp.trim();
    if (options.clientIp) userData.client_ip_address = options.clientIp.trim();
    if (options.clientUserAgent) userData.client_user_agent = options.clientUserAgent.trim();

    return userData;
  }

  public static async sendEvent(pool: Pool, options: SendCapiEventOptions): Promise<{ success: boolean; eventId: string; status: string }> {
    // D-0009 (fase B): pixel da marca do produto vendido, se houver um VERIFIED; senão, o pixel padrão.
    const brandPixelId = options.pixelId ? null : await resolveBrandPixelId(pool, { orderId: options.orderId });
    const pixelId = options.pixelId || brandPixelId || process.env.META_PIXEL_ID || OFFICIAL_NORQVA_PIXEL_ID;
    const apiVersion = this.getApiVersion();
    const accessToken = process.env.META_ACCESS_TOKEN;
    const testCode = process.env.META_TEST_EVENT_CODE;
    const isDemo = !!options.isDemo;

    // 1. Check if event already exists and is already SENT (Idempotency check)
    let existingRecord: any = null;
    try {
      const existingRes = await pool.query(
        `SELECT id, status, payload, attempts, max_attempts FROM capi_events WHERE event_id = $1 AND is_demo = $2`,
        [options.eventId, isDemo]
      );
      if (existingRes.rows.length > 0) {
        existingRecord = existingRes.rows[0];
        if (existingRecord.status === 'SENT') {
          return {
            success: true,
            eventId: options.eventId,
            status: 'SENT'
          };
        }
      }
    } catch (checkErr: any) {
      console.warn('[MetaCapiService] Failed to check existing event:', checkErr.message);
    }

    // 2. Prepare payload: use stored payload if already present, otherwise construct new one
    let payload: MetaCapiEventPayload;
    if (existingRecord && existingRecord.payload) {
      payload = typeof existingRecord.payload === 'string' ? JSON.parse(existingRecord.payload) : existingRecord.payload;
    } else {
      const userData = this.buildUserData({
        email: options.email,
        phone: options.phone,
        fbc: options.fbc,
        fbp: options.fbp,
        clientIp: options.clientIp,
        clientUserAgent: options.clientUserAgent
      });

      payload = {
        event_name: options.eventName,
        event_time: options.eventTime || Math.floor(Date.now() / 1000),
        event_id: options.eventId,
        action_source: (options.actionSource || 'website') as any,
        event_source_url: options.eventSourceUrl || 'https://norqva-intelligence-frontend.vercel.app',
        user_data: userData,
        custom_data: {
          currency: options.currency || 'BRL',
          value: options.value !== undefined ? options.value : undefined,
          order_id: options.orderId
        }
      };

      try {
        await pool.query(
          `INSERT INTO capi_events (
             order_id, event_name, event_id, pixel_id, action_source, event_source_url, payload, status, is_demo
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8)
           ON CONFLICT (event_id, is_demo) DO NOTHING`,
          [
            options.orderId || null,
            options.eventName,
            options.eventId,
            pixelId,
            options.actionSource || 'website',
            options.eventSourceUrl || null,
            JSON.stringify(payload),
            isDemo
          ]
        );
      } catch (dbErr: any) {
        console.warn('[MetaCapiService] Failed to record initial CAPI event:', dbErr.message);
      }
    }

    // 3. If META_ACCESS_TOKEN is missing -> Record SKIPPED and return false without making requests
    if (!accessToken) {
      try {
        await pool.query(
          `UPDATE capi_events SET
             status = 'SKIPPED',
             error_message = 'META_ACCESS_TOKEN ausente',
             last_attempt_at = NOW(),
             updated_at = NOW()
           WHERE event_id = $1 AND is_demo = $2`,
          [options.eventId, isDemo]
        );
      } catch (updateErr: any) {
        console.warn('[MetaCapiService] Failed to record SKIPPED event:', updateErr.message);
      }
      return {
        success: false,
        eventId: options.eventId,
        status: 'SKIPPED'
      };
    }

    // 4. Transmit to Meta Conversions API
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

    // 5. Update capi_events record
    try {
      const finalStatus = sentSuccess ? 'SENT' : 'FAILED';
      await pool.query(
        `UPDATE capi_events SET
           status = $1,
           attempts = CASE WHEN $2 = TRUE THEN max_attempts ELSE attempts + 1 END,
           last_attempt_at = NOW(),
           response_status = $3,
           response_body = $4,
           error_message = $5,
           updated_at = NOW()
         WHERE event_id = $6 AND is_demo = $7`,
        [
          finalStatus,
          isFatalClientError,
          responseStatus,
          responseBody ? JSON.stringify(responseBody) : null,
          lastError,
          options.eventId,
          isDemo
        ]
      );
    } catch (updateErr: any) {
      console.warn('[MetaCapiService] Failed to update CAPI event log:', updateErr.message);
    }

    return {
      success: sentSuccess,
      eventId: options.eventId,
      status: sentSuccess ? 'SENT' : 'FAILED'
    };
  }
}
