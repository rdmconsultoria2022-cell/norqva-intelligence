import { Pool, PoolClient } from 'pg';
import { MetaClient, MetaDemographicInsightPayload } from './metaClient';
import { getCommercialTimeBoundaries } from '../../utils/commercialTimezone';
import { writeAuditLog } from '../../db/audit';

export interface DemographicIngestionOptions {
  datePreset?: string;
  timeRange?: { since: string; until: string };
  timeIncrement?: string | number;
}

export interface DemographicIngestionSummary {
  rowsFetched: number;
  rowsNormalized: number;
  rowsPersisted: number;
  rowsSkipped: number;
  unknownAgeRows: number;
  unknownGenderRows: number;
  unresolvedEntityRows: number;
  dateStart: string;
  dateStop: string;
  mode: 'real' | 'demo';
  syncedAt: string;
}

export const PERMITTED_AGE_GROUPS = new Set([
  '18-24',
  '25-34',
  '35-44',
  '45-54',
  '55-64',
  '65+',
  'unknown'
]);

export const PERMITTED_GENDERS = new Set([
  'male',
  'female',
  'unknown'
]);

export function normalizeAgeGroup(rawAge?: string): { ageGroup: string; isUnknownFallback: boolean } {
  if (!rawAge) return { ageGroup: 'unknown', isUnknownFallback: true };
  const cleaned = String(rawAge).trim().toLowerCase();
  if (PERMITTED_AGE_GROUPS.has(cleaned)) {
    return { ageGroup: cleaned, isUnknownFallback: false };
  }
  return { ageGroup: 'unknown', isUnknownFallback: true };
}

export function normalizeGender(rawGender?: string): { gender: string; isUnknownFallback: boolean } {
  if (!rawGender) return { gender: 'unknown', isUnknownFallback: true };
  const cleaned = String(rawGender).trim().toLowerCase();
  if (PERMITTED_GENDERS.has(cleaned)) {
    return { gender: cleaned, isUnknownFallback: false };
  }
  return { gender: 'unknown', isUnknownFallback: true };
}

export class MetaDemographicIngestionService {
  private client: MetaClient;

  constructor(client?: MetaClient) {
    this.client = client || new MetaClient();
  }

