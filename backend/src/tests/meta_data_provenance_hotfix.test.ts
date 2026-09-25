import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { MetaSyncService } from '../services/meta/metaSyncService';
import { getAttributionAnalyticsReport } from '../services/attribution/attributionAnalyticsService';
import { MetaClient } from '../services/meta/metaClient';

describe('GATE: 16.4B — META DATA PROVENANCE HOTFIX & FINANCIAL INTEGRITY', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
  });

  beforeEach(async () => {
    const stmts = [
      'DELETE FROM commercial_funnel_events',
      'DELETE FROM payments',
      'DELETE FROM order_items',
      'DELETE FROM orders',
      'DELETE FROM meta_insights',
      'DELETE FROM meta_ads',
      'DELETE FROM meta_ad_sets',
      'DELETE FROM meta_campaigns',
      'DELETE FROM meta_ad_accounts',
      'DELETE FROM meta_connections',
      'DELETE FROM customers'
    ];
    for (const sql of stmts) {
      try {
        await pool.query(sql);
      } catch (_) {}
    }
  });

  it('1. Meta REAL nova: provenance = COMMERCIAL_PRODUCTION na ingestao', async () => {
    const mockClient = {
      getAdAccounts: async () => [{ id: 'act_101', name: 'Norqva Real Account', currency: 'BRL', timezone_name: 'America/Sao_Paulo', account_status: 1 }],
      getCampaigns: async () => [{ id: 'cmp_trattoria', name: 'NORQVA_TRATTORIA_REVENUE_V1', objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE', account_id: 'act_101' }],
      getAdSets: async () => [{ id: 'set_trattoria_01', campaign_id: 'cmp_trattoria', name: 'ADSET_TRATTORIA_V1', status: 'ACTIVE', effective_status: 'ACTIVE' }],
      getAds: async () => [
        { id: 'ad_trattoria_a', adset_id: 'set_trattoria_01', name: 'TRATTORIA_V1_AD_A_HOOK_SEPARACAO', status: 'ACTIVE', effective_status: 'ACTIVE' },
        { id: 'ad_trattoria_b', adset_id: 'set_trattoria_01', name: 'TRATTORIA_V1_AD_B_HOOK_EMULSAO', status: 'ACTIVE', effective_status: 'ACTIVE' },
        { id: 'ad_trattoria_c', adset_id: 'set_trattoria_01', name: 'TRATTORIA_V1_AD_C_HOOK_MASSA_CASEIRA', status: 'ACTIVE', effective_status: 'ACTIVE' }
      ],
      getInsights: async (_actId: string, level: string) => {
        if (level === 'campaign') {
          return [{
            ad_account_id: 'act_101',
            entity_level: 'CAMPAIGN',
            entity_meta_id: 'cmp_trattoria',
            campaign_meta_id: 'cmp_trattoria',
            date_start: '2026-09-25',
            date_stop: '2026-09-25',
            spend: 150.00,
            impressions: 3000,
            reach: 2500,
            clicks: 120,
            link_clicks: 90
          }];
        } else {
          return [
            { ad_account_id: 'act_101', entity_level: 'AD', entity_meta_id: 'ad_trattoria_a', campaign_meta_id: 'cmp_trattoria', adset_meta_id: 'set_trattoria_01', ad_meta_id: 'ad_trattoria_a', date_start: '2026-09-25', date_stop: '2026-09-25', spend: 50.00, impressions: 1000, clicks: 40 },
            { ad_account_id: 'act_101', entity_level: 'AD', entity_meta_id: 'ad_trattoria_b', campaign_meta_id: 'cmp_trattoria', adset_meta_id: 'set_trattoria_01', ad_meta_id: 'ad_trattoria_b', date_start: '2026-09-25', date_stop: '2026-09-25', spend: 50.00, impressions: 1000, clicks: 40 },
            { ad_account_id: 'act_101', entity_level: 'AD', entity_meta_id: 'ad_trattoria_c', campaign_meta_id: 'cmp_trattoria', adset_meta_id: 'set_trattoria_01', ad_meta_id: 'ad_trattoria_c', date_start: '2026-09-25', date_stop: '2026-09-25', spend: 50.00, impressions: 1000, clicks: 40 }
          ];
        }
      }
    } as unknown as MetaClient;

    const syncService = new MetaSyncService(mockClient);
    const syncRes = await syncService.syncAll(pool, null, false);

    expect(syncRes.success).toBe(true);
    expect(syncRes.campaignsCount).toBe(1);
    expect(syncRes.adsCount).toBe(3);

    // Verify DB provenance
    const accRow = (await pool.query("SELECT data_provenance, is_demo FROM meta_ad_accounts WHERE meta_account_id = 'act_101'")).rows[0];
    expect(accRow.data_provenance).toBe('COMMERCIAL_PRODUCTION');
    expect(accRow.is_demo).toBe(false);

    const cmpRow = (await pool.query("SELECT data_provenance, is_demo FROM meta_campaigns WHERE meta_campaign_id = 'cmp_trattoria'")).rows[0];
    expect(cmpRow.data_provenance).toBe('COMMERCIAL_PRODUCTION');
    expect(cmpRow.is_demo).toBe(false);

    const adRows = (await pool.query("SELECT meta_ad_id, data_provenance, is_demo FROM meta_ads ORDER BY meta_ad_id")).rows;
    expect(adRows.length).toBe(3);
    for (const ad of adRows) {
      expect(ad.data_provenance).toBe('COMMERCIAL_PRODUCTION');
      expect(ad.is_demo).toBe(false);
    }

    const insRows = (await pool.query("SELECT entity_meta_id, data_provenance, is_demo FROM meta_insights")).rows;
    expect(insRows.length).toBe(4);
    for (const ins of insRows) {
      expect(ins.data_provenance).toBe('COMMERCIAL_PRODUCTION');
      expect(ins.is_demo).toBe(false);
    }
  });

  it('2. Resync de registro Meta REAL previamente UNKNOWN: passa a COMMERCIAL_PRODUCTION', async () => {
    // 1. Manually insert account and campaign with UNKNOWN
    const connRes = await pool.query("INSERT INTO meta_connections (is_demo, status, token_reference) VALUES (FALSE, 'CONNECTED', 'env:TEST') RETURNING id");
    const connId = connRes.rows[0].id;

    const accRes = await pool.query(
      "INSERT INTO meta_ad_accounts (meta_account_id, connection_id, name, is_demo, data_provenance) VALUES ('act_existing', $1, 'Existing Act', FALSE, 'UNKNOWN') RETURNING id",
      [connId]
    );
    const accId = accRes.rows[0].id;

    await pool.query(
      "INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance) VALUES ('cmp_existing', $1, 'NORQVA_TRATTORIA_REVENUE_V1', 'ACTIVE', 'ACTIVE', FALSE, 'UNKNOWN')",
      [accId]
    );

    // Verify initial state is UNKNOWN
    const initialCmp = (await pool.query("SELECT data_provenance FROM meta_campaigns WHERE meta_campaign_id = 'cmp_existing'")).rows[0];
    expect(initialCmp.data_provenance).toBe('UNKNOWN');

    // 2. Perform Meta Sync with real mode
    const mockClient = {
      getAdAccounts: async () => [{ id: 'act_existing', name: 'Existing Act', currency: 'BRL', timezone_name: 'America/Sao_Paulo', account_status: 1 }],
      getCampaigns: async () => [{ id: 'cmp_existing', name: 'NORQVA_TRATTORIA_REVENUE_V1', objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE', account_id: 'act_existing' }],
      getAdSets: async () => [],
      getAds: async () => [],
      getInsights: async () => []
    } as unknown as MetaClient;

    const syncService = new MetaSyncService(mockClient);
    await syncService.syncAll(pool, null, false);

    // 3. Verify ON CONFLICT updated UNKNOWN to COMMERCIAL_PRODUCTION
    const updatedCmp = (await pool.query("SELECT data_provenance FROM meta_campaigns WHERE meta_campaign_id = 'cmp_existing'")).rows[0];
    expect(updatedCmp.data_provenance).toBe('COMMERCIAL_PRODUCTION');
  });

  it('3. Registro UNKNOWN nao comprovado permanece UNKNOWN no backfill', async () => {
    // Insert an unlinked / rogue ad account without valid connected connection
    const rogueAccRes = await pool.query(
      "INSERT INTO meta_ad_accounts (meta_account_id, connection_id, name, is_demo, data_provenance) VALUES ('act_rogue', NULL, 'Rogue Account', FALSE, 'UNKNOWN') RETURNING id"
    );
    const rogueAccId = rogueAccRes.rows[0].id;

    await pool.query(`
      INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance)
      VALUES (gen_random_uuid(), 'cmp_rogue_orphan', $1, 'ROGUE_UNVERIFIED_CAMPAIGN', 'ACTIVE', 'ACTIVE', FALSE, 'UNKNOWN')
    `, [rogueAccId]);

    // Execute backfill query with strict origin validation
    await pool.query(`
      UPDATE meta_campaigns
      SET data_provenance = 'COMMERCIAL_PRODUCTION', updated_at = NOW()
      WHERE is_demo = FALSE 
        AND data_provenance = 'UNKNOWN'
        AND ad_account_id IN (
          SELECT a.id FROM meta_ad_accounts a
          WHERE a.is_demo = FALSE AND a.connection_id IN (SELECT id FROM meta_connections WHERE is_demo = FALSE AND status = 'CONNECTED')
        )
    `);

    const rogueCmp = (await pool.query("SELECT data_provenance FROM meta_campaigns WHERE meta_campaign_id = 'cmp_rogue_orphan'")).rows[0];
    expect(rogueCmp.data_provenance).toBe('UNKNOWN');
  });

  it('4. DEMO permanece estritamente isolado de REAL (DEMO_SEED, is_demo = true)', async () => {
    const mockClient = {
      getAdAccounts: async () => [{ id: 'act_demo_1', name: 'Mock Demo Account', currency: 'BRL', timezone_name: 'America/Sao_Paulo', account_status: 1 }],
      getCampaigns: async () => [{ id: 'cmp_demo_1', name: 'DEMO CAMPAIGN 01', objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE', account_id: 'act_demo_1' }],
      getAdSets: async () => [],
      getAds: async () => [],
      getInsights: async () => []
    } as unknown as MetaClient;

    const syncService = new MetaSyncService(mockClient);
    await syncService.syncAll(pool, null, true); // DEMO mode

    const demoCmp = (await pool.query("SELECT data_provenance, is_demo FROM meta_campaigns WHERE meta_campaign_id = 'cmp_demo_1'")).rows[0];
    expect(demoCmp.data_provenance).toBe('DEMO_SEED');
    expect(demoCmp.is_demo).toBe(true);
  });

  it('5. Attribution B2 continua rejeitando UNKNOWN', async () => {
    const connRes = await pool.query("INSERT INTO meta_connections (is_demo, status, token_reference) VALUES (FALSE, 'CONNECTED', 'env:TEST') RETURNING id");
    const accRes = await pool.query("INSERT INTO meta_ad_accounts (meta_account_id, connection_id, name, is_demo, data_provenance) VALUES ('act_real', $1, 'Real Act', FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id", [connRes.rows[0].id]);
    const accId = accRes.rows[0].id;

    // Campaign with UNKNOWN provenance
    const cmpRes = await pool.query("INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance) VALUES ('cmp_unknown', $1, 'UNKNOWN_PROVENANCE_CAMPAIGN', 'ACTIVE', 'ACTIVE', FALSE, 'UNKNOWN') RETURNING id", [accId]);
    await pool.query("INSERT INTO meta_insights (ad_account_id, campaign_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo, data_provenance) VALUES ($1, $2, 'CAMPAIGN', 'cmp_unknown', '2026-09-25', '2026-09-25', 100.00, 1000, 50, FALSE, 'UNKNOWN')", [accId, cmpRes.rows[0].id]);

    const report = await getAttributionAnalyticsReport(pool, { mode: 'real', period: 'today' });

    // The UNKNOWN campaign and its spend MUST NOT appear in byCampaign or account spend
    const foundCamp = report.byCampaign.find(c => c.metaCampaignId === 'cmp_unknown');
    expect(foundCamp).toBeUndefined();
    expect(report.attributedMediaTruth.account.spend).toBe(0);
    expect(report.globalCommercialTruth.paidMediaSpend).toBe(0);
  });

  it('6 & 7. Campanha nova NORQVA_TRATTORIA_REVENUE_V1 com 3 anuncios sincronizada em REAL aparece no relatorio B2 com metricas validas', async () => {
    const mockClient = {
      getAdAccounts: async () => [{ id: 'act_trattoria_real', name: 'Trattoria Account', currency: 'BRL', timezone_name: 'America/Sao_Paulo', account_status: 1 }],
      getCampaigns: async () => [{ id: '120250000000000001', name: 'NORQVA_TRATTORIA_REVENUE_V1', objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE', account_id: 'act_trattoria_real' }],
      getAdSets: async () => [{ id: '120250000000000002', campaign_id: '120250000000000001', name: 'TRATTORIA_V1_ADSET', status: 'ACTIVE', effective_status: 'ACTIVE' }],
      getAds: async () => [
        { id: '120250000000000003', adset_id: '120250000000000002', name: 'TRATTORIA_V1_AD_A_HOOK_SEPARACAO', status: 'ACTIVE', effective_status: 'ACTIVE' },
        { id: '120250000000000004', adset_id: '120250000000000002', name: 'TRATTORIA_V1_AD_B_HOOK_EMULSAO', status: 'ACTIVE', effective_status: 'ACTIVE' },
        { id: '120250000000000005', adset_id: '120250000000000002', name: 'TRATTORIA_V1_AD_C_HOOK_MASSA_CASEIRA', status: 'ACTIVE', effective_status: 'ACTIVE' }
      ],
      getInsights: async (_actId: string, level: string) => {
        const todayStr = '2026-09-25';
        if (level === 'campaign') {
          return [{
            ad_account_id: 'act_trattoria_real',
            entity_level: 'CAMPAIGN',
            entity_meta_id: '120250000000000001',
            campaign_meta_id: '120250000000000001',
            date_start: todayStr,
            date_stop: todayStr,
            spend: 60.00,
            impressions: 1200,
            reach: 1000,
            clicks: 45,
            link_clicks: 30
          }];
        } else {
          return [
            { ad_account_id: 'act_trattoria_real', entity_level: 'AD', entity_meta_id: '120250000000000003', campaign_meta_id: '120250000000000001', adset_meta_id: '120250000000000002', ad_meta_id: '120250000000000003', date_start: todayStr, date_stop: todayStr, spend: 20.00, impressions: 400, clicks: 15 },
            { ad_account_id: 'act_trattoria_real', entity_level: 'AD', entity_meta_id: '120250000000000004', campaign_meta_id: '120250000000000001', adset_meta_id: '120250000000000002', ad_meta_id: '120250000000000004', date_start: todayStr, date_stop: todayStr, spend: 20.00, impressions: 400, clicks: 15 },
            { ad_account_id: 'act_trattoria_real', entity_level: 'AD', entity_meta_id: '120250000000000005', campaign_meta_id: '120250000000000001', adset_meta_id: '120250000000000002', ad_meta_id: '120250000000000005', date_start: todayStr, date_stop: todayStr, spend: 20.00, impressions: 400, clicks: 15 }
          ];
        }
      }
    } as unknown as MetaClient;

    const syncService = new MetaSyncService(mockClient);
    await syncService.syncAll(pool, null, false);

    // Seed a Customer and a Paid Order attributed to Ad A
    const custRes = await pool.query("INSERT INTO customers (email, name) VALUES ('buyer.trattoria@example.com', 'Comprador Trattoria') RETURNING id");
    const custId = custRes.rows[0].id;
    const ordRes = await pool.query(`
      INSERT INTO orders (customer_id, total_amount, status, is_demo, data_provenance, idempotency_key, utm_source, utm_campaign, utm_content, attribution_metadata, created_at, updated_at)
      VALUES ($1, 29.90, 'PAID', FALSE, 'COMMERCIAL_PRODUCTION', 'idem_trattoria_01', 'meta', '120250000000000001', '120250000000000003', $2, '2026-09-25 12:00:00', '2026-09-25 12:00:00')
      RETURNING id
    `, [custId, JSON.stringify({ campaign_id: '120250000000000001', adset_id: '120250000000000002', ad_id: '120250000000000003' })]);
    await pool.query(`
      INSERT INTO payments (human_id, order_id, provider, status, amount, confirmed_at, idempotency_key, external_reference, data_provenance, created_at, updated_at)
      VALUES ('PAY_TRATTORIA_01', $1, 'ASAAS', 'CONFIRMED', 29.90, '2026-09-25 12:00:00', 'idem_pay_trattoria_01', 'ext_trattoria_01', 'COMMERCIAL_PRODUCTION', '2026-09-25 12:00:00', '2026-09-25 12:00:00')
    `, [ordRes.rows[0].id]);

    // Query B2 Attribution Report for '7d'
    const report = await getAttributionAnalyticsReport(pool, { mode: 'real', period: '7d' });

    // Assert campaign visibility in B2
    const trattoriaCampaign = report.byCampaign.find(c => c.metaCampaignId === '120250000000000001');
    expect(trattoriaCampaign).toBeDefined();
    expect(trattoriaCampaign?.campaignName).toBe('NORQVA_TRATTORIA_REVENUE_V1');
    expect(trattoriaCampaign?.spend).toBe(60.00);
    expect(trattoriaCampaign?.impressions).toBe(1200);
    expect(trattoriaCampaign?.clicks).toBe(45);
    expect(trattoriaCampaign?.attributedOrders).toBe(1);
    expect(trattoriaCampaign?.attributedRevenue).toBe(29.90);
    expect(trattoriaCampaign?.cac).toBe(60.00);
    expect(trattoriaCampaign?.roas).toBe(0.50);

    // Assert Global Totals
    expect(report.attributedMediaTruth.account.spend).toBe(60.00);
    expect(report.attributedMediaTruth.account.impressions).toBe(1200);
    expect(report.attributedMediaTruth.account.clicks).toBe(45);
    expect(report.attributedMediaTruth.commercialRollup.attributedPaidOrders).toBe(1);
    expect(report.attributedMediaTruth.commercialRollup.attributedRevenue).toBe(29.90);
  });
});
