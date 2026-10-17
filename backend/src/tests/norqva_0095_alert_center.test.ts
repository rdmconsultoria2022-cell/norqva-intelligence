// NORQVA-0095: central de pendências. Sem serviços externos.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { guardResolution, describeRule } from '../services/alerts/alertCenterService';

describe('NORQVA-0095 — regras puras', () => {
  it('gravidade: boa notícia é informativa, falha do vigia é crítica', () => {
    expect(describeRule('EXPERIMENT_CAP_EXTENDED_PROFIT').severity).toBe('INFO');
    expect(describeRule('EXPERIMENT_CAP_80').severity).toBe('INFO');
    expect(describeRule('EXPERIMENT_CAP_90').severity).toBe('ATTENTION');
    expect(describeRule('EXPERIMENT_GUARD_PAUSE_FAILED').severity).toBe('CRITICAL');
    expect(describeRule('SPEND_WITHOUT_SALE').severity).toBe('CRITICAL');
  });

  it('o vigia só resolve com evidência', () => {
    expect(guardResolution({ rule_code: 'EXPERIMENT_GUARD_READ_FAILED', guard_read_failures: 0 })).toBe('READ_RECOVERED');
    expect(guardResolution({ rule_code: 'EXPERIMENT_GUARD_READ_FAILED', guard_read_failures: 2 })).toBeNull();
    expect(guardResolution({ rule_code: 'EXPERIMENT_GUARD_PAUSE_FAILED', campaign_status: 'PAUSED' })).toBe('CAMPAIGN_PAUSED');
    expect(guardResolution({ rule_code: 'EXPERIMENT_GUARD_PAUSE_FAILED', campaign_status: 'ACTIVE' })).toBeNull();
    expect(guardResolution({ rule_code: 'EXPERIMENT_CAP_90', guard_state: 'WATCHING', spent_brl_last: 50, max_spend_brl: 150 })).toBe('CAP_RAISED');
    expect(guardResolution({ rule_code: 'EXPERIMENT_CAP_90', guard_state: 'WATCHING', spent_brl_last: 95, max_spend_brl: 100 })).toBeNull();
    expect(guardResolution({ rule_code: 'EXPERIMENT_CAP_PAUSED', guard_state: 'CAPPED', spent_brl_last: 100, max_spend_brl: 100 })).toBeNull();
    expect(guardResolution({ rule_code: 'EXPERIMENT_CAP_PAUSED', guard_state: 'WATCHING', spent_brl_last: 100, max_spend_brl: 200 })).toBe('CAP_RAISED');
    expect(guardResolution({ rule_code: 'SPEND_WITHOUT_SALE' })).toBeNull();
  });
});

