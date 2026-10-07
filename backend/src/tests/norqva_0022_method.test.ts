import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { MetaMutatingClient } from '../services/meta/metaMutatingClient';
import { dataLevelOf, maxConfidenceFor, pipelineStageOf, prePublicationChecklist, MethodService, STAGES, PRINCIPLES } from '../services/method/methodService';

// NORQVA-0022 — Método NORQVA de Campanhas V1.

const allOk = {
  product: true, audience: true, offer: true, hypothesis: true, creativeApproved: true, pageWorking: true,
  checkoutReady: true, pixelVerified: true, utm: true, campaignStructured: true, governance: true
};

describe('NORQVA-0022 — regras', () => {
  it('10 stages and the two principles', () => {
    expect(STAGES.map(s => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(PRINCIPLES[0]).toContain('Cada criativo deve testar uma hipótese');
    expect(PRINCIPLES[1]).toContain('vendas');
  });

  it('creative without hypothesis is never PRONTO', () => {
    expect(prePublicationChecklist(allOk).status).toBe('PRONTO');
    const r = prePublicationChecklist({ ...allOk, hypothesis: false });
    expect(r.status).toBe('NAO_PRONTO');
    expect(r.items.find(i => i.key === 'HIPOTESE')).toMatchObject({ ok: false, critical: true });
  });

  it('missing critical tracking blocks PRONTO', () => {
    expect(prePublicationChecklist({ ...allOk, pixelVerified: false }).status).toBe('NAO_PRONTO');
    expect(prePublicationChecklist({ ...allOk, checkoutReady: false }).status).toBe('NAO_PRONTO');
    expect(prePublicationChecklist({ ...allOk, utm: false }).status).toBe('NAO_PRONTO');
  });

  it('data levels and confidence ceiling (heuristic, never certainty)', () => {
    expect(dataLevelOf(null, 16)).toBe('SEM_DADOS');
    expect(dataLevelOf({ spend: 0, impressions: 0 }, 16)).toBe('SEM_DADOS');
    expect(dataLevelOf({ spend: 10, impressions: 300 }, 16)).toBe('DADOS_INSUFICIENTES');
    expect(dataLevelOf({ spend: 60, impressions: 5000 }, 16)).toBe('DADOS_CONFIAVEIS');
    expect(maxConfidenceFor('SEM_DADOS')).toBe('BAIXA');
    expect(maxConfidenceFor('DADOS_INSUFICIENTES')).toBe('MEDIA');
    expect(maxConfidenceFor('DADOS_CONFIAVEIS')).toBe('ALTA');
  });

  it('missing data never becomes zero', () => {
    const none = MethodService.summarize([], []);
    expect(none.metrics).toBeNull();
    expect(none.data_level).toBe('SEM_DADOS');
  });

  it('creative pipeline stage', () => {
    const base = { published: false, measured: false, decided: false };
    expect(pipelineStageOf({ ...base })).toBe('IDEIA');
    expect(pipelineStageOf({ ...base, script: 's' })).toBe('ROTEIRO');
    expect(pipelineStageOf({ ...base, script: 's', file_url: 'https://x' })).toBe('PRODUCAO');
    expect(pipelineStageOf({ ...base, approval_status: 'IN_REVIEW' })).toBe('REVISAO');
    expect(pipelineStageOf({ ...base, approval_status: 'APPROVED' })).toBe('APROVADO');
    expect(pipelineStageOf({ ...base, published: true })).toBe('PUBLICADO');
    expect(pipelineStageOf({ ...base, published: true, measured: true })).toBe('MEDIDO');
    expect(pipelineStageOf({ ...base, decided: true })).toBe('CLASSIFICADO');
  });
});

describe('NORQVA-0022 — endpoints', () => {
  let pool: Pool;
  let adminToken: string;
  let intelToken: string;
  let creativeToken: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const ids: Record<string, string> = {};
  const metaSpies: any[] = [];
  let fetchSpy: any;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    pool = app.get('db') || initializeDB();
    await runMigrations(pool);
    const mk = async (role: string) => {
      const email = `m22.${role.toLowerCase()}.${tag.toLowerCase()}@norqva.test`;
      const r = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), gen_random_uuid(), $1, $1, $2, 'ACTIVE') RETURNING auth_user_id`,
        [email, role]
      );
      return signSupabaseToken({ sub: r.rows[0].auth_user_id, email, role });
    };
    adminToken = await mk('ADMIN');
    intelToken = await mk('INTELLIGENCE');
    creativeToken = await mk('CREATIVE');

    for (const demo of [false, true]) {
      const sfx = demo ? 'D' : 'R';
      const prod = (await pool.query(`INSERT INTO products (human_id, name, category, description, is_demo) VALUES ($1, 'Trattoria em Casa', 'Culinária', 'e-book', $2) RETURNING id`, [`PRD-M${sfx}-${tag}`, demo])).rows[0].id;
      const off = (await pool.query(`INSERT INTO offers (human_id, product_id, name, price, description, status, is_demo) VALUES ($1, $2, 'TRATTORIA EM CASA', 19.9, 'd', 'ATIVA', $3) RETURNING id`, [`OFF-M${sfx}-${tag}`, prod, demo])).rows[0].id;
      const cr = (
        await pool.query(
          `INSERT INTO creatives (human_id, product_id, offer_id, hook, concept, copy, cta, format, file_url, is_demo, approval_status, utm_content_key, script)
           VALUES ($1, $2, $3, 'Se sua massa fica pesada…', 'erro comum', 'texto', 'Ver detalhes', 'VIDEO', '', $4, 'APPROVED', $1, 'roteiro') RETURNING id`,
          [`TR-M${sfx}-${tag}-C1`, prod, off, demo]
        )
      ).rows[0].id;
      ids[`prod${sfx}`] = prod;
      ids[`off${sfx}`] = `OFF-M${sfx}-${tag}`;
      ids[`cr${sfx}`] = cr;
    }

    // No external mutation may happen in this module
    for (const m of ['setEntityStatus', 'setDailyBudget', 'setCampaignSpendCap', 'createCampaign', 'createAd', 'createPausedCampaign', 'createPausedAd', 'createPausedAdSet', 'updateBudget'] as const) {
      metaSpies.push(vi.spyOn(MetaMutatingClient.prototype as any, m));
    }
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterAll(() => {
    metaSpies.forEach(s => s.mockRestore());
    fetchSpy.mockRestore();
  });

  it('creates the pilot case from the offer (proposition = HYPOTHESIS), idempotent, ADMIN only', async () => {
    const forbidden = await request(app).post('/api/method/cases').set(auth(intelToken)).send({ offer_human_id: ids.offR });
    expect(forbidden.status).toBe(403);
    const r = await request(app)
      .post('/api/method/cases')
      .set(auth(adminToken))
      .send({ offer_human_id: ids.offR, central_proposition: 'Permitir reproduzir em casa uma experiência inspirada em uma trattoria italiana.' });
    expect(r.status).toBe(201);
    expect(r.body.case.proposition_status).toBe('HIPOTESE');
    ids.caseR = r.body.case.id;
    const again = await request(app).post('/api/method/cases').set(auth(adminToken)).send({ offer_human_id: ids.offR });
    expect(again.status).toBe(200);
    expect(again.body.case.id).toBe(ids.caseR);
    const demo = await request(app).post('/api/method/cases?mode=demo').set(auth(adminToken)).send({ offer_human_id: ids.offD });
    ids.caseD = demo.body.case.id;
  });

  it('case view: 10 stages, honest PENDENTE / NÃO VALIDADO / SEM DADOS, creative NOT READY without hypothesis', async () => {
    const r = await request(app).get(`/api/method/cases/${ids.caseR}`).set(auth(creativeToken));
    expect(r.status).toBe(200);
    expect(r.body.stages).toHaveLength(10);
    expect(r.body.stages[1].pending).toContain('PENDENTE: público');
    expect(r.body.stages[3].pending[0]).toContain('NÃO VALIDADO');
    expect(r.body.stages[8].pending).toContain('SEM DADOS');
    const c = r.body.creatives.find((x: any) => x.id === ids.crR);
    expect(c.checklist.status).toBe('NAO_PRONTO');
    expect(c.checklist.items.find((i: any) => i.key === 'HIPOTESE').ok).toBe(false);
    expect(c.measurement).toMatchObject({ data_level: 'SEM_DADOS', metrics: null });
    expect(c.pipeline).toBe('APROVADO');
  });

  it('hypothesis matrix + link; still NOT READY while tracking is unverified', async () => {
    const h = await request(app)
      .post(`/api/method/cases/${ids.caseR}/hypotheses`)
      .set(auth(intelToken))
      .send({
        angle: 'Erro comum',
        hook: 'Se sua massa sempre fica pesada, provavelmente você está cometendo este erro.',
        statement: 'Comunicação baseada em evitar erros gera mais intenção do que comunicação genérica sobre receitas italianas.',
        variable_tested: 'GANCHO',
        status: 'TESTANDO'
      });
    expect(h.status).toBe(201);
    expect(h.body.human_id).toMatch(/^HIP-\d{4}$/);
    ids.hypR = h.body.id;
    const bad = await request(app).post(`/api/method/cases/${ids.caseR}/hypotheses`).set(auth(intelToken)).send({ statement: 'x', variable_tested: 'COR' });
    expect(bad.status).toBe(400);

    const link = await request(app).post(`/api/method/creatives/${ids.crR}/hypothesis`).set(auth(intelToken)).send({ hypothesis_id: ids.hypR });
    expect(link.status).toBe(200);
    const r = await request(app).get(`/api/method/cases/${ids.caseR}`).set(auth(adminToken));
    const c = r.body.creatives.find((x: any) => x.id === ids.crR);
    expect(c.hypothesis.human_id).toBe(h.body.human_id);
    expect(c.checklist.items.find((i: any) => i.key === 'HIPOTESE').ok).toBe(true);
    expect(c.checklist.items.find((i: any) => i.key === 'PIXEL').ok).toBe(false); // no Purchase sent to Meta in this DB
    expect(c.checklist.status).toBe('NAO_PRONTO');

    // validating a hypothesis needs a decision based on reliable data
    const val = await request(app).patch(`/api/method/hypotheses/${ids.hypR}`).set(auth(intelToken)).send({ status: 'VALIDADA' });
    expect(val.status).toBe(409);
  });

  it('decision: ADMIN only, reason required, confidence capped by data level, recorded in decision_events, no Meta action', async () => {
    const notAdmin = await request(app).post(`/api/method/creatives/${ids.crR}/decision`).set(auth(intelToken)).send({ decision: 'MATAR', reason: 'sem resultado', confidence: 'BAIXA' });
    expect(notAdmin.status).toBe(403);
    const noReason = await request(app).post(`/api/method/creatives/${ids.crR}/decision`).set(auth(adminToken)).send({ decision: 'ITERAR', confidence: 'BAIXA' });
    expect(noReason.status).toBe(400);
    const tooSure = await request(app).post(`/api/method/creatives/${ids.crR}/decision`).set(auth(adminToken)).send({ decision: 'ESCALAR', reason: 'parece bom demais', confidence: 'ALTA' });
    expect(tooSure.status).toBe(400);
    expect(tooSure.body.error).toContain('BAIXA');

    const ok = await request(app)
      .post(`/api/method/creatives/${ids.crR}/decision`)
      .set(auth(adminToken))
      .send({ decision: 'ITERAR', reason: 'Ainda sem dados; refazer o gancho com prova visual.', confidence: 'BAIXA', evidence_notes: 'sem veiculação' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ decision: 'ITERAR', data_level: 'SEM_DADOS', confidence: 'BAIXA' });
    const ev = typeof ok.body.evidence === 'string' ? JSON.parse(ok.body.evidence) : ok.body.evidence;
    expect(ev.measurement.data_level).toBe('SEM_DADOS');
    ids.decR = ok.body.id;
    const de = await pool.query(`SELECT phase, actor_type FROM decision_events WHERE action = 'METHOD_CREATIVE_DECISION' AND plan_code = $1`, [`TR-MR-${tag}-C1`]);
    expect(de.rows.map(e => e.phase).sort()).toEqual(['EXECUTED', 'REQUESTED']);
    expect(de.rows[0].actor_type).toBe('HUMAN');
  });

  it('learning keeps the link to its evidence and feeds a new hypothesis', async () => {
    const orphan = await request(app).post('/api/method/learnings').set(auth(intelToken)).send({ type: 'GANCHO', status: 'PROMISSORA', statement: 'x' });
    expect(orphan.status).toBe(400);
    const l = await request(app)
      .post('/api/method/learnings')
      .set(auth(intelToken))
      .send({ source_decision_id: ids.decR, case_id: ids.caseR, type: 'GANCHO', status: 'PROMISSORA', statement: 'Gancho de erro comum precisa de prova visual.' });
    expect(l.status).toBe(201);
    expect(l.body.source_decision_id).toBe(ids.decR);
    const nh = await request(app).post(`/api/method/learnings/${l.body.id}/hypothesis`).set(auth(intelToken)).send({ statement: 'Erro comum + prova visual aumenta o CTR.', variable_tested: 'VISUAL' });
    expect(nh.status).toBe(201);
    expect(nh.body).toMatchObject({ status: 'PROPOSTA', derived_from_learning_id: l.body.id });

    const view = await request(app).get(`/api/method/cases/${ids.caseR}`).set(auth(adminToken));
    expect(view.body.stages[9].status).toBe('CONCLUIDO');
    expect(view.body.learnings[0].source_decision_id).toBe(ids.decR);
  });

  it('DEMO and REAL stay isolated', async () => {
    const real = await request(app).get('/api/method/cases').set(auth(adminToken));
    const demo = await request(app).get('/api/method/cases?mode=demo').set(auth(adminToken));
    expect(real.body.cases.some((c: any) => c.id === ids.caseD)).toBe(false);
    expect(demo.body.cases.some((c: any) => c.id === ids.caseR)).toBe(false);
    const cross = await request(app).get(`/api/method/cases/${ids.caseR}?mode=demo`).set(auth(adminToken));
    expect(cross.status).toBe(404);
    const crossLink = await request(app).post(`/api/method/creatives/${ids.crD}/hypothesis`).set(auth(adminToken)).send({ hypothesis_id: ids.hypR });
    expect(crossLink.status).toBe(404);
  });

  it('external Meta ad imported into the Fábrica only as a record (ADMIN), linked to its hypothesis, no Meta action', async () => {
    const adId = `9${Date.now()}`.slice(0, 15);
    const adName = `TR_V2_FOOD_${tag}`;
    const row = {
      key: adId, level: 'ad', name: adName, meta_id: adId, status: 'ACTIVE', campaign_name: 'NORQVA_TRATTORIA_EXP02_CREATIVE', adset_name: 'TR_EXP02_V2_FOOD',
      product_id: ids.prodR, product_name: 'Trattoria em Casa', niche: null, ads_count: 1, winners_count: 0,
      creative: { title: 'Trattoria em Casa · R$ 19,90', body: 'Massa fresca, molho de verdade.', cta: 'LEARN_MORE', thumbnail_url: null, video_id: '123' },
      totals: { spend: 0, impressions: 0 } as any, metrics: {} as any, score: 0, confidence: 0, classification: 'SEM_DADOS' as any, reason: ''
    };
    const spy = vi.spyOn(MethodService.prototype as any, 'adRows').mockResolvedValue([row]);
    try {
      const before = await request(app).get(`/api/method/cases/${ids.caseR}`).set(auth(adminToken));
      expect(before.body.external_ads.some((a: any) => a.meta_ad_id === adId)).toBe(true);

      const notAdmin = await request(app).post(`/api/method/cases/${ids.caseR}/external-ads/${adId}/import`).set(auth(intelToken)).send({});
      expect(notAdmin.status).toBe(403);
      const unknown = await request(app).post(`/api/method/cases/${ids.caseR}/external-ads/123456789/import`).set(auth(adminToken)).send({});
      expect(unknown.status).toBe(404);

      const ok = await request(app).post(`/api/method/cases/${ids.caseR}/external-ads/${adId}/import`).set(auth(adminToken)).send({ hypothesis_id: ids.hypR });
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ meta_ad_id: adId, hypothesis_id: ids.hypR, meta_changed: false });
      const cr = (await pool.query(`SELECT approval_status, batch_code, format, utm_content_key FROM creatives WHERE id = $1`, [ok.body.creative_id])).rows[0];
      expect(cr).toMatchObject({ approval_status: 'DRAFT', batch_code: 'META_EXTERNO', format: 'VIDEO', utm_content_key: adName });

      const again = await request(app).post(`/api/method/cases/${ids.caseR}/external-ads/${adId}/import`).set(auth(adminToken)).send({});
      expect(again.status).toBe(409);

      const after = await request(app).get(`/api/method/cases/${ids.caseR}`).set(auth(adminToken));
      expect(after.body.external_ads.some((a: any) => a.meta_ad_id === adId)).toBe(false);
      const c = after.body.creatives.find((x: any) => x.id === ok.body.creative_id);
      expect(c.hypothesis.id).toBe(ids.hypR);
      expect(c.pipeline).toBe('PUBLICADO');
    } finally {
      spy.mockRestore();
    }
  });

  it('nothing in this module activates, publishes, changes budget or calls Meta', () => {
    for (const s of metaSpies) expect(s).not.toHaveBeenCalled();
    const metaCalls = fetchSpy.mock.calls.filter((c: any[]) => String(c[0]).includes('graph.facebook.com'));
    expect(metaCalls).toHaveLength(0);
  });
});