  /**
   * Ingests demographic breakdown data (Age + Gender at Ad level) with strict idempotency,
   * daily granularity, entity resolution against canonical tables, and complete isolation from meta_insights.
   */
  public async ingestDemographics(
    pool: Pool,
    userId: string | null,
    isDemo: boolean = false,
    options?: DemographicIngestionOptions
  ): Promise<DemographicIngestionSummary> {
    const syncedAt = new Date().toISOString();
    const defaultBoundaries = getCommercialTimeBoundaries('30d');
    const timeRangeToUse = options?.timeRange || (options?.datePreset ? undefined : { since: defaultBoundaries.dateStartMeta, until: defaultBoundaries.dateStopMeta });
    const datePresetToUse = options?.datePreset;
    const timeIncrementToUse = options?.timeIncrement ?? 1;

    const dateStart = timeRangeToUse?.since || getCommercialTimeBoundaries(datePresetToUse || 'today').dateStartMeta;
    const dateStop = timeRangeToUse?.until || getCommercialTimeBoundaries(datePresetToUse || 'today').dateStopMeta;

    // 1. Fetch Ad Accounts for the environment
    const adAccounts = await this.client.getAdAccounts(isDemo);

    let rowsFetched = 0;
    let rowsNormalized = 0;
    let rowsPersisted = 0;
    let rowsSkipped = 0;
    let unknownAgeRows = 0;
    let unknownGenderRows = 0;
    let unresolvedEntityRows = 0;

    const dbClient: PoolClient = await pool.connect();

    try {
      await dbClient.query('BEGIN');

      const provenance = isDemo ? 'DEMO_SEED' : 'COMMERCIAL_PRODUCTION';

      for (const act of adAccounts) {
        // Resolve Ad Account UUID in database
        const actRes = await dbClient.query(
          `SELECT id FROM meta_ad_accounts WHERE meta_account_id = $1 AND is_demo = $2`,
          [act.id, isDemo]
        );

        if (actRes.rows.length === 0) {
          console.warn(`[Demographic Ingestion]: Ad account ${act.id} (is_demo=${isDemo}) not found in database. Skipping.`);
          continue;
        }

        const adAccountDbId = actRes.rows[0].id;

        // Preload entity resolution map for all ads in this account: meta_ad_id -> { ad_id, adset_id, campaign_id }
        const adsHierarchyRes = await dbClient.query(
          `SELECT 
             ma.id as ad_id,
             ma.meta_ad_id,
             mas.id as adset_id,
             mas.meta_adset_id,
             mc.id as campaign_id,
             mc.meta_campaign_id
           FROM meta_ads ma
           JOIN meta_ad_sets mas ON mas.id = ma.adset_id
           JOIN meta_campaigns mc ON mc.id = mas.campaign_id
           WHERE mc.ad_account_id = $1 AND ma.is_demo = $2`,
          [adAccountDbId, isDemo]
        );

        const adMap = new Map<string, { ad_id: string; adset_id: string; campaign_id: string }>();
        adsHierarchyRes.rows.forEach(r => {
          adMap.set(r.meta_ad_id, {
            ad_id: r.ad_id,
            adset_id: r.adset_id,
            campaign_id: r.campaign_id
          });
        });

        // 2. Fetch Demographic Insights (Age + Gender at Ad level)
        const rawDemographicInsights: MetaDemographicInsightPayload[] = await this.client.getDemographicInsights(
          act.id,
          {
            datePreset: datePresetToUse,
            timeRange: timeRangeToUse,
            timeIncrement: timeIncrementToUse
          },
          isDemo
        );

        rowsFetched += rawDemographicInsights.length;

        for (const row of rawDemographicInsights) {
          // Check daily granularity: date_start MUST equal date_stop
          if (row.date_start !== row.date_stop) {
            console.warn(`[Demographic Ingestion Warning]: Non-daily record detected (${row.date_start} -> ${row.date_stop}). Rejecting multi-day row.`);
            rowsSkipped++;
            continue;
          }

          // Entity Resolution
          const matchedEntity = adMap.get(row.ad_meta_id);
          if (!matchedEntity) {
            console.warn(`[Demographic Ingestion Warning]: Unresolved Meta Ad ID "${row.ad_meta_id}" for account ${act.id}. Skipping row.`);
            unresolvedEntityRows++;
            rowsSkipped++;
            continue;
          }

          // Normalization
          const ageNorm = normalizeAgeGroup(row.age);
          if (ageNorm.isUnknownFallback) {
            console.warn(`[Demographic Ingestion Warning]: Unrecognized age "${row.age}". Normalized to "unknown".`);
            unknownAgeRows++;
          }

          const genderNorm = normalizeGender(row.gender);
          if (genderNorm.isUnknownFallback) {
            console.warn(`[Demographic Ingestion Warning]: Unrecognized gender "${row.gender}". Normalized to "unknown".`);
            unknownGenderRows++;
          }

          rowsNormalized++;

          // 3. Upsert into meta_demographic_insights
          await dbClient.query(
            `INSERT INTO meta_demographic_insights (
               ad_account_id,
               campaign_id,
               adset_id,
               ad_id,
               entity_level,
               entity_meta_id,
               date_start,
               date_stop,
               age_group,
               gender,
               spend,
               impressions,
               reach,
               clicks,
               link_clicks,
               cpc,
               cpm,
               ctr,
               data_provenance,
               is_demo,
               synced_at
             ) VALUES (
               $1, $2, $3, $4,
               'AD', $5,
               $6, $7,
               $8, $9,
               $10, $11, $12, $13, $14,
               $15, $16, $17,
               $18, $19, NOW()
             )
             ON CONFLICT (ad_account_id, entity_level, entity_meta_id, date_start, age_group, gender, is_demo)
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
               data_provenance = EXCLUDED.data_provenance,
               synced_at = NOW()`,
            [
              adAccountDbId,
              matchedEntity.campaign_id,
              matchedEntity.adset_id,
              matchedEntity.ad_id,
              row.ad_meta_id,
              row.date_start,
              row.date_stop,
              ageNorm.ageGroup,
              genderNorm.gender,
              row.spend,
              row.impressions,
              row.reach || null,
              row.clicks,
              row.link_clicks || null,
              row.cpc || null,
              row.cpm || null,
              row.ctr || null,
              provenance,
              isDemo
            ]
          );

          rowsPersisted++;
        }
      }

      await dbClient.query('COMMIT');

      const summary: DemographicIngestionSummary = {
        rowsFetched,
        rowsNormalized,
        rowsPersisted,
        rowsSkipped,
        unknownAgeRows,
        unknownGenderRows,
        unresolvedEntityRows,
        dateStart,
        dateStop,
        mode: isDemo ? 'demo' : 'real',
        syncedAt
      };

      await writeAuditLog(
        pool,
        userId,
        'META_DEMOGRAPHIC_INGESTION_COMPLETED',
        `Demographic ingestion completed. Fetched: ${rowsFetched}, Persisted: ${rowsPersisted}, Skipped: ${rowsSkipped}, Unresolved: ${unresolvedEntityRows}.`,
        null,
        JSON.stringify(summary),
        isDemo,
        false
      );

      return summary;
    } catch (err: any) {
      await dbClient.query('ROLLBACK');
      console.error('[Meta Demographic Ingestion DB Transaction Error]:', err);
      await writeAuditLog(
        pool,
        userId,
        'META_DEMOGRAPHIC_INGESTION_FAILED',
        `Demographic ingestion failed: ${err.message}`,
        null,
        null,
        isDemo,
        false
      );
      throw new Error(`[META DEMOGRAPHIC INGESTION ERROR]: ${err.message}`);
    } finally {
      dbClient.release();
    }
  }
}
