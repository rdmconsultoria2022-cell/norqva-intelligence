import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';

describe('GATE: 16.4F — META INSIGHTS IDEMPOTENCY PRE-DEPLOY CERTIFICATION', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
  });

  beforeEach(async () => {
    const stmts = [
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

  // Section 2: Teste de Colisão Obrigatório
  it('Section 2: Simulating collision between historical multi-day snapshot and daily record on identical date_start', async () => {
    const connRes = await pool.query(
      "INSERT INTO meta_connections (is_demo, status, token_reference) VALUES (FALSE, 'CONNECTED', 'env:TEST') RETURNING id"
    );
    const connId = connRes.rows[0].id;

    const accRes = await pool.query(
      "INSERT INTO meta_ad_accounts (meta_account_id, connection_id, name, currency, timezone_name, account_status, is_demo, data_provenance) VALUES ('act_test_col', $1, 'Test Account', 'BRL', 'America/Sao_Paulo', 1, FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [connId]
    );
    const accId = accRes.rows[0].id;

    const cmpRes = await pool.query(
      "INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance) VALUES ('cmp_col_01', $1, 'Collision Campaign', 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [accId]
    );
    const cmpId = cmpRes.rows[0].id;

    // 1. Criar registro existente (Multi-day Snapshot):
    // entity = cmp_col_01, date_start = 2026-09-25, date_stop = 2026-10-24, spend = 100.00
    await pool.query(
      `INSERT INTO meta_insights (
         ad_account_id, campaign_id, entity_level, entity_meta_id,
         date_start, date_stop, spend, impressions, clicks, is_demo, data_provenance
       ) VALUES ($1, $2, 'CAMPAIGN', 'cmp_col_01', '2026-09-25', '2026-10-24', 100.00, 5000, 200, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [accId, cmpId]
    );

    const initialRows = (await pool.query("SELECT * FROM meta_insights WHERE entity_meta_id = 'cmp_col_01'")).rows;
    expect(initialRows.length).toBe(1);
    expect(initialRows[0].date_stop.toISOString().split('T')[0]).toBe('2026-10-24');
    expect(parseFloat(initialRows[0].spend)).toBe(100.00);

    // 2. Executar exatamente o UPSERT utilizado em produção com dados DAILY:
    // entity = cmp_col_01, date_start = 2026-09-25, date_stop = 2026-09-25, spend = 10.00
    await pool.query(
      `INSERT INTO meta_insights (
         ad_account_id, campaign_id, adset_id, ad_id, entity_level, entity_meta_id,
         date_start, date_stop, spend, impressions, reach, clicks, link_clicks,
         cpc, cpm, ctr, frequency, raw_actions, is_demo, data_provenance, synced_at
       )
       VALUES ($1, $2, NULL, NULL, 'CAMPAIGN', 'cmp_col_01', '2026-09-25', '2026-09-25', 10.00, 500, NULL, 20, NULL, NULL, NULL, NULL, NULL, NULL, FALSE, 'COMMERCIAL_PRODUCTION', NOW())
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
         data_provenance = CASE WHEN meta_insights.data_provenance = 'UNKNOWN' THEN EXCLUDED.data_provenance ELSE meta_insights.data_provenance END,
         synced_at = NOW()`,
      [accId, cmpId]
    );

    const postUpsertRows = (await pool.query("SELECT * FROM meta_insights WHERE entity_meta_id = 'cmp_col_01'")).rows;

    // Respostas aos itens A, B, C, D, E:
    // A) INSERT daily cria segunda linha? -> NÃO (postUpsertRows.length == 1)
    expect(postUpsertRows.length).toBe(1);

    // B) atualiza snapshot existente? -> SIM
    // C) ocorre erro de constraint? -> NÃO (UPSERT handled cleanly)
    // D) date_stop do snapshot é alterado? -> SIM (alterado para 2026-09-25)
    expect(postUpsertRows[0].date_stop.toISOString().split('T')[0]).toBe('2026-09-25');

    // E) spend do snapshot é alterado? -> SIM (alterado para 10.00)
    expect(parseFloat(postUpsertRows[0].spend)).toBe(10.00);
  });

  // Section 3: Teste de Idempotência Daily
  it('Section 3: Daily idempotency test — re-running daily ingestion updates spend and produces exactly 1 row', async () => {
    const connRes = await pool.query(
      "INSERT INTO meta_connections (is_demo, status, token_reference) VALUES (FALSE, 'CONNECTED', 'env:TEST') RETURNING id"
    );
    const connId = connRes.rows[0].id;

    const accRes = await pool.query(
      "INSERT INTO meta_ad_accounts (meta_account_id, connection_id, name, currency, timezone_name, account_status, is_demo, data_provenance) VALUES ('act_test_idem', $1, 'Test Account', 'BRL', 'America/Sao_Paulo', 1, FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [connId]
    );
    const accId = accRes.rows[0].id;

    const cmpRes = await pool.query(
      "INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance) VALUES ('cmp_idem_01', $1, 'Idempotent Campaign', 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [accId]
    );
    const cmpId = cmpRes.rows[0].id;

    // 1. Inserir daily: 2026-09-25 / 2026-09-25, spend = 10.00
    await pool.query(
      `INSERT INTO meta_insights (
         ad_account_id, campaign_id, adset_id, ad_id, entity_level, entity_meta_id,
         date_start, date_stop, spend, impressions, reach, clicks, link_clicks,
         cpc, cpm, ctr, frequency, raw_actions, is_demo, data_provenance, synced_at
       )
       VALUES ($1, $2, NULL, NULL, 'CAMPAIGN', 'cmp_idem_01', '2026-09-25', '2026-09-25', 10.00, 500, NULL, 20, NULL, NULL, NULL, NULL, NULL, NULL, FALSE, 'COMMERCIAL_PRODUCTION', NOW())
       ON CONFLICT (ad_account_id, entity_level, entity_meta_id, date_start, is_demo)
       DO UPDATE SET
         spend = EXCLUDED.spend,
         impressions = EXCLUDED.impressions,
         clicks = EXCLUDED.clicks,
         date_stop = EXCLUDED.date_stop,
         synced_at = NOW()`,
      [accId, cmpId]
    );

    // 2. Executar novamente para a mesma data: 2026-09-25 / 2026-09-25, spend = 12.00
    await pool.query(
      `INSERT INTO meta_insights (
         ad_account_id, campaign_id, adset_id, ad_id, entity_level, entity_meta_id,
         date_start, date_stop, spend, impressions, reach, clicks, link_clicks,
         cpc, cpm, ctr, frequency, raw_actions, is_demo, data_provenance, synced_at
       )
       VALUES ($1, $2, NULL, NULL, 'CAMPAIGN', 'cmp_idem_01', '2026-09-25', '2026-09-25', 12.00, 600, NULL, 25, NULL, NULL, NULL, NULL, NULL, NULL, FALSE, 'COMMERCIAL_PRODUCTION', NOW())
       ON CONFLICT (ad_account_id, entity_level, entity_meta_id, date_start, is_demo)
       DO UPDATE SET
         spend = EXCLUDED.spend,
         impressions = EXCLUDED.impressions,
         clicks = EXCLUDED.clicks,
         date_stop = EXCLUDED.date_stop,
         synced_at = NOW()`,
      [accId, cmpId]
    );

    const rows = (await pool.query("SELECT * FROM meta_insights WHERE entity_meta_id = 'cmp_idem_01'")).rows;

    // Resultado esperado:
    // - apenas 1 registro daily
    expect(rows.length).toBe(1);
    // - spend final = 12.00
    expect(parseFloat(rows[0].spend)).toBe(12.00);
    expect(rows[0].date_start.toISOString().split('T')[0]).toBe('2026-09-25');
    expect(rows[0].date_stop.toISOString().split('T')[0]).toBe('2026-09-25');
  });
});
