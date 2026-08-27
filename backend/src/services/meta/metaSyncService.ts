import { Pool, PoolClient } from 'pg';
import { MetaClient, MetaAdAccountPayload, MetaCampaignPayload, MetaAdSetPayload, MetaAdPayload, MetaInsightPayload } from './metaClient';
import { writeAuditLog } from '../../db/audit';

export interface MetaSyncResult {
  success: boolean;
  isDemo: boolean;
  adAccountsCount: number;
  campaignsCount: number;
  adSetsCount: number;
  adsCount: number;
  insightsCount: number;
  syncedAt: string;
  error?: string;
}

export class MetaSyncService {
  private client: MetaClient;

  constructor(client?: MetaClient) {
    this.client = client || new MetaClient();
  }

  public async syncAll(pool: Pool, userId: string | null, isDemo: boolean = false): Promise<MetaSyncResult> {
    const syncedAt = new Date().toISOString();

    // =========================================================================
    // STEP 1: FETCH DATA OUTSIDE POSTGRESQL TRANSACTION (NON-BLOCKING)
    // =========================================================================
    let adAccounts: MetaAdAccountPayload[] = [];
    const campaignsByAccount: Map<string, MetaCampaignPayload[]> = new Map();
    const adSetsByAccount: Map<string, MetaAdSetPayload[]> = new Map();
    const adsByAccount: Map<string, MetaAdPayload[]> = new Map();
    const insightsByAccount: Map<string, MetaInsightPayload[]> = new Map();

    try {
      // 1. Fetch Ad Accounts
      adAccounts = await this.client.getAdAccounts(isDemo);

      for (const act of adAccounts) {
        // 2. Fetch Campaigns
        const campaigns = await this.client.getCampaigns(act.id, isDemo);
        campaignsByAccount.set(act.id, campaigns);

        // 3. Fetch Ad Sets
        const adSets = await this.client.getAdSets(act.id, isDemo);
        adSetsByAccount.set(act.id, adSets);

        // 4. Fetch Ads
        const ads = await this.client.getAds(act.id, isDemo);
        adsByAccount.set(act.id, ads);

        // 5. Fetch Insights (Campaign level & Account level)
        const campaignInsights = await this.client.getInsights(act.id, 'campaign', 'last_30d', isDemo);
        insightsByAccount.set(act.id, campaignInsights);
      }
    } catch (fetchErr: any) {
      console.error('[Meta Sync Fetch Error]:', fetchErr);
      await writeAuditLog(pool, userId, 'META_SYNC_FAILED', `Fetch failed: ${fetchErr.message}`, null, null, isDemo, false);
      throw new Error(`[META SYNC ERROR]: Failed to fetch data from Meta Graph API: ${fetchErr.message}`);
    }

    // =========================================================================
    // STEP 2: OPEN SHORT POSTGRESQL TRANSACTION FOR IDEMPOTENT UPSERT BATCH
    // =========================================================================
    let counts = {
      adAccounts: 0,
      campaigns: 0,
      adSets: 0,
      ads: 0,
      insights: 0
    };

    const dbClient: PoolClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // 1. Connection metadata UPSERT
      await dbClient.query(
        `INSERT INTO meta_connections (is_demo, status, token_reference, last_validated_at, updated_at)
         VALUES ($1, 'CONNECTED', $2, NOW(), NOW())
         ON CONFLICT (is_demo) 
         DO UPDATE SET status = 'CONNECTED', last_validated_at = NOW(), updated_at = NOW()`,
        [isDemo, isDemo ? 'env:DEMO_MOCK' : 'env:META_ACCESS_TOKEN']
      );

      const connRow = (await dbClient.query('SELECT id FROM meta_connections WHERE is_demo = $1', [isDemo])).rows[0];
      const connectionId = connRow?.id;

      // 2. Ad Accounts UPSERT
      const accountDbIdMap = new Map<string, string>(); // meta_account_id -> db UUID

      for (const act of adAccounts) {
        const actRes = await dbClient.query(
          `INSERT INTO meta_ad_accounts (meta_account_id, connection_id, name, currency, timezone_name, account_status, is_demo, last_synced_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           ON CONFLICT (meta_account_id, is_demo)
           DO UPDATE SET name = EXCLUDED.name, currency = EXCLUDED.currency, timezone_name = EXCLUDED.timezone_name,
                         account_status = EXCLUDED.account_status, last_synced_at = NOW(), updated_at = NOW()
           RETURNING id`,
          [act.id, connectionId, act.name, act.currency, act.timezone_name, act.account_status, isDemo]
        );
        accountDbIdMap.set(act.id, actRes.rows[0].id);
        counts.adAccounts++;

        // 3. Campaigns UPSERT
        const campaigns = campaignsByAccount.get(act.id) || [];
        const campaignDbIdMap = new Map<string, string>(); // meta_campaign_id -> db UUID

        for (const cmp of campaigns) {
          const cmpRes = await dbClient.query(
            `INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, objective, status, effective_status, is_demo, last_synced_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
             ON CONFLICT (meta_campaign_id, is_demo)
             DO UPDATE SET name = EXCLUDED.name, objective = EXCLUDED.objective, status = EXCLUDED.status,
                           effective_status = EXCLUDED.effective_status, last_synced_at = NOW(), updated_at = NOW()
             RETURNING id`,
            [cmp.id, actRes.rows[0].id, cmp.name, cmp.objective || null, cmp.status, cmp.effective_status, isDemo]
          );
          campaignDbIdMap.set(cmp.id, cmpRes.rows[0].id);
          counts.campaigns++;
        }

        // 4. Ad Sets UPSERT
        const adSets = adSetsByAccount.get(act.id) || [];
        const adSetDbIdMap = new Map<string, string>(); // meta_adset_id -> db UUID

        for (const set of adSets) {
          const parentCmpDbId = campaignDbIdMap.get(set.campaign_id);
          if (!parentCmpDbId) continue;

          const setRes = await dbClient.query(
            `INSERT INTO meta_ad_sets (meta_adset_id, campaign_id, name, status, effective_status, optimization_goal, billing_event, daily_budget, lifetime_budget, is_demo, last_synced_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
             ON CONFLICT (meta_adset_id, is_demo)
             DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, effective_status = EXCLUDED.effective_status,
                           optimization_goal = EXCLUDED.optimization_goal, billing_event = EXCLUDED.billing_event,
                           daily_budget = EXCLUDED.daily_budget, lifetime_budget = EXCLUDED.lifetime_budget,
                           last_synced_at = NOW(), updated_at = NOW()
             RETURNING id`,
            [
              set.id, parentCmpDbId, set.name, set.status, set.effective_status,
              set.optimization_goal || null, set.billing_event || null,
              set.daily_budget || null, set.lifetime_budget || null, isDemo
            ]
          );
          adSetDbIdMap.set(set.id, setRes.rows[0].id);
          counts.adSets++;
        }

        // 5. Ads UPSERT
        const ads = adsByAccount.get(act.id) || [];
        const adDbIdMap = new Map<string, string>(); // meta_ad_id -> db UUID

        for (const ad of ads) {
          const parentSetDbId = adSetDbIdMap.get(ad.adset_id);
          if (!parentSetDbId) continue;

          const adRes = await dbClient.query(
            `INSERT INTO meta_ads (meta_ad_id, adset_id, name, status, effective_status, meta_creative_id, is_demo, last_synced_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
             ON CONFLICT (meta_ad_id, is_demo)
             DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, effective_status = EXCLUDED.effective_status,
                           meta_creative_id = EXCLUDED.meta_creative_id, last_synced_at = NOW(), updated_at = NOW()
             RETURNING id`,
            [ad.id, parentSetDbId, ad.name, ad.status, ad.effective_status, ad.creative?.id || null, isDemo]
          );
          adDbIdMap.set(ad.id, adRes.rows[0].id);
          counts.ads++;
        }

        // 6. Insights UPSERT (Deterministic on ad_account_id, entity_level, entity_meta_id, date_start, is_demo)
        const insights = insightsByAccount.get(act.id) || [];

        for (const ins of insights) {
          const cmpDbId = ins.campaign_meta_id ? campaignDbIdMap.get(ins.campaign_meta_id) || null : null;
          const setDbId = ins.adset_meta_id ? adSetDbIdMap.get(ins.adset_meta_id) || null : null;
          const adDbId = ins.ad_meta_id ? adDbIdMap.get(ins.ad_meta_id) || null : null;

          await dbClient.query(
            `INSERT INTO meta_insights (
               ad_account_id, campaign_id, adset_id, ad_id, entity_level, entity_meta_id,
               date_start, date_stop, spend, impressions, reach, clicks, link_clicks,
               cpc, cpm, ctr, frequency, raw_actions, is_demo, synced_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
             ON CONFLICT (ad_account_id, entity_level, entity_meta_id, date_start, is_demo)
             DO UPDATE SET
               campaign_id = EXCLUDED.campaign_id,
               adset_id = EXCLUDED.adset_id,
               ad_id = EXCLUDED.ad_id,
               date_stop = EXCLUDED.date_stop,
               spend = EXCLUDED.spend,
               impressions = EXCLUDED.impressions,
               reach = EXCLUDED.reach,
               clicks = EXCLUDED.clicks,
               link_clicks = EXCLUDED.link_clicks,
               cpc = EXCLUDED.cpc,
               cpm = EXCLUDED.cpm,
               ctr = EXCLUDED.ctr,
               frequency = EXCLUDED.frequency,
               raw_actions = EXCLUDED.raw_actions,
               synced_at = NOW()`,
            [
              actRes.rows[0].id, cmpDbId, setDbId, adDbId,
              ins.entity_level, ins.entity_meta_id,
              ins.date_start, ins.date_stop,
              ins.spend, ins.impressions, ins.reach || null, ins.clicks, ins.link_clicks || null,
              ins.cpc || null, ins.cpm || null, ins.ctr || null, ins.frequency || null,
              ins.raw_actions ? JSON.stringify(ins.raw_actions) : null,
              isDemo
            ]
          );
          counts.insights++;
        }
      }

      await dbClient.query('COMMIT');

      // Post-commit audit log (Never logs secrets)
      await writeAuditLog(
        pool,
        userId,
        'META_SYNC_COMPLETED',
        `Synced ${counts.adAccounts} ad accounts, ${counts.campaigns} campaigns, ${counts.adSets} ad sets, ${counts.ads} ads, ${counts.insights} insights.`,
        null,
        JSON.stringify(counts),
        isDemo,
        false
      );

      return {
        success: true,
        isDemo,
        adAccountsCount: counts.adAccounts,
        campaignsCount: counts.campaigns,
        adSetsCount: counts.adSets,
        adsCount: counts.ads,
        insightsCount: counts.insights,
        syncedAt
      };
    } catch (dbErr: any) {
      await dbClient.query('ROLLBACK');
      console.error('[Meta Sync DB Transaction Error]:', dbErr);
      await writeAuditLog(pool, userId, 'META_SYNC_FAILED', `Database transaction rollback: ${dbErr.message}`, null, null, isDemo, false);
      throw new Error(`[META SYNC DB ERROR]: ${dbErr.message}`);
    } finally {
      dbClient.release();
    }
  }
}