describe.sequential('NORQVA-0095 — central de pendências (HTTP)', () => {
  let pool: Pool;
  let admin: string;
  let ops: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const planCode = `T95${tag}`;
  const cmp = `cmp95_${tag}`;
  const ids: Record<string, string> = {};

  const as = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: any = {}) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body)
  });
  const find = (body: any, id: string) => body.notifications.find((n: any) => n.id === id);

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const u = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, $2, 'U 0095', $3, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $3, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [crypto.randomUUID(), email, role]
      );
      return signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role });
    };
    admin = await mk('admin.center0095@norqva.test', 'ADMIN');
    ops = await mk('ops.center0095@norqva.test', 'OPERATIONS');

    await pool.query(
      `INSERT INTO launch_plans (code, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text, guard_state, guard_read_failures, spent_brl_last)
       VALUES ($1, 'ACTIVE', '{"campaign":{"name":"x"},"adsets":[],"ads":[]}', $2, 20, 100, 'teste 0095', 'WATCHING', 0, 40)`,
      [planCode, JSON.stringify({ campaign: { x: cmp } })]
    );
    const ins = async (key: string, rule: string, metaAd: string, adName: string) => {
      const r = await pool.query(
        `INSERT INTO ad_alerts (rule_code, meta_ad_id, ad_name, meta_campaign_id, campaign_name, message, is_demo)
         VALUES ($1, $2, $3, $4, 'Campanha 0095', $5, FALSE) RETURNING id`,
        [rule, metaAd, adName, cmp, `mensagem ${key}`]
      );
      ids[key] = r.rows[0].id;
    };
    await ins('spend', 'SPEND_WITHOUT_SALE', `ad95_${tag}`, 'Anúncio 0095');
    await ins('profit', 'EXPERIMENT_CAP_EXTENDED_PROFIT', cmp, planCode);
    await ins('read', 'EXPERIMENT_GUARD_READ_FAILED', cmp, planCode);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM ad_alerts WHERE id = ANY($1::uuid[])', [Object.values(ids)]).catch(() => {});
    await pool.query('DELETE FROM launch_plans WHERE code = $1', [planCode]).catch(() => {});
  });

  it('cada alerta vem com título, gravidade, ação, campanha e estado', async () => {
    const r = await as(ops).get('/api/alerts/center?mode=real');
    expect(r.status).toBe(200);
    const spend = find(r.body, ids.spend);
    expect(spend).toMatchObject({
      title: 'Anúncio gastando sem vender',
      severity: 'CRITICAL',
      state: 'NOVA',
      is_problem: true,
      is_open: true,
      entity: { type: 'AD', meta_campaign_id: cmp, ad_name: 'Anúncio 0095' },
      link: { tab: 'results', meta_campaign_id: cmp }
    });
    expect(spend.recommended_action).toMatch(/Pausar/);
    const profit = find(r.body, ids.profit);
    expect(profit).toMatchObject({ severity: 'INFO', is_problem: false, entity: { type: 'CAMPAIGN', plan_code: planCode }, link: { tab: 'cap' } });
  });

  it('falha de leitura do vigia já recuperada se resolve sozinha', async () => {
    const r = await as(ops).get('/api/alerts/center?mode=real');
    expect(find(r.body, ids.read)).toMatchObject({ state: 'RESOLVIDA', is_open: false, resolution: 'READ_RECOVERED' });
  });

  it('ler é por pessoa e não resolve nada', async () => {
    const before = await as(ops).get('/api/alerts/center?mode=real');
    const unread = before.body.unread_count;
    const problems = before.body.open_problems_count;
    expect((await as(ops).post(`/api/alerts/${ids.spend}/read?mode=real`)).status).toBe(200);
    const after = await as(ops).get('/api/alerts/center?mode=real');
    expect(after.body.unread_count).toBe(unread - 1);
    expect(after.body.open_problems_count).toBe(problems);
    expect(find(after.body, ids.spend)).toMatchObject({ state: 'VISUALIZADA', is_open: true });
    // para o administrador continua não lido
    const adm = await as(admin).get('/api/alerts/center?mode=real');
    expect(find(adm.body, ids.spend).state).toBe('NOVA');
  });

  it('em tratamento e descartar: só Administrador e Performance; crítico pede motivo', async () => {
    expect((await as(ops).post(`/api/alerts/${ids.spend}/progress?mode=real`)).status).toBe(403);
    const pr = await as(admin).post(`/api/alerts/${ids.spend}/progress?mode=real`);
    expect(pr.status).toBe(200);
    expect(pr.body.notification.state).toBe('EM_TRATAMENTO');

    expect((await as(admin).post(`/api/alerts/${ids.spend}/dismiss?mode=real`, {})).status).toBe(400);
    const d = await as(admin).post(`/api/alerts/${ids.spend}/dismiss?mode=real`, { reason: 'Anúncio já trocado' });
    expect(d.status).toBe(200);
    expect(d.body.notification).toMatchObject({ state: 'DESCARTADA', is_open: false });
    const log = await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'AD_ALERT_DISMISSED' AND new_value = 'Anúncio já trocado'`);
    expect(log.rows.length).toBeGreaterThan(0);
    expect((await as(admin).post(`/api/alerts/${ids.spend}/dismiss?mode=real`, { reason: 'de novo' })).status).toBe(409);
  });

  it('marcar todos como lidos zera o sino da pessoa', async () => {
    expect((await as(ops).post('/api/alerts/read?mode=real')).status).toBe(200);
    const r = await as(ops).get('/api/alerts/center?mode=real');
    expect(r.body.unread_count).toBe(0);
  });
});
