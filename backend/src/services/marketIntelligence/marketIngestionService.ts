import { Pool, PoolClient } from 'pg';
import { NormalizedDiscoveryItem } from './marketDiscoveryProvider';

export interface IngestionResult {
  evidenceCreated: number;
  advertisersCreated: number;
  adsCreated: number;
  observationsCreated: number;
  offersCreated: number;
  creativesCreated: number;
  duplicatesSkipped: {
    evidence: number;
    ads: number;
    observations: number;
  };
}

export class MarketIngestionService {
  public static async ingestItems(
    poolOrClient: Pool | PoolClient,
    items: NormalizedDiscoveryItem[],
    userId?: string | null
  ): Promise<IngestionResult> {
    const isPool = 'connect' in poolOrClient;
    const client = isPool ? await (poolOrClient as Pool).connect() : (poolOrClient as PoolClient);

    const result: IngestionResult = {
      evidenceCreated: 0,
      advertisersCreated: 0,
      adsCreated: 0,
      observationsCreated: 0,
      offersCreated: 0,
      creativesCreated: 0,
      duplicatesSkipped: {
        evidence: 0,
        ads: 0,
        observations: 0
      }
    };

    try {
      if (isPool) {
        await client.query('BEGIN');
      }

      for (const item of items) {
        // 1. Ingest Evidence (Deterministic content_hash idempotency)
        let evidenceId: string;
        const evCheck = await client.query(
          'SELECT id FROM market_evidence WHERE content_hash = $1',
          [item.evidence.content_hash]
        );

        if (evCheck.rows.length > 0) {
          evidenceId = evCheck.rows[0].id;
          result.duplicatesSkipped.evidence++;
        } else {
          const evInsert = await client.query(
            `INSERT INTO market_evidence (
              source_type, source_url, capture_method, content_hash, captured_payload, captured_by, observed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id`,
            [
              item.evidence.source_type,
              item.evidence.source_url,
              item.evidence.capture_method,
              item.evidence.content_hash,
              JSON.stringify(item.evidence.captured_payload),
              userId || null,
              item.evidence.observed_at
            ]
          );
          evidenceId = evInsert.rows[0].id;
          result.evidenceCreated++;
        }

        // 2. Ingest Advertiser (Check + Upsert)
        let advertiserId: string;
        const advCheck = await client.query(
          'SELECT id FROM market_advertisers WHERE page_id = $1',
          [item.advertiser.page_id]
        );

        if (advCheck.rows.length > 0) {
          advertiserId = advCheck.rows[0].id;
          await client.query(
            `UPDATE market_advertisers SET
              page_name = $1,
              last_seen_at = NOW(),
              is_active = $2
            WHERE id = $3`,
            [item.advertiser.page_name, item.advertiser.is_active, advertiserId]
          );
        } else {
          const advInsert = await client.query(
            `INSERT INTO market_advertisers (
              page_id, page_name, page_url, country, category, is_active, last_seen_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING id`,
            [
              item.advertiser.page_id,
              item.advertiser.page_name,
              item.advertiser.page_url || null,
              item.advertiser.country,
              item.advertiser.category || null,
              item.advertiser.is_active
            ]
          );
          advertiserId = advInsert.rows[0].id;
          result.advertisersCreated++;
        }

        // 3. Optional Offer (created ONLY when identifiable destination URL exists)
        let offerId: string | null = null;
        if (item.offer) {
          const offRes = await client.query(
            `INSERT INTO market_offers (
              advertiser_id, offer_name, offer_category, destination_url, observed_price, currency, offer_type, evidence_id, last_seen_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            RETURNING id`,
            [
              advertiserId,
              item.offer.offer_name,
              item.offer.offer_category,
              item.offer.destination_url,
              item.offer.observed_price,
              item.offer.currency,
              item.offer.offer_type,
              evidenceId
            ]
          );
          offerId = offRes.rows[0].id;
          result.offersCreated++;
        }

        // 4. Ingest Ad (Check + Upsert on ad_library_id)
        let adDbId: string;
        const adCheck = await client.query(
          'SELECT id FROM market_ads WHERE ad_library_id = $1',
          [item.ad.ad_library_id]
        );

        if (adCheck.rows.length > 0) {
          adDbId = adCheck.rows[0].id;
          await client.query(
            `UPDATE market_ads SET
              primary_text = $1,
              headline = $2,
              description = $3,
              cta = $4,
              active_status = $5,
              last_seen_at = NOW(),
              evidence_id = $6,
              updated_at = NOW()
            WHERE id = $7`,
            [
              item.ad.primary_text,
              item.ad.headline,
              item.ad.description,
              item.ad.cta,
              item.ad.active_status,
              evidenceId,
              adDbId
            ]
          );
          result.duplicatesSkipped.ads++;
        } else {
          const adInsert = await client.query(
            `INSERT INTO market_ads (
              ad_library_id, advertiser_id, offer_id, primary_text, headline, description,
              cta, ad_start_date, ad_end_date, active_status, publisher_platforms,
              snapshot_url, destination_url, multiple_versions_observed, evidence_id, last_seen_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
            RETURNING id`,
            [
              item.ad.ad_library_id,
              advertiserId,
              offerId,
              item.ad.primary_text,
              item.ad.headline,
              item.ad.description,
              item.ad.cta,
              item.ad.ad_start_date,
              item.ad.ad_end_date,
              item.ad.active_status,
              item.ad.publisher_platforms,
              item.ad.snapshot_url,
              item.ad.destination_url,
              item.ad.multiple_versions_observed,
              evidenceId
            ]
          );
          adDbId = adInsert.rows[0].id;
          result.adsCreated++;
        }

        // 5. Ingest Observation (UNIQUE on ad_id, observed_date)
        const obsCheck = await client.query(
          'SELECT id FROM market_observations WHERE ad_id = $1 AND observed_date = $2',
          [adDbId, item.observation.observed_date]
        );

        if (obsCheck.rows.length > 0) {
          await client.query(
            `UPDATE market_observations SET
              observed_status = $1,
              content_fingerprint = $2,
              evidence_id = $3
            WHERE id = $4`,
            [
              item.observation.observed_status,
              item.observation.content_fingerprint,
              evidenceId,
              obsCheck.rows[0].id
            ]
          );
          result.duplicatesSkipped.observations++;
        } else {
          await client.query(
            `INSERT INTO market_observations (
              ad_id, observed_date, observed_status, content_fingerprint, content_changed, change_fields, evidence_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              adDbId,
              item.observation.observed_date,
              item.observation.observed_status,
              item.observation.content_fingerprint,
              item.observation.content_changed,
              item.observation.change_fields,
              evidenceId
            ]
          );
          result.observationsCreated++;
        }

        // 6. Ingest Creative (if present and not already created for ad)
        if (item.creative) {
          const crCheck = await client.query(
            'SELECT id FROM market_creatives WHERE ad_id = $1',
            [adDbId]
          );
          if (crCheck.rows.length === 0) {
            await client.query(
              `INSERT INTO market_creatives (
                ad_id, creative_type, aspect_ratio, duration_seconds, asset_reference,
                hook_text, hook_visual, angle, promise, pain_point, desire, mechanism, cta_type, classifications
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
              [
                adDbId,
                item.creative.creative_type,
                item.creative.aspect_ratio || null,
                item.creative.duration_seconds || null,
                item.creative.asset_reference || null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                JSON.stringify(item.creative.classifications)
              ]
            );
            result.creativesCreated++;
          }
        }
      }

      if (isPool) {
        await client.query('COMMIT');
      }

      return result;
    } catch (err) {
      if (isPool) {
        await client.query('ROLLBACK');
      }
      throw err;
    } finally {
      if (isPool) {
        client.release();
      }
    }
  }
}
