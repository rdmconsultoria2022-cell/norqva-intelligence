// NORQVA-0119 (contrato NORQVA-0118, etapa B): sinais da Biblioteca de Anúncios nos prints e nota de força
// ESTIMADA da referência (tempo no ar, variações e estrutura), sempre com o motivo de cada ponto.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { validateSignals, validateAdStructure, validateSalesStructure, adSchema, salesSchema, extractStructure, setReferenceAiForTests } from '../services/creative/referenceService';
import { referenceScore } from '../services/creative/referenceScore';

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const NOW = new Date('2026-10-23T15:00:00Z');

const fullPage = (signals: any = null) =>
  validateSalesStructure({
    sections: [
      { role: 'HERO_HOOK', purpose: 'a', headline_style: 'QUESTION', approx_words: 20, has_image: true, has_video: false, cta_count: 1 },
      { role: 'PAIN', purpose: 'b', headline_style: 'NONE', approx_words: 50, has_image: false, has_video: false, cta_count: 0 },
      { role: 'CONTENTS', purpose: 'c', headline_style: 'NONE', approx_words: 60, has_image: true, has_video: false, cta_count: 0 },
      { role: 'TESTIMONIALS', purpose: 'd', headline_style: 'NONE', approx_words: 80, has_image: false, has_video: false, cta_count: 0 },
      { role: 'OFFER_PRICE', purpose: 'e', headline_style: 'NONE', approx_words: 30, has_image: false, has_video: false, cta_count: 1 },
      { role: 'GUARANTEE', purpose: 'f', headline_style: 'NONE', approx_words: 30, has_image: false, has_video: false, cta_count: 0 }
    ],
    tone: 'x', length_class: 'MEDIUM', cta_text_style: 'x', color_mood: 'x', signals
  })!;

afterEach(() => setReferenceAiForTests(null));

describe('NORQVA-0119 — sinais dos prints', () => {
  it('data de início vira dias no ar; o servidor faz a conta, não a IA', () => {
    expect(validateSignals({ started_on: '2026-08-24', ads_using_creative: 7 }, NOW)).toEqual({
      started_on: '2026-08-24', ended_on: null, active_days: 60, ads_using_creative: 7, observed_on: '2026-10-23'
    });
    expect(validateSignals({ started_on: '2026-10-23', ads_using_creative: null }, NOW)?.active_days).toBe(0);
  });

  it('"hoje" é o dia de Brasília (22h30 do dia 23 ainda é dia 23)', () => {
    const late = new Date('2026-10-24T01:30:00Z');
    expect(validateSignals({ started_on: '2026-10-13', ads_using_creative: null }, late)).toMatchObject({ observed_on: '2026-10-23', active_days: 10 });
    // o dia 24 ainda não chegou em Brasília
    expect(validateSignals({ started_on: '2026-10-24', ads_using_creative: null }, late)).toBeNull();
  });

  it('anúncio que já saiu do ar: conta os dias só até o fim', () => {
    expect(validateSignals({ started_on: '2026-01-12', ended_on: '2026-03-03', ads_using_creative: 2 }, NOW)).toMatchObject({ ended_on: '2026-03-03', active_days: 50 });
    // fim antes do início é descartado (conta até hoje)
    expect(validateSignals({ started_on: '2026-10-01', ended_on: '2026-09-01', ads_using_creative: null }, NOW)).toMatchObject({ ended_on: null, active_days: 22 });
    const s = referenceScore(fullPage({ started_on: '2026-01-12', ended_on: '2026-03-03', ads_using_creative: 2 }))!;
    expect(s.items[0].reason).toContain('saiu do ar em 03/03');
  });

  it('descarta data futura, inválida ou antiga demais e quantidade fora da faixa', () => {
    expect(validateSignals({ started_on: '2026-12-01', ads_using_creative: null }, NOW)).toBeNull();
    expect(validateSignals({ started_on: '2026-02-30', ads_using_creative: 0 }, NOW)).toBeNull();
    expect(validateSignals({ started_on: '23/08/2026', ads_using_creative: 3.5 }, NOW)).toBeNull();
    expect(validateSignals({ started_on: '2009-12-31', ads_using_creative: 50000 }, NOW)).toBeNull();
    expect(validateSignals({ started_on: null, ads_using_creative: 3 }, NOW)).toMatchObject({ started_on: null, active_days: null, ads_using_creative: 3 });
    expect(validateSignals(null, NOW)).toBeNull();
    expect(validateSignals('60 dias', NOW)).toBeNull();
  });

  it('esquema da IA pede os sinais só nos prints', () => {
    expect(adSchema(true).schema.required).toContain('signals');
    expect(salesSchema(true).schema.required).toContain('signals');
    expect(adSchema(false).schema.required).not.toContain('signals');
    expect(salesSchema(false).schema.required).not.toContain('signals');
  });

  it('prints com IA: os sinais ficam na estrutura', async () => {
    let system = '';
    setReferenceAiForTests(async messages => {
      system = String(messages[0].content);
      return JSON.stringify({
        hook_type: 'QUESTION', angle: 'x', format: 'IMAGE', duration_s: null, on_screen_text: true, voiceover: false,
        structure_beats: [{ t_from_s: null, role: 'HOOK', purpose: 'Pergunta' }], cta_style: 'x', visible_text: 'texto', signals: { started_on: '2020-01-01', ads_using_creative: 12 }
      });
    });
    const r = await extractStructure({ images: [{ mime: 'image/png', base64: PNG_1X1 }] }, 'AD');
    expect(system).toContain('Veiculação iniciada em');
    expect(system).toContain('ended_on');
    expect(r.ok && r.structure.signals).toMatchObject({ started_on: '2020-01-01', ads_using_creative: 12 });
    expect(r.ok && (r.structure.signals?.active_days || 0)).toBeGreaterThan(2000);
  });
});

