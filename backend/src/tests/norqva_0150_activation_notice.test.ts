// NORQVA-0150: plano APROVADO com erro antigo, mas tudo ATIVO na Meta, não pede "Sim" de novo.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { LaunchPlanService } from '../services/launchPlans/launchPlanService';

describe.sequential('NORQVA-0150 — aviso de ativação incompleta', () => {
  let pool: Pool;
  const tag = crypto.randomUUID().slice(0, 8);
  const ids = { campaign: `c${tag}`, adset: `s${tag}`, ad1: `a1${tag}`, ad2: `a2${tag}` };
  const accountId = crypto.randomUUID();
  const service = new LaunchPlanService();

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    await pool.query(`INSERT INTO meta_ad_accounts (id, meta_account_id, name, is_demo) VALUES ($1, $2, 'Conta 0150', FALSE)`, [accountId, `act_${tag}`]);
    const c = await pool.query(
      `INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo) VALUES ($1, $2, 'C 0150', 'ACTIVE', 'ACTIVE', FALSE) RETURNING id`,
      [ids.campaign, accountId]
    );
    const s = await pool.query(
      `INSERT INTO meta_ad_sets (meta_adset_id, campaign_id, name, status, effective_status, is_demo) VALUES ($1, $2, 'S 0150', 'ACTIVE', 'ACTIVE', FALSE) RETURNING id`,
      [ids.adset, c.rows[0].id]
    );
    await pool.query(
      `INSERT INTO meta_ads (meta_ad_id, adset_id, name, status, effective_status, is_demo) VALUES ($1, $3, 'A1', 'ACTIVE', 'ACTIVE', FALSE), ($2, $3, 'A2', 'PAUSED', 'PAUSED', FALSE)`,
      [ids.ad1, ids.ad2, s.rows[0].id]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM meta_ad_accounts WHERE id = $1', [accountId]);
  });

  const metaIds = (ads: string[]) => ({
    campaign: { C: ids.campaign },
    adsets: { S: ids.adset },
    ads: Object.fromEntries(ads.map((a, i) => [`A${i}`, a]))
  });

  it('tudo ativo: ativação completa', async () => {
    expect(await service.activationComplete(pool, metaIds([ids.ad1]))).toBe(true);
  });

  it('um anúncio pausado, ausente da leitura ou plano sem anúncios: ainda pede "Sim"', async () => {
    expect(await service.activationComplete(pool, metaIds([ids.ad1, ids.ad2]))).toBe(false);
    expect(await service.activationComplete(pool, metaIds([ids.ad1, 'nao-existe']))).toBe(false);
    expect(await service.activationComplete(pool, metaIds([]))).toBe(false);
  });
});
