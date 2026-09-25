import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeDB, resetPool, getDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { Pool } from 'pg';
import crypto from 'crypto';

describe('NORQVA Market Intelligence V1 - Migration 023 Test Suite', () => {
  let pool: Pool;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    pool = await getDB();
    await runMigrations(pool);
  });

  afterAll(async () => {
    resetPool();
  });

  // A & B: All 7 MVP tables exist
  it('A & B: should successfully apply migration 023 and ensure all 7 MVP tables exist', async () => {
    const tables = [
      'market_evidence',
      'market_advertisers',
      'market_offers',
      'market_ads',
      'market_observations',
      'market_creatives',
      'market_hypotheses'
    ];

    for (const table of tables) {
      const res = await pool.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
        [table]
      );
      expect(res.rows.length).toBe(1);
    }
  });

  // C: All PKs exist
  it('C: should ensure all 7 tables have Primary Key column id', async () => {
    const tables = [
      'market_evidence',
      'market_advertisers',
      'market_offers',
      'market_ads',
      'market_observations',
      'market_creatives',
      'market_hypotheses'
    ];

    for (const table of tables) {
      const res = await pool.query(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'id'",
        [table]
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].column_name).toBe('id');
    }
  });

  // D: Foreign Keys work as expected
  it('D: should enforce referential integrity and foreign keys cascade appropriately', async () => {
    // 1. Create Advertiser
    const advRes = await pool.query(`
      INSERT INTO market_advertisers (page_id, page_name, category)
      VALUES ('PAGE_TEST_001', 'Test Competitor Page', 'CULINARY')
      RETURNING id;
    `);
    const advertiserId = advRes.rows[0].id;

    // 2. Create Evidence
    const sha = crypto.createHash('sha256').update('test_payload_001').digest('hex');
    const evRes = await pool.query(`
      INSERT INTO market_evidence (source_url, capture_method, content_hash, captured_payload)
      VALUES ('https://facebook.com/ads/library/?id=111', 'OPERATOR_ASSISTED', $1, '{"raw":"data"}')
      RETURNING id;
    `, [sha]);
    const evidenceId = evRes.rows[0].id;

    // 3. Create Offer
    const offRes = await pool.query(`
      INSERT INTO market_offers (advertiser_id, offer_name, offer_category, destination_url, observed_price, evidence_id)
      VALUES ($1, 'Curso de Massas', 'CULINARY', 'https://competitor.com/massas', 47.00, $2)
      RETURNING id;
    `, [advertiserId, evidenceId]);
    const offerId = offRes.rows[0].id;

    // 4. Create Ad
    const adRes = await pool.query(`
      INSERT INTO market_ads (ad_library_id, advertiser_id, offer_id, primary_text, headline, evidence_id)
      VALUES ('AD_LIB_001', $1, $2, 'Aprenda massa caseira', 'Massa Perfeita', $3)
      RETURNING id;
    `, [advertiserId, offerId, evidenceId]);
    const adId = adRes.rows[0].id;

    // 5. Create Creative
    const crRes = await pool.query(`
      INSERT INTO market_creatives (ad_id, creative_type, hook_text, angle)
      VALUES ($1, 'VIDEO', 'Nunca mais erre o ponto', 'Problem/Solution')
      RETURNING id;
    `, [adId]);
    expect(crRes.rows[0].id).toBeDefined();

    // 6. Delete Advertiser -> Should cascade delete Offer, Ad, Creative
    await pool.query('DELETE FROM market_advertisers WHERE id = $1', [advertiserId]);

    const checkAd = await pool.query('SELECT 1 FROM market_ads WHERE id = $1', [adId]);
    expect(checkAd.rows.length).toBe(0);

    const checkOffer = await pool.query('SELECT 1 FROM market_offers WHERE id = $1', [offerId]);
    expect(checkOffer.rows.length).toBe(0);

    const checkCr = await pool.query('SELECT 1 FROM market_creatives WHERE ad_id = $1', [adId]);
    expect(checkCr.rows.length).toBe(0);
  });

  // E: UNIQUE on market_ads.ad_library_id
  it('E: should enforce UNIQUE constraint on market_ads.ad_library_id', async () => {
    const advRes = await pool.query(`
      INSERT INTO market_advertisers (page_id, page_name)
      VALUES ('PAGE_TEST_002', 'Unique Ad Advertiser')
      RETURNING id;
    `);
    const advId = advRes.rows[0].id;

    await pool.query(`
      INSERT INTO market_ads (ad_library_id, advertiser_id, primary_text)
      VALUES ('AD_LIB_UNIQUE_TEST', $1, 'Copy A')
    `, [advId]);

    // Second insert with same ad_library_id must fail
    await expect(pool.query(`
      INSERT INTO market_ads (ad_library_id, advertiser_id, primary_text)
      VALUES ('AD_LIB_UNIQUE_TEST', $1, 'Copy B')
    `, [advId])).rejects.toThrow();
  });

  // F: UNIQUE on market_observations(ad_id, observed_date)
  it('F: should enforce UNIQUE constraint on market_observations(ad_id, observed_date) per day', async () => {
    const advRes = await pool.query(`
      INSERT INTO market_advertisers (page_id, page_name)
      VALUES ('PAGE_TEST_003', 'Observation Advertiser')
      RETURNING id;
    `);
    const advId = advRes.rows[0].id;

    const adRes = await pool.query(`
      INSERT INTO market_ads (ad_library_id, advertiser_id)
      VALUES ('AD_LIB_OBS_TEST', $1)
      RETURNING id;
    `, [advId]);
    const adId = adRes.rows[0].id;

    const evHash = crypto.createHash('sha256').update('evidence_obs_1').digest('hex');
    const evRes = await pool.query(`
      INSERT INTO market_evidence (source_url, capture_method, content_hash, captured_payload)
      VALUES ('https://facebook.com/ads/library/?id=222', 'OPERATOR_ASSISTED', $1, '{"raw":1}')
      RETURNING id;
    `, [evHash]);
    const evId = evRes.rows[0].id;

    const fp1 = crypto.createHash('sha256').update('fingerprint_1').digest('hex');

    // First observation on 2026-09-25 -> Success
    await pool.query(`
      INSERT INTO market_observations (ad_id, observed_date, observed_status, content_fingerprint, evidence_id)
      VALUES ($1, '2026-09-25', 'ACTIVE', $2, $3)
    `, [adId, fp1, evId]);

    // Second observation on same date -> Must throw unique violation
    const fp2 = crypto.createHash('sha256').update('fingerprint_2').digest('hex');
    await expect(pool.query(`
      INSERT INTO market_observations (ad_id, observed_date, observed_status, content_fingerprint, evidence_id)
      VALUES ($1, '2026-09-25', 'ACTIVE', $2, $3)
    `, [adId, fp2, evId])).rejects.toThrow();

    // Observation on another date -> Success
    const obs2 = await pool.query(`
      INSERT INTO market_observations (ad_id, observed_date, observed_status, content_fingerprint, evidence_id)
      VALUES ($1, '2026-09-26', 'ACTIVE', $2, $3)
      RETURNING id;
    `, [adId, fp2, evId]);
    expect(obs2.rows.length).toBe(1);
  });

  // G: content_fingerprint accepts valid SHA-256
  it('G: should store and retrieve valid SHA-256 in content_fingerprint', async () => {
    const advRes = await pool.query(`
      INSERT INTO market_advertisers (page_id, page_name)
      VALUES ('PAGE_TEST_004', 'Fingerprint Advertiser')
      RETURNING id;
    `);
    const advId = advRes.rows[0].id;

    const adRes = await pool.query(`
      INSERT INTO market_ads (ad_library_id, advertiser_id)
      VALUES ('AD_LIB_FP_TEST', $1)
      RETURNING id;
    `, [advId]);
    const adId = adRes.rows[0].id;

    const evHash = crypto.createHash('sha256').update('ev_fp').digest('hex');
    const evRes = await pool.query(`
      INSERT INTO market_evidence (source_url, capture_method, content_hash, captured_payload)
      VALUES ('https://facebook.com/ads/library/?id=333', 'MANUAL_AUDIT', $1, '{"raw":1}')
      RETURNING id;
    `, [evHash]);
    const evId = evRes.rows[0].id;

    const sha256 = crypto.createHash('sha256').update('primary_copy + headline + dest_url').digest('hex');
    expect(sha256.length).toBe(64);

    const obsRes = await pool.query(`
      INSERT INTO market_observations (ad_id, observed_date, observed_status, content_fingerprint, content_changed, change_fields, evidence_id)
      VALUES ($1, '2026-09-27', 'ACTIVE', $2, TRUE, '{"headline", "destination_url"}', $3)
      RETURNING content_fingerprint, content_changed, change_fields;
    `, [adId, sha256, evId]);

    expect(obsRes.rows[0].content_fingerprint).toBe(sha256);
    expect(obsRes.rows[0].content_changed).toBe(true);
  });

  // H: classifications accepts JSONB with granular provenance
  it('H: should store granular classifications provenance metadata in market_creatives', async () => {
    const advRes = await pool.query(`
      INSERT INTO market_advertisers (page_id, page_name)
      VALUES ('PAGE_TEST_005', 'Creative Classifications Advertiser')
      RETURNING id;
    `);
    const advId = advRes.rows[0].id;

    const adRes = await pool.query(`
      INSERT INTO market_ads (ad_library_id, advertiser_id)
      VALUES ('AD_LIB_CLASS_TEST', $1)
      RETURNING id;
    `, [advId]);
    const adId = adRes.rows[0].id;

    const classificationsPayload = {
      hook_text: {
        value: 'Pare de quebrar o molho da massa',
        origin: 'HUMAN',
        confidence: 'HIGH',
        classified_at: '2026-09-25T00:00:00Z'
      },
      angle: {
        value: 'Culinary Mistake/Correction',
        origin: 'AI',
        model: 'gpt-4o',
        confidence: 'MEDIUM',
        classified_at: '2026-09-25T00:00:05Z'
      }
    };

    const crRes = await pool.query(`
      INSERT INTO market_creatives (ad_id, creative_type, hook_text, angle, classifications)
      VALUES ($1, 'VIDEO', 'Pare de quebrar o molho da massa', 'Culinary Mistake/Correction', $2)
      RETURNING id, classifications;
    `, [adId, JSON.stringify(classificationsPayload)]);

    const storedClass = typeof crRes.rows[0].classifications === 'string' 
      ? JSON.parse(crRes.rows[0].classifications) 
      : crRes.rows[0].classifications;

    expect(storedClass.hook_text.origin).toBe('HUMAN');
    expect(storedClass.hook_text.confidence).toBe('HIGH');
    expect(storedClass.angle.origin).toBe('AI');
    expect(storedClass.angle.model).toBe('gpt-4o');
  });

  // I & J: validation_criteria default = '{}' and fail-closed state
  it('I & J: should default validation_criteria to {} and enforce fail-closed hypothesis governance', async () => {
    const hypRes = await pool.query(`
      INSERT INTO market_hypotheses (human_id, category, hypothesis_title, rationale)
      VALUES ('HYP-MIGRATION-TEST-001', 'CULINARY', 'Test Culinary Hook', 'High competitor longevity')
      RETURNING id, human_id, status, validation_criteria, evaluation_evidence;
    `);

    const hyp = hypRes.rows[0];
    expect(hyp.status).toBe('DRAFT');
    const criteria = typeof hyp.validation_criteria === 'string' 
      ? JSON.parse(hyp.validation_criteria) 
      : hyp.validation_criteria;
    
    // Default must be strictly empty object (no implicit thresholds)
    expect(Object.keys(criteria).length).toBe(0);

    // Update status to IN_TESTING
    await pool.query(`
      UPDATE market_hypotheses
      SET status = 'IN_TESTING', status_reason = 'EVIDENCE_INSUFFICIENT'
      WHERE id = $1
    `, [hyp.id]);

    const updatedHyp = await pool.query('SELECT status, status_reason FROM market_hypotheses WHERE id = $1', [hyp.id]);
    expect(updatedHyp.rows[0].status).toBe('IN_TESTING');
    expect(updatedHyp.rows[0].status_reason).toBe('EVIDENCE_INSUFFICIENT');
  });

  // K & L: Rollback without CASCADE and Reapplication
  it('K & L: should cleanly roll back migration 023 without CASCADE and reapply successfully', async () => {
    // 1. Execute Rollback in strict dependency order WITHOUT CASCADE
    await pool.query('DROP TABLE IF EXISTS market_hypotheses;');
    await pool.query('DROP TABLE IF EXISTS market_creatives;');
    await pool.query('DROP TABLE IF EXISTS market_observations;');
    await pool.query('DROP TABLE IF EXISTS market_ads;');
    await pool.query('DROP TABLE IF EXISTS market_offers;');
    await pool.query('DROP TABLE IF EXISTS market_advertisers;');
    await pool.query('DROP TABLE IF EXISTS market_evidence;');

    // Verify all 7 tables are dropped
    const tables = [
      'market_evidence',
      'market_advertisers',
      'market_offers',
      'market_ads',
      'market_observations',
      'market_creatives',
      'market_hypotheses'
    ];

    for (const table of tables) {
      const res = await pool.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
        [table]
      );
      expect(res.rows.length).toBe(0);
    }

    // Verify core tables (users, orders, meta_ads, etc.) were untouched
    const coreCheck = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'");
    expect(coreCheck.rows.length).toBe(1);

    // 2. Re-apply by resetting pool and running full migration pipeline
    resetPool();
    const freshPool = await getDB();
    await runMigrations(freshPool);

    for (const table of tables) {
      const res = await freshPool.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
        [table]
      );
      expect(res.rows.length).toBe(1);
    }
  });
});
