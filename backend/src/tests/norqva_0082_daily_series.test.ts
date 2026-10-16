import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import crypto from 'crypto';
import { getExecutiveDaily, getFinancialDashboard } from '../controllers/api';
import { buildDailySeries, commercialDayOf } from '../services/finance/dailySeries';
import { getLocalComponentsInTimezone } from '../utils/commercialTimezone';
import { runMigrations } from '../db/migrations';

// NORQVA-0082 (D-0082): números por dia da Visão Geral. Só leitura; a soma dos dias tem de bater
// com o total do resumo financeiro do mesmo período.

describe('NORQVA-0082 série diária (função pura)', () => {
  it('preenche dias sem movimento com zero', () => {
    const days = buildDailySeries({
      start: '2026-10-10',
      end: '2026-10-12',
      paidOrders: [{ created_at: '2026-10-10T15:00:00Z', total_amount: '19.90' }],
      spendRows: [{ day: '2026-10-12', spend: '12.34' }]
    });
    expect(days).toEqual([
      { date: '2026-10-10', revenue: 19.9, paidOrders: 1, spend: 0 },
      { date: '2026-10-11', revenue: 0, paidOrders: 0, spend: 0 },
      { date: '2026-10-12', revenue: 0, paidOrders: 0, spend: 12.34 }
    ]);
  });

  it('usa o dia de São Paulo (02h UTC ainda é o dia anterior)', () => {
    expect(commercialDayOf('2026-10-16T02:00:00Z', 'America/Sao_Paulo')).toBe('2026-10-15');
    const days = buildDailySeries({
      start: '2026-10-15',
      end: '2026-10-16',
      paidOrders: [{ created_at: '2026-10-16T02:00:00Z', total_amount: 24.9 }],
      spendRows: [],
      timeZone: 'America/Sao_Paulo'
    });
    expect(days[0]).toEqual({ date: '2026-10-15', revenue: 24.9, paidOrders: 1, spend: 0 });
    expect(days[1].revenue).toBe(0);
  });

  it('período inteiro antes do início das vendas: série vazia', () => {
    expect(buildDailySeries({ start: '2026-09-25', end: '2026-09-20', paidOrders: [], spendRows: [] })).toEqual([]);
  });

  it('sem data de início: começa no primeiro dia com dado', () => {
    const days = buildDailySeries({ start: null, end: '2026-10-03', paidOrders: [], spendRows: [{ day: '2026-10-02', spend: 5 }] });
    expect(days.map(d => d.date)).toEqual(['2026-10-02', '2026-10-03']);
  });
});

