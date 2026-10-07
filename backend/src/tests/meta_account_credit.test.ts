import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { MetaClient, MetaAccountBilling } from '../services/meta/metaClient';
import { AccountCreditService, buildPanel, parseDisplayAmount } from '../services/meta/accountCreditService';
import { setAccountCreditServiceForTesting } from '../controllers/accountCreditController';

// Painel de créditos da conta Meta — somente leitura.

const billing = (over: Partial<MetaAccountBilling> = {}): MetaAccountBilling => ({
  id: 'act_123456789', name: 'Conta', currency: 'BRL', account_status: 1, disable_reason: 0,
  amount_spent: 865.44, spend_cap: 1000, balance: 0, is_prepay_account: true,
  funding_source: { type: 20, display_string: 'Saldo disponível (R$ 1.234,56 BRL)' },
  daily_spend: Array.from({ length: 7 }, (_, i) => ({ date: `2026-09-${String(29 + i).padStart(2, '0')}`, spend: 60 })),
  ...over
});
const NOW = new Date('2026-10-06T12:00:00Z');

describe('Créditos Meta — cálculo', () => {
  it('limit, spent, available, forecast by 7-day average and by active budgets', () => {
    const p = buildPanel(billing(), 90, NOW);
    expect(p.limit).toBe(1000);
    expect(p.spent).toBe(865.44);
    expect(p.available).toBe(134.56);
    expect(p.used_pct).toBe(86.5);
    expect(p.avg_daily_7d).toBe(60);
    expect(p.forecast.days_at_avg).toBe(2.2);
    expect(p.forecast.days_at_budgets).toBe(1.5);
    expect(p.forecast.date_at_budgets).toMatch(/^2026-10-0[78]$/);
    expect(p.alerts.some(a => a.level === 'WARNING')).toBe(true);
    expect(p.funding).toMatchObject({ type: 20, type_label: 'Saldo pré-pago', prepaid_balance: 1234.56 });
    expect(p.billing_url).toContain('asset_id=123456789');
    expect(p.notes.join(' ')).toContain('R-0019-01');
  });

  it('flags a reached limit, an inactive account and less than 1 day of budget', () => {
    expect(buildPanel(billing({ amount_spent: 1000 }), 90, NOW).alerts[0].level).toBe('CRITICAL');
    expect(buildPanel(billing({ amount_spent: 950 }), 90, NOW).alerts.some(a => a.message.includes('menos de 1 dia'))).toBe(true);
    const off = buildPanel(billing({ account_status: 3 }), 90, NOW);
    expect(off.alerts[0]).toMatchObject({ level: 'CRITICAL' });
    expect(off.account.status_label).toBe('Pagamento pendente');
  });

  it('no account limit (Meta returns 0) means no forecast', () => {
    const p = buildPanel(billing({ spend_cap: 0 }), 90, NOW);
    expect(p.limit).toBeNull();
    expect(p.available).toBeNull();
    expect(p.forecast.days_at_avg).toBeNull();
    expect(p.alerts[0].level).toBe('INFO');
  });

  it('parses Meta display amounts', () => {
    expect(parseDisplayAmount('Saldo disponível (R$50,00 BRL)')).toBe(50);
    expect(parseDisplayAmount('R$ 1.234,5')).toBe(1234.5);
    expect(parseDisplayAmount('Visa · 1234')).toBeNull();
    expect(parseDisplayAmount(null)).toBeNull();
  });

  it('the Meta client only issues GETs (converts centavos)', async () => {
    const prev = process.env.META_AD_ACCOUNT_ID;
    process.env.META_AD_ACCOUNT_ID = '999';
    const client = new MetaClient();
    const calls: string[] = [];
    (client as any).fetchGraphApi = vi.fn(async (endpoint: string, _p: any, method = 'GET') => {
      calls.push(`${method} ${endpoint}`);
      if (endpoint.endsWith('/insights')) return { data: [{ date_start: '2026-10-05', spend: '62.00' }] };
      return { id: 'act_999', name: 'X', currency: 'BRL', account_status: 1, amount_spent: '86544', spend_cap: '100000', balance: '0', funding_source_details: { type: 1, display_string: 'Visa · 1234' } };
    });
    const b = await client.getAccountBilling(false);
    expect(b).toMatchObject({ amount_spent: 865.44, spend_cap: 1000, balance: 0 });
    expect(b.daily_spend).toEqual([{ date: '2026-10-05', spend: 62 }]);
    expect(calls.every(c => c.startsWith('GET '))).toBe(true);
    if (prev === undefined) delete process.env.META_AD_ACCOUNT_ID;
    else process.env.META_AD_ACCOUNT_ID = prev;
  });
});

describe('Créditos Meta — endpoint', () => {
  let pool: Pool;
  let adminToken: string;
  let perfToken: string;

  beforeAll(async () => {
    pool = app.get('db') || initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const r = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status)
         VALUES (gen_random_uuid(), gen_random_uuid(), $1, $1, $2, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $2, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [email, role]
      );
      return signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role });
    };
    adminToken = await mk('admin.credit@norqva.test', 'ADMIN');
    perfToken = await mk('perf.credit@norqva.test', 'PERFORMANCE');
  });

  afterAll(() => setAccountCreditServiceForTesting(null));

  it('is ADMIN-only and returns the demo panel', async () => {
    setAccountCreditServiceForTesting(null);
    const forbidden = await request(app).get('/api/meta/account-credit?mode=demo').set('Authorization', `Bearer ${perfToken}`);
    expect(forbidden.status).toBe(403);
    const r = await request(app).get('/api/meta/account-credit?mode=demo').set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.limit).toBe(1000);
    expect(r.body.available).toBe(134.56);
    expect(r.body.funding.type_label).toBe('Saldo pré-pago');
    expect(r.body).toHaveProperty('forecast');
  });

  it('caches for a minute and refreshes on demand', async () => {
    const get = vi.fn(async () => billing());
    setAccountCreditServiceForTesting(new AccountCreditService(() => ({ getAccountBilling: get })));
    await request(app).get('/api/meta/account-credit').set('Authorization', `Bearer ${adminToken}`);
    const second = await request(app).get('/api/meta/account-credit').set('Authorization', `Bearer ${adminToken}`);
    expect(second.body.cached).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
    await request(app).get('/api/meta/account-credit?refresh=1').set('Authorization', `Bearer ${adminToken}`);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('returns 502 with a redacted message when Meta fails', async () => {
    setAccountCreditServiceForTesting(
      new AccountCreditService(() => ({ getAccountBilling: async () => { throw new Error('[META API ERROR 190]: bad token access_token=EAAsecret'); } }))
    );
    const r = await request(app).get('/api/meta/account-credit').set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(502);
    expect(r.body.error).not.toContain('EAAsecret');
  });
});
