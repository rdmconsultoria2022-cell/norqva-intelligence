import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { AdAlertService, shouldAlertSpendWithoutSale, RULE_SPEND_WITHOUT_SALE } from '../services/alerts/adAlertService';

// NORQVA-0009: "anúncio gastou 2× o CPA de equilíbrio sem venda → pausar recomendado".
describe('NORQVA-0009 — ad alerts', () => {
  describe('rule (pure)', () => {
    it('alerts only for an active ad at or above 2× breakeven with no sale', () => {
      expect(shouldAlertSpendWithoutSale({ spend: 52.24, paidOrders: 0, breakevenCpa: 26.12, isActive: true })).toEqual({ alert: true, threshold: 52.24 });
      expect(shouldAlertSpendWithoutSale({ spend: 52.23, paidOrders: 0, breakevenCpa: 26.12, isActive: true }).alert).toBe(false);
      expect(shouldAlertSpendWithoutSale({ spend: 80, paidOrders: 1, breakevenCpa: 26.12, isActive: true }).alert).toBe(false);
      expect(shouldAlertSpendWithoutSale({ spend: 80, paidOrders: 0, breakevenCpa: 26.12, isActive: false }).alert).toBe(false);
      expect(shouldAlertSpendWithoutSale({ spend: 80, paidOrders: 0, breakevenCpa: null, isActive: true })).toEqual({ alert: false, threshold: null });
    });
  });

  describe('evaluation (DB, demo scope)', () => {
    let pool: Pool;
    let adminToken: string;
    let viewerToken: string;
    const tag = crypto.randomUUID().slice(0, 8);
    const adName = `ALERT-0009-${tag}`;
    const metaAdId = `ad0009${tag}`;
    let adDbId: string;
    let accountId: string;

    beforeAll(async () => {
      pool = initializeDB();
      await runMigrations(pool);
      const mk = async (email: string, role: string) => {
        const r = await pool.query(
          `INSERT INTO users (id, auth_user_id, email, name, role, status)
           VALUES (gen_random_uuid(), gen_random_uuid(), $1, $1, $2, 'ACTIVE')
           ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE'
           RETURNING auth_user_id, email`,
          [email, role]
        );
        return signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role });
      };
      adminToken = await mk('admin.norqva0009@norqva-alerts.example', 'ADMIN');
      viewerToken = await mk('creative.norqva0009@norqva-alerts.example', 'CREATIVE');

      // Product + offer + unit economics: price 29.90, no costs → breakeven 29.90, threshold 59.80
      const productId = crypto.randomUUID();
      const offerId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO products (id, human_id, name, category, description, is_demo) VALUES ($1, $2, 'P 0009', 'X', 'fixture', TRUE)`,
        [productId, `PRD-0009-${tag}`]
      );
      await pool.query(
        `INSERT INTO offers (id, human_id, product_id, name, description, price, is_demo) VALUES ($1, $2, $3, 'O 0009', 'x', 29.90, TRUE)`,
        [offerId, `OFF-0009-${tag}`, productId]
      );
      await pool.query(
        `INSERT INTO offer_unit_economics (offer_id, tax_rate, gateway_fixed_fee, gateway_pct_fee, other_variable_cost, is_demo)
         VALUES ($1, 0, 0, 0, 0, TRUE)`,
        [offerId]
      );
      // Factory creative whose key = ad name → ties the campaign to the product
      await pool.query(
        `INSERT INTO creatives (human_id, product_id, hook, concept, copy, cta, format, status, is_demo, utm_content_key)
         VALUES ($1, $2, 'h', 'c', 'x', 'cta', 'IMAGE', 'IDEIA', TRUE, $1)`,
        [adName, productId]
      );

      const acct = await pool.query(
        `INSERT INTO meta_ad_accounts (meta_account_id, name, currency, is_demo) VALUES ($1, 'acc 0009', 'BRL', TRUE) RETURNING id`,
        [`act_0009_${tag}`]
      );
      accountId = acct.rows[0].id;
      const cmpId = crypto.randomUUID();
      const setId = crypto.randomUUID();
      adDbId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, is_demo)
         VALUES ($1, $2, $3, 'C 0009', 'ACTIVE', 'ACTIVE', TRUE)`,
        [cmpId, `cmp0009${tag}`, accountId]
      );
      await pool.query(
        `INSERT INTO meta_ad_sets (id, meta_adset_id, campaign_id, name, status, effective_status, is_demo)
         VALUES ($1, $2, $3, 'S 0009', 'ACTIVE', 'ACTIVE', TRUE)`,
        [setId, `set0009${tag}`, cmpId]
      );
      await pool.query(
        `INSERT INTO meta_ads (id, meta_ad_id, adset_id, name, status, effective_status, is_demo)
         VALUES ($1, $2, $3, $4, 'ACTIVE', 'ACTIVE', TRUE)`,
        [adDbId, metaAdId, setId, adName]
      );
    });

    const addSpend = async (day: string, spend: number) => {
      await pool.query(
        `INSERT INTO meta_insights (ad_account_id, ad_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, link_clicks, is_demo)
         VALUES ($1, $2, 'AD', $3, $4, $4, $5, 1000, 20, 15, TRUE)`,
        [accountId, adDbId, metaAdId, day, spend]
      );
    };
    const openAlerts = async () =>
      (await pool.query(`SELECT * FROM ad_alerts WHERE meta_ad_id = $1 AND is_demo = TRUE AND status IN ('OPEN','ACKNOWLEDGED')`, [metaAdId])).rows;

    it('below the threshold nothing opens; above it one alert opens, emails ADMINs once, and is not duplicated', async () => {
      await addSpend('2026-09-20', 30);
      const sender = vi.fn().mockResolvedValue({ sent: true });
      const svc = new AdAlertService(sender);

      await svc.evaluate(pool, true, { notify: true });
      expect(await openAlerts()).toHaveLength(0);

      await addSpend('2026-09-21', 30); // total 60 ≥ 59.80
      const r = await svc.evaluate(pool, true, { notify: true });
      expect(r.created).toBeGreaterThanOrEqual(1);
      const open = await openAlerts();
      expect(open).toHaveLength(1);
      expect(open[0].rule_code).toBe(RULE_SPEND_WITHOUT_SALE);
      expect(parseFloat(open[0].threshold)).toBeCloseTo(59.8, 2);
      expect(open[0].message).toContain('Recomendação: pausar');
      expect(open[0].notified_at).not.toBeNull();
      expect(sender).toHaveBeenCalledTimes(1);
      const email = sender.mock.calls[0][0];
      expect(email.to).toContain('admin.norqva0009@norqva-alerts.example');
      expect(email.text).toContain(adName);

      await svc.evaluate(pool, true, { notify: true });
      expect(await openAlerts()).toHaveLength(1);
      expect(sender).toHaveBeenCalledTimes(1);
    });

    it('HTTP: list and acknowledge; only allowed roles evaluate', async () => {
      const list = await request(app).get('/api/alerts?mode=demo').set('Authorization', `Bearer ${viewerToken}`);
      expect(list.status).toBe(200);
      const mine = list.body.alerts.find((a: any) => a.meta_ad_id === metaAdId);
      expect(mine).toBeTruthy();

      const denied = await request(app).post('/api/alerts/evaluate?mode=demo').set('Authorization', `Bearer ${viewerToken}`);
      expect(denied.status).toBe(403);

      const ack = await request(app).post(`/api/alerts/${mine.id}/ack?mode=demo`).set('Authorization', `Bearer ${adminToken}`);
      expect(ack.status).toBe(200);
      expect(ack.body.status).toBe('ACKNOWLEDGED');
    });

    it('the alert resolves by itself when the ad is paused', async () => {
      await pool.query(`UPDATE meta_ads SET status = 'PAUSED', effective_status = 'PAUSED' WHERE id = $1`, [adDbId]);
      const r = await new AdAlertService(null).evaluate(pool, true);
      expect(r.resolved).toBeGreaterThanOrEqual(1);
      expect(await openAlerts()).toHaveLength(0);
      const all = (await pool.query(`SELECT status, resolution FROM ad_alerts WHERE meta_ad_id = $1`, [metaAdId])).rows;
      expect(all[0]).toMatchObject({ status: 'RESOLVED', resolution: 'AD_NOT_ACTIVE' });
    });
  });
});