describe('NORQVA-0119 — nota de força estimada', () => {
  it('estrutura completa: 35 pontos de estrutura, cada um com o motivo', () => {
    const s = referenceScore(fullPage({ started_on: '2026-08-01', ads_using_creative: 12 }))!;
    // sinais: o validador recalcula com a data de hoje; aqui só a estrutura é fixa
    expect(s.estimate).toBe(true);
    expect(s.has_signals).toBe(true);
    expect(s.items.find(i => i.key === 'variants')!.points).toBe(25);
    expect(s.items.filter(i => i.label === 'Estrutura').reduce((a, i) => a + i.points, 0)).toBe(35);
    expect(s.items.find(i => i.key === 's_cta')!.reason).toBe('2 botões de compra');
    expect(s.items.reduce((a, i) => a + i.max, 0)).toBe(100);
  });

  it('pontos do tempo no ar e das variações por faixa', () => {
    const at = (days: number | null, ads: number | null) => {
      const base = fullPage();
      return referenceScore({ ...base, signals: { started_on: null, active_days: days, ads_using_creative: ads, observed_on: '2026-10-23' } })!;
    };
    expect(at(60, 10).items.slice(0, 2).map(i => i.points)).toEqual([40, 25]);
    expect(at(30, 4).items.slice(0, 2).map(i => i.points)).toEqual([32, 18]);
    expect(at(14, 2).items.slice(0, 2).map(i => i.points)).toEqual([22, 10]);
    expect(at(7, 1).items.slice(0, 2).map(i => i.points)).toEqual([12, 4]);
    expect(at(3, null).items.slice(0, 2).map(i => i.points)).toEqual([4, 0]);
    expect(at(60, 10).items[0].reason).toContain('60 dias no ar (até 23/10)');
    expect(at(60, 1).items[1].reason).toContain('1 anúncio usa');
  });

  it('sem prints da Biblioteca: vale só a estrutura e o resumo avisa', () => {
    const s = referenceScore(fullPage())!;
    expect(s.has_signals).toBe(false);
    expect(s.score).toBe(35);
    expect(s.level).toBe('FRACA');
    expect(s.summary).toContain('só pela estrutura');
    expect(s.items[0].reason).toContain('Veiculação iniciada em');
  });

  it('anúncio: estrutura de até 35 pontos; vídeo curto demais perde o ponto do formato', () => {
    const ad = validateAdStructure({
      hook_type: 'QUESTION', angle: 'x', format: 'VIDEO', duration_s: 6, on_screen_text: true, voiceover: true,
      structure_beats: [
        { t_from_s: 0, role: 'HOOK', purpose: 'a' },
        { t_from_s: 2, role: 'DEMONSTRATION', purpose: 'b' },
        { t_from_s: 4, role: 'PROOF', purpose: 'c' },
        { t_from_s: 5, role: 'CTA', purpose: 'd' }
      ],
      cta_style: 'x'
    })!;
    const s = referenceScore(ad)!;
    expect(s.items.filter(i => i.label === 'Estrutura').reduce((a, i) => a + i.max, 0)).toBe(35);
    expect(s.score).toBe(30);
    expect(s.items.find(i => i.key === 'a_format')!.points).toBe(0);
    expect(referenceScore({ ...ad, duration_s: 20 })!.score).toBe(35);
  });

  it('níveis: 70+ forte, 40 a 69 média', () => {
    const page = fullPage();
    const sig = (d: number, n: number) => ({ ...page, signals: { started_on: null, active_days: d, ads_using_creative: n, observed_on: '2026-10-23' } });
    expect(referenceScore(sig(60, 10))!.level).toBe('FORTE');
    expect(referenceScore(sig(7, 1))!.level).toBe('MEDIA');
    expect(referenceScore(null)).toBeNull();
  });
});