describe('NORQVA-0082 GET /api/executive/daily', () => {
  let app: express.Express;
  let pool: Pool;
  const uid = crypto.randomBytes(4).toString('hex');
  const ids: { customer?: string; order?: string; account?: string; campaign?: string } = {};
  const today = getLocalComponentsInTimezone(new Date()).dateStr;

  const adminAuth = (req: any, _res: any, next: any) => {
    req.user = { id: '486d6688-3c33-41f1-8f86-8cee0311c733', name: 'Admin', email: 'admin@norqva.com', role: 'ADMIN', status: 'ATIVO', is_demo: false };
    next();
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST || 'postgresql://postgres:postgres@localhost:5432/norqva_test' });
    await runMigrations(pool);

    app = express();
    app.set('db', pool);
    app.get('/api/executive/daily', adminAuth, getExecutiveDaily);
    app.get('/api/financial/dashboard', adminAuth, getFinancialDashboard);

    const cust = await pool.query(
      `INSERT INTO customers (name, email, phone) VALUES ('Cliente 0082', $1, '31999999999') RETURNING id`,
      [`norqva0082-${uid}@norqva.com`]
    );
    ids.customer = cust.rows[0].id;
    const ord = await pool.query(
      `INSERT INTO orders (customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES ($1, 29.90, 'PAID', $2, false, 'COMMERCIAL_PRODUCTION') RETURNING id`,
      [cust.rows[0].id, `idemp-0082-${uid}`]
    );
    ids.order = ord.rows[0].id;

    // meta_connections tem UNIQUE (is_demo): mesmo padrão dos outros testes
    const conn = await pool.query(
      `INSERT INTO meta_connections (is_demo, status, token_reference) VALUES (FALSE, 'CONNECTED', 'env:TEST')
       ON CONFLICT (is_demo) DO UPDATE SET status = 'CONNECTED' RETURNING id`
    );
    const acc = await pool.query(
      "INSERT INTO meta_ad_accounts (meta_account_id, connection_id, name, currency, timezone_name, account_status, is_demo, data_provenance) VALUES ($1, $2, 'Conta 0082', 'BRL', 'America/Sao_Paulo', 1, FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [`act_0082_${uid}`, conn.rows[0].id]
    );
    ids.account = acc.rows[0].id;
    const cmp = await pool.query(
      "INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance) VALUES ($1, $2, 'NQ_0082_TESTE', 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [`cmp_0082_${uid}`, acc.rows[0].id]
    );
    ids.campaign = cmp.rows[0].id;
    await pool.query(
      "INSERT INTO meta_insights (ad_account_id, campaign_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo, data_provenance) VALUES ($1, $2, 'CAMPAIGN', $3, $4, $4, 11.11, 100, 5, FALSE, 'COMMERCIAL_PRODUCTION')",
      [acc.rows[0].id, cmp.rows[0].id, `cmp_0082_${uid}`, today]
    );
  });

  // apaga só o que este teste criou (outros arquivos contam linhas reais da Meta)
  afterAll(async () => {
    try {
      if (ids.account) await pool.query('DELETE FROM meta_insights WHERE ad_account_id = $1', [ids.account]);
      if (ids.campaign) await pool.query('DELETE FROM meta_campaigns WHERE id = $1', [ids.campaign]);
      if (ids.account) await pool.query('DELETE FROM meta_ad_accounts WHERE id = $1', [ids.account]);
      if (ids.order) await pool.query('DELETE FROM orders WHERE id = $1', [ids.order]);
      if (ids.customer) await pool.query('DELETE FROM customers WHERE id = $1', [ids.customer]);
    } finally {
      await pool.end();
    }
  });

  it('devolve um ponto por dia do período (7 dias)', async () => {
    const res = await request(app).get('/api/executive/daily?mode=real&period=7d');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.days)).toBe(true);
    expect(res.body.days.length).toBe(7);
    expect(res.body.days[res.body.days.length - 1].date).toBe(today);
    for (const d of res.body.days) {
      expect(Object.keys(d).sort()).toEqual(['date', 'paidOrders', 'revenue', 'spend']);
    }
  });

  it('a soma dos dias bate com o resumo financeiro do mesmo período', async () => {
    for (const period of ['today', '7d', '30d']) {
      const [daily, fin] = await Promise.all([
        request(app).get(`/api/executive/daily?mode=real&period=${period}`),
        request(app).get(`/api/financial/dashboard?mode=real&period=${period}`)
      ]);
      expect(daily.status).toBe(200);
      expect(fin.status).toBe(200);
      const sum = (k: 'revenue' | 'spend' | 'paidOrders') => daily.body.days.reduce((a: number, d: any) => a + d[k], 0);
      expect(sum('revenue')).toBeCloseTo(fin.body.summary.grossRevenue, 2);
      expect(sum('spend')).toBeCloseTo(fin.body.summary.totalSpend, 2);
      expect(sum('paidOrders')).toBe(fin.body.summary.paidOrdersCount);
    }
  });

  it('o dia de hoje inclui o pedido e o gasto de teste', async () => {
    const res = await request(app).get('/api/executive/daily?mode=real&period=today');
    const d = res.body.days.find((x: any) => x.date === today);
    expect(d.revenue).toBeGreaterThanOrEqual(29.9);
    expect(d.paidOrders).toBeGreaterThanOrEqual(1);
  });

  it('cada campanha do resumo financeiro traz productId e productName (podem ser nulos)', async () => {
    const fin = await request(app).get('/api/financial/dashboard?mode=real&period=7d');
    const c = fin.body.byCampaign.find((x: any) => x.metaCampaignId === `cmp_0082_${uid}`);
    expect(c).toBeTruthy();
    expect(c).toHaveProperty('productId');
    expect(c).toHaveProperty('productName');
    expect(c.productId).toBeNull(); // sem anúncio ligado a criativo nem evento com oferta
  });
});
