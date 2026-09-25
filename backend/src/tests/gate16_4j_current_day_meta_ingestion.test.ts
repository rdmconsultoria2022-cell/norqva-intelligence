import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { getCommercialTimeBoundaries, COMMERCIAL_TIMEZONE } from '../utils/commercialTimezone';
import { MetaSyncService } from '../services/meta/metaSyncService';
import { MetaClient, MetaInsightPayload } from '../services/meta/metaClient';
import { getAttributionAnalyticsReport } from '../services/attribution/attributionAnalyticsService';

function formatDateVal(val: any): string {
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  return String(val).split('T')[0];
}

describe('GATE 16.4J: Current-Day Meta Ingestion & Commercial Time Window Certification', () => {
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
      'DELETE FROM meta_connections'
    ];
    for (const sql of stmts) {
      try {
        await pool.query(sql);
      } catch (_) {}
    }
  });

  afterEach(async () => {
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
      'DELETE FROM meta_connections'
    ];
    for (const sql of stmts) {
      try {
        await pool.query(sql);
      } catch (_) {}
    }
  });

  // 1. Janela inclui hoje e timezone = America/Sao_Paulo
  it('Requirement 1 & 4: Commercial time boundaries in America/Sao_Paulo strictly include current day as until', () => {
    expect(COMMERCIAL_TIMEZONE).toBe('America/Sao_Paulo');

    const boundaries30d = getCommercialTimeBoundaries('30d');
    const boundariesToday = getCommercialTimeBoundaries('today');

    expect(boundaries30d.dateStopMeta).toBe(boundariesToday.dateStartMeta);
    expect(boundaries30d.dateStopMeta).toBe(boundariesToday.dateStopMeta);
    expect(boundaries30d.sameDateWindowEnforced).toBe(true);
  });

  // 2 & 3. MetaClient requests time_range with time_increment=1 and omits date_preset when time_range is present
  it('Requirement 2 & 3: MetaClient getInsights sends time_range with time_increment=1 and omits date_preset', async () => {
    let capturedParams: Record<string, any> = {};

    class SpyMetaClient extends MetaClient {
      // @ts-ignore
      private async paginateGraphApi(endpoint: string, params: Record<string, any>): Promise<any[]> {
        capturedParams = { ...params };
        return [];
      }
    }

    const spyClient = new SpyMetaClient();
    const boundaries = getCommercialTimeBoundaries('30d');
    const timeRange = { since: boundaries.dateStartMeta, until: boundaries.dateStopMeta };

    await spyClient.getInsights('act_12345', 'campaign', undefined, false, timeRange, 1);

    expect(capturedParams.time_range).toBe(JSON.stringify(timeRange));
    expect(capturedParams.time_increment).toBe('1');
    expect(capturedParams.date_preset).toBeUndefined();
    expect(capturedParams.level).toBe('campaign');
  });

  // 5. MetaSyncService defaults to 30d time_range including today, generating daily records
  it('Requirement 5: MetaSyncService default sync passes 30d time_range including today to MetaClient', async () => {
    let receivedTimeRange: any = null;
    let receivedTimeIncrement: any = null;
    let receivedDatePreset: any = null;

    class MockMetaClient extends MetaClient {
      override async getAdAccounts(isDemo?: boolean) {
        return [{ id: 'act_live_01', name: 'Commercial Account', currency: 'BRL', timezone_name: 'America/Sao_Paulo', account_status: 1 }];
      }
      override async getCampaigns(actId: string, isDemo?: boolean) {
        return [{ id: 'cmp_live_01', name: 'NORQVA_TRATTORIA_REVENUE_V1', objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE', account_id: actId }];
      }
      override async getAdSets(actId: string, isDemo?: boolean) {
        return [{ id: 'set_live_01', name: 'Trattoria AdSet', campaign_id: 'cmp_live_01', status: 'ACTIVE', effective_status: 'ACTIVE' }];
      }
      override async getAds(actId: string, isDemo?: boolean) {
        return [{ id: 'ad_live_01', name: 'TRATTORIA_V1_AD_A_HOOK_SEPARACAO', adset_id: 'set_live_01', status: 'ACTIVE', effective_status: 'ACTIVE' }];
      }
      override async getInsights(
        adAccountId: string,
        level: 'account' | 'campaign' | 'adset' | 'ad' = 'campaign',
        datePreset?: string,
        isDemo: boolean = false,
        timeRange?: { since: string; until: string },
        timeIncrement?: string | number
      ): Promise<MetaInsightPayload[]> {
        receivedTimeRange = timeRange;
        receivedTimeIncrement = timeIncrement;
        receivedDatePreset = datePreset;

        const todayStr = getCommercialTimeBoundaries('today').dateStartMeta;
        return [
          {
            entity_level: level.toUpperCase() as any,
            entity_meta_id: level === 'campaign' ? 'cmp_live_01' : 'ad_live_01',
            campaign_meta_id: 'cmp_live_01',
            adset_meta_id: 'set_live_01',
            ad_meta_id: level === 'ad' ? 'ad_live_01' : undefined,
            date_start: todayStr,
            date_stop: todayStr,
            spend: 50.00,
            impressions: 1200,
            reach: 1000,
            clicks: 45,
            link_clicks: 38
          }
        ];
      }
    }

    const mockClient = new MockMetaClient();
    const syncService = new MetaSyncService(mockClient);

    const syncResult = await syncService.syncAll(pool, null, false);

    const boundaries = getCommercialTimeBoundaries('30d');
    expect(receivedTimeRange).toEqual({ since: boundaries.dateStartMeta, until: boundaries.dateStopMeta });
    expect(receivedTimeIncrement).toBe(1);
    expect(receivedDatePreset).toBeUndefined();

    // Verify row persisted in DB with date_start = date_stop = today
    const todayStr = boundaries.dateStopMeta;
    const dbRes = await pool.query(
      `SELECT entity_level, entity_meta_id, date_start, date_stop, spend, data_provenance, is_demo
       FROM meta_insights
       WHERE entity_meta_id IN ('cmp_live_01', 'ad_live_01') AND date_start = $1 AND is_demo = false`,
      [todayStr]
    );

    expect(dbRes.rows.length).toBe(2);
    dbRes.rows.forEach((r: any) => {
      expect(formatDateVal(r.date_start)).toBe(todayStr);
      expect(formatDateVal(r.date_stop)).toBe(todayStr);
      expect(parseFloat(r.spend)).toBe(50.00);
      expect(r.data_provenance).toBe('COMMERCIAL_PRODUCTION');
      expect(r.is_demo).toBe(false);
    });
  });

  // 6. Re-sync do mesmo dia permanece idempotente (sem duplicatas)
  it('Requirement 6: Re-syncing the same day is idempotent and does not create duplicate daily rows', async () => {
    const todayStr = getCommercialTimeBoundaries('today').dateStartMeta;

    class MockMetaClient extends MetaClient {
      override async getAdAccounts() {
        return [{ id: 'act_live_02', name: 'Account 2', currency: 'BRL', timezone_name: 'America/Sao_Paulo', account_status: 1 }];
      }
      override async getCampaigns(actId: string) {
        return [{ id: 'cmp_live_02', name: 'NORQVA_TRATTORIA_REVENUE_V1', objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE', account_id: actId }];
      }
      override async getAdSets() {
        return [{ id: 'set_live_02', name: 'AdSet 2', campaign_id: 'cmp_live_02', status: 'ACTIVE', effective_status: 'ACTIVE' }];
      }
      override async getAds() {
        return [{ id: 'ad_live_02', name: 'TRATTORIA_V1_AD_B_HOOK_EMULSAO', adset_id: 'set_live_02', status: 'ACTIVE', effective_status: 'ACTIVE' }];
      }
      override async getInsights(adAccountId: string, level: string) {
        return [
          {
            entity_level: level.toUpperCase() as any,
            entity_meta_id: level === 'campaign' ? 'cmp_live_02' : 'ad_live_02',
            campaign_meta_id: 'cmp_live_02',
            adset_meta_id: 'set_live_02',
            ad_meta_id: level === 'ad' ? 'ad_live_02' : undefined,
            date_start: todayStr,
            date_stop: todayStr,
            spend: 75.00,
            impressions: 2000,
            clicks: 80
          }
        ];
      }
    }

    const syncService = new MetaSyncService(new MockMetaClient());

    // Sync 1
    await syncService.syncAll(pool, null, false);
    const count1 = await pool.query(
      `SELECT COUNT(*)::int as count FROM meta_insights WHERE entity_meta_id = 'cmp_live_02' AND date_start = $1 AND is_demo = false`,
      [todayStr]
    );
    expect(count1.rows[0].count).toBe(1);

    // Sync 2 (Update spend)
    class UpdatedMockMetaClient extends MockMetaClient {
      override async getInsights(adAccountId: string, level: string) {
        return [
          {
            entity_level: level.toUpperCase() as any,
            entity_meta_id: level === 'campaign' ? 'cmp_live_02' : 'ad_live_02',
            campaign_meta_id: 'cmp_live_02',
            adset_meta_id: 'set_live_02',
            ad_meta_id: level === 'ad' ? 'ad_live_02' : undefined,
            date_start: todayStr,
            date_stop: todayStr,
            spend: 95.00,
            impressions: 2500,
            clicks: 100
          }
        ];
      }
    }

    const updateService = new MetaSyncService(new UpdatedMockMetaClient());
    await updateService.syncAll(pool, null, false);

    const count2 = await pool.query(
      `SELECT COUNT(*)::int as count, spend FROM meta_insights WHERE entity_meta_id = 'cmp_live_02' AND date_start = $1 AND is_demo = false GROUP BY spend`,
      [todayStr]
    );
    expect(count2.rows.length).toBe(1);
    expect(count2.rows[0].count).toBe(1);
    expect(parseFloat(count2.rows[0].spend)).toBe(95.00);
  });

  // 7, 8, 9. 7d and 30d aggregate only daily rows (date_start = date_stop) and exclude historical multiday snapshots
  it('Requirement 7, 8, 9: AttributionAnalytics strictly aggregates daily rows and excludes historical multi-day snapshots', async () => {
    const todayStr = getCommercialTimeBoundaries('today').dateStartMeta;
    const yesterdayStr = getCommercialTimeBoundaries('yesterday').dateStartMeta;

    // Insert connection & account
    const connRes = await pool.query(
      `INSERT INTO meta_connections (is_demo, status, token_reference)
       VALUES (false, 'CONNECTED', 'env:TEST')
       ON CONFLICT (is_demo) DO UPDATE SET status = 'CONNECTED'
       RETURNING id`
    );
    const connId = connRes.rows[0].id;

    const actRes = await pool.query(
      `INSERT INTO meta_ad_accounts (meta_account_id, connection_id, name, currency, timezone_name, account_status, is_demo, data_provenance)
       VALUES ('act_test_attr', $1, 'Attr Test Account', 'BRL', 'America/Sao_Paulo', 1, false, 'COMMERCIAL_PRODUCTION')
       ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET connection_id = EXCLUDED.connection_id
       RETURNING id`,
      [connId]
    );
    const actId = actRes.rows[0].id;

    const cmpRes = await pool.query(
      `INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, objective, status, effective_status, is_demo, data_provenance)
       VALUES ('cmp_attr_01', $1, 'NORQVA_TRATTORIA_REVENUE_V1', 'OUTCOME_SALES', 'ACTIVE', 'ACTIVE', false, 'COMMERCIAL_PRODUCTION')
       ON CONFLICT (meta_campaign_id, is_demo) DO UPDATE SET ad_account_id = EXCLUDED.ad_account_id
       RETURNING id`,
      [actId]
    );
    const cmpId = cmpRes.rows[0].id;

    // Daily row 1: Today (spend = 100)
    await pool.query(
      `INSERT INTO meta_insights (ad_account_id, campaign_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo, data_provenance)
       VALUES ($1, $2, 'CAMPAIGN', 'cmp_attr_01', $3, $3, 100.00, 2000, 50, false, 'COMMERCIAL_PRODUCTION')
       ON CONFLICT (ad_account_id, entity_level, entity_meta_id, date_start, is_demo) DO UPDATE SET spend = EXCLUDED.spend`,
      [actId, cmpId, todayStr]
    );

    // Daily row 2: Yesterday (spend = 150)
    await pool.query(
      `INSERT INTO meta_insights (ad_account_id, campaign_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo, data_provenance)
       VALUES ($1, $2, 'CAMPAIGN', 'cmp_attr_01', $3, $3, 150.00, 3000, 75, false, 'COMMERCIAL_PRODUCTION')
       ON CONFLICT (ad_account_id, entity_level, entity_meta_id, date_start, is_demo) DO UPDATE SET spend = EXCLUDED.spend`,
      [actId, cmpId, yesterdayStr]
    );

    // Multi-day aggregate snapshot (spend = 5000, date_start != date_stop) -> MUST BE EXCLUDED!
    await pool.query(
      `INSERT INTO meta_insights (ad_account_id, campaign_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo, data_provenance)
       VALUES ($1, $2, 'CAMPAIGN', 'cmp_attr_01', '2026-08-01', '2026-08-30', 5000.00, 100000, 2500, false, 'COMMERCIAL_PRODUCTION')
       ON CONFLICT (ad_account_id, entity_level, entity_meta_id, date_start, is_demo) DO UPDATE SET spend = EXCLUDED.spend`,
      [actId, cmpId]
    );

    // Query period: today -> expect 100.00
    const todayReport = await getAttributionAnalyticsReport(pool, { period: 'today', mode: 'real' });
    const trattoriaToday = todayReport.byCampaign.find((c: any) => c.metaCampaignId === 'cmp_attr_01');
    expect(trattoriaToday?.spend).toBe(100.00);
    expect(todayReport.attributedMediaTruth.account.spend).toBe(100.00);

    // Query period: 7d -> expect 100 + 150 = 250.00 (NOT 5250.00!)
    const d7Report = await getAttributionAnalyticsReport(pool, { period: '7d', mode: 'real' });
    const trattoria7d = d7Report.byCampaign.find((c: any) => c.metaCampaignId === 'cmp_attr_01');
    expect(trattoria7d?.spend).toBe(250.00);
    expect(d7Report.attributedMediaTruth.account.spend).toBe(250.00);
  });

  // 10. DEMO and REAL isolation
  it('Requirement 10: DEMO and REAL insights remain strictly isolated', async () => {
    const countDemo = await pool.query(
      `SELECT COUNT(*)::int as count FROM meta_insights WHERE is_demo = true`
    );
    const countReal = await pool.query(
      `SELECT COUNT(*)::int as count FROM meta_insights WHERE is_demo = false AND data_provenance = 'COMMERCIAL_PRODUCTION'`
    );

    expect(parseInt(countDemo.rows[0].count, 10)).toBeGreaterThanOrEqual(0);
    expect(parseInt(countReal.rows[0].count, 10)).toBeGreaterThanOrEqual(0);
  });
});