describe.sequential('NORQVA-0119 — a nota vem com a referência', () => {
  let pool: Pool;
  let admin: string;
  const productId = crypto.randomUUID();
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const u = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.norqva0119@norqva.test', 'U 0119', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    admin = signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role: 'ADMIN' });
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance)
       VALUES ($1, $2, 'Livro 0119', 'Receitas', 'x', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
      [productId, `PRD-T119${tag}`]
    );
    process.env.CREATIVE_REFERENCES_ENABLED = 'true';
  });

  afterAll(async () => {
    delete process.env.CREATIVE_REFERENCES_ENABLED;
    if (!pool) return;
    await pool.query('DELETE FROM creative_references WHERE product_id = $1', [productId]).catch(() => {});
    await pool.query('DELETE FROM products WHERE id = $1', [productId]).catch(() => {});
  });

  it('prints da Biblioteca: grava os sinais, devolve a nota na criação e na lista', async () => {
    setReferenceAiForTests(async () =>
      JSON.stringify({
        hook_type: 'QUESTION', angle: 'x', format: 'IMAGE', duration_s: null, on_screen_text: true, voiceover: false,
        structure_beats: [
          { t_from_s: null, role: 'HOOK', purpose: 'Pergunta' },
          { t_from_s: null, role: 'BENEFIT', purpose: 'Benefício' },
          { t_from_s: null, role: 'CTA', purpose: 'Chamada' }
        ],
        cta_style: 'x',
        visible_text: 'Veiculação iniciada em 1 de jan de 2020. Doze anúncios usam esse criativo e texto. Aprenda a fazer massa fresca em casa com a família.',
        signals: { started_on: '2020-01-01', ads_using_creative: 12 }
      })
    );
    const r = await request(app)
      .post('/api/creative-references/screenshots')
      .set('Authorization', `Bearer ${admin}`)
      .set('Content-Type', 'application/vnd.norqva.screenshots+json')
      .send(JSON.stringify({ images: [PNG_1X1], product_id: productId, reference_type: 'AD' }));
    expect(r.status).toBe(201);
    const ref = r.body.reference;
    expect(ref.status).toBe('READY');
    expect(ref.structure.signals).toMatchObject({ started_on: '2020-01-01', ads_using_creative: 12 });
    // 40 (tempo) + 25 (variações) + 8 gancho + 5 trecho de gancho + 7 benefício + 5 chamada + 5 formato = 95
    expect(ref.score).toMatchObject({ score: 95, level: 'FORTE', estimate: true, has_signals: true });
    const list = await request(app).get('/api/creative-references').set('Authorization', `Bearer ${admin}`);
    expect(list.body.references.find((x: any) => x.id === ref.id).score.score).toBe(95);
    // referência que falhou não tem nota
    setReferenceAiForTests(null);
    const failed = await request(app)
      .post('/api/creative-references/screenshots')
      .set('Authorization', `Bearer ${admin}`)
      .set('Content-Type', 'application/vnd.norqva.screenshots+json')
      .send(JSON.stringify({ images: [PNG_1X1], product_id: productId, reference_type: 'AD' }));
    expect(failed.body.reference.status).toBe('FAILED');
    expect(failed.body.reference.score).toBeNull();
  });
});
