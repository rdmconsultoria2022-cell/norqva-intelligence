// NORQVA-0053 (D-0053): anúncio sem preço. O preço fica na página, no WhatsApp e no pagamento.
// Nenhum teste fala com a Meta.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { computeContentHash } from '../services/creative/creativeFactoryService';
import { findPriceInText, findPriceInFields, priceErrorMessage } from '../services/creative/priceInCopy';
import { assertAdsReadyForMeta } from '../services/launchPlans/campaignEditorService';
import { CREATIVE_BATCHES } from '../data/creativeBatches';

describe('NORQVA-0053 — regra pura', () => {
  it('acha preço em reais, centavos, parcelas e chamadas de preço', () => {
    for (const t of [
      'Kit completo por R$ 27,90',
      'R$27',
      'Só 19,90 hoje',
      'Leve por 27.90',
      'Em 4x de 7,48 no cartão',
      '4x de R$ 7',
      'Menos de trinta reais',
      'Por apenas um café',
      'Preço especial nesta semana',
      '50% de desconto',
      '30% off no kit',
      'Cupom de 10 no checkout',
      'por só 27',
      'em até 12x',
      '12x sem juros',
      'parcele em 12 vezes',
      '1 real por dia',
      'de 49 por 27',
      'custa 27',
      'a partir de 19',
      'US$ 5'
    ]) {
      expect(findPriceInText(t), t).not.toBeNull();
    }
  });

  it('não confunde com números que não são preço', () => {
    for (const t of [
      '28 receitas italianas para fazer em casa',
      'Pronto em 30 minutos',
      'A regra 50/30/20 em 20 segundos',
      'Lasanha para 6 pessoas, 1,5 kg de massa',
      'Receitas da nonna desde 1950',
      'Massa fresca às 19:30 com 2x mais sabor',
      'Edição 2026, atualizada em 12.10.2026',
      'Planilha de Gestão 2026 e Guia Prático em PDF',
      'Sem mensalidade: você paga uma vez e usa.',
      'Forma 20x30 cm',
      'Fatie em 2x3 cm',
      'Massa para 4x de 200 g',
      '1,25 kg de farinha',
      'por apenas 3 ingredientes',
      'a partir de 2 ovos',
      '100% natural',
      'linguiça calabresa',
      '2 xícaras de farinha'
    ]) {
      expect(findPriceInText(t), t).toBeNull();
    }
  });

  it('a mensagem diz o campo e o trecho', () => {
    const hits = findPriceInFields({ headline: 'Kit por R$ 27,90', primary_text: 'Massa fresca' });
    expect(hits).toHaveLength(1);
    expect(priceErrorMessage(hits, 'Anúncio 1')).toContain('título: "R$ 27,90"');
  });

  it('o lote BB-B01 não tem preço em nenhum texto nem promessa de preço ligada', () => {
    const b = CREATIVE_BATCHES['BB-B01'];
    for (const c of b.creatives) {
      expect(findPriceInFields({ hook: c.hook, primary_text: c.primaryText, headline: c.headline, cta: c.cta, script: c.script }), c.key).toEqual([]);
      expect(c.claimCodes).not.toContain('BB-CL-06');
    }
  });
});

describe.sequential('NORQVA-0053 — travas', () => {
  let pool: Pool;
  let admin: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const productId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const offerHid = `OFF-P53${tag}`;
  const ids: string[] = [];
  let feature: string;
  let price: string;

  async function mkCreative(key: string, texts: { headline: string; primary_text: string; hook?: string }, opts: { approved?: boolean; claim?: string } = {}) {
    const fields = { hook: texts.hook || `Gancho ${key}`, mechanism: null, cta: 'Saiba mais', format: 'VIDEO', script: null, primary_text: texts.primary_text, headline: texts.headline, file_url: `https://cdn.example.com/${key}.mp4` };
    const hash = computeContentHash(fields);
    const r = await pool.query(
      `INSERT INTO creatives (human_id, product_id, offer_id, hook, concept, copy, primary_text, headline, cta, format, file_url,
                              status, is_demo, utm_content_key, content_hash, approval_status)
       VALUES ($1, $2, $3, $4, 'c', $5, $5, $6, 'Saiba mais', 'VIDEO', $7, 'IDEIA', FALSE, $1, $8, $9) RETURNING id`,
      [key, productId, offerId, fields.hook, fields.primary_text, fields.headline, fields.file_url, hash, opts.approved ? 'APPROVED' : 'DRAFT']
    );
    const id = r.rows[0].id;
    if (opts.approved) await pool.query(`INSERT INTO creative_reviews (creative_id, content_hash, decision, is_demo) VALUES ($1, $2, 'APPROVED', FALSE)`, [id, hash]);
    await pool.query('INSERT INTO creative_claims (creative_id, claim_id) VALUES ($1, $2)', [id, opts.claim || feature]);
    ids.push(id);
    return id;
  }
  const review = (id: string) =>
    request(app).post(`/api/creative-factory/creatives/${id}/review?mode=real`).set('Authorization', `Bearer ${admin}`).send({ decision: 'APPROVED' });

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const u = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.norqva0053@norqva.test', 'Admin 0053', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    admin = signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role: 'ADMIN' });
    await pool.query(`INSERT INTO products (id, human_id, name, category, description, status, is_demo) VALUES ($1, $2, 'Trattoria 0053', 'Receitas', 'x', 'PLANEJADO', FALSE)`, [productId, `PRD-P53${tag}`]);
    await pool.query(`INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, 'Trattoria em Casa', $3, 19.90, 'ATIVA', 'x', FALSE)`, [offerId, offerHid, productId]);
    feature = (await pool.query(`INSERT INTO claims_registry (human_id, product_id, claim_text, claim_type, status, is_demo) VALUES ($1, $2, '28 receitas com foto', 'FEATURE', 'VERIFIED', FALSE) RETURNING id`, [`TR-CL-F${tag}`, productId])).rows[0].id;
    price = (await pool.query(`INSERT INTO claims_registry (human_id, product_id, claim_text, claim_type, status, is_demo) VALUES ($1, $2, 'R$ 19,90 no Pix', 'PRICE', 'VERIFIED', FALSE) RETURNING id`, [`TR-CL-P${tag}`, productId])).rows[0].id;
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM launch_plans WHERE offer_human_id = $1', [offerHid]).catch(() => {});
    await pool.query('DELETE FROM creatives WHERE id = ANY($1::uuid[])', [ids]).catch(() => {});
    await pool.query('DELETE FROM claims_registry WHERE product_id = $1', [productId]).catch(() => {});
    await pool.query('DELETE FROM offers WHERE id = $1', [offerId]).catch(() => {});
    await pool.query('DELETE FROM products WHERE id = $1', [productId]).catch(() => {});
  });

  it('aprovação: criativo com preço no texto é barrado e a tela mostra o trecho', async () => {
    const id = await mkCreative(`P53${tag}-PRECO`, { headline: 'Trattoria em Casa por R$ 19,90', primary_text: '28 receitas com foto' });
    const r = await review(id);
    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Aprovação bloqueada');
    expect(r.body.error).toContain('título');
  });

  it('aprovação: promessa de preço ligada ao criativo é barrada', async () => {
    const id = await mkCreative(`P53${tag}-CLAIM`, { headline: 'Trattoria em Casa', primary_text: '28 receitas com foto' }, { claim: price });
    const r = await review(id);
    expect(r.status).toBe(409);
    expect(r.body.error).toContain('promessa de preço');
  });

  it('editar o criativo desliga a promessa de preço e libera a aprovação', async () => {
    const id = await mkCreative(`P53${tag}-CLAIM2`, { headline: 'Trattoria em Casa', primary_text: '28 receitas com foto' }, { claim: price });
    await pool.query('INSERT INTO creative_claims (creative_id, claim_id) VALUES ($1, $2)', [id, feature]);
    expect((await review(id)).status).toBe(409);
    const ed = await request(app).post(`/api/creative-factory/creatives/${id}/revise?mode=real`).set('Authorization', `Bearer ${admin}`).send({ headline: 'A lasanha que parece de cantina' });
    expect(ed.status).toBe(200);
    const target = ed.body.creative.id;
    const left = await pool.query(
      'SELECT cr.claim_type FROM creative_claims cc JOIN claims_registry cr ON cr.id = cc.claim_id WHERE cc.creative_id = $1',
      [target]
    );
    expect(left.rows.map(r => r.claim_type)).toEqual(['FEATURE']);
    if (target !== id) ids.push(target);
    expect((await review(target)).status).toBe(200);
  });

  it('aprovação: criativo sem preço passa', async () => {
    const id = await mkCreative(`P53${tag}-OK`, { headline: 'Trattoria em Casa', primary_text: '28 receitas italianas com foto' });
    const r = await review(id);
    expect(r.status).toBe(200);
    expect(r.body.approval_status).toBe('APPROVED');
  });

  it('campanha: editar o título com preço é recusado; a trava antes da Meta pega preço em rascunho antigo', async () => {
    const creativeId = await mkCreative(`P53${tag}-AD`, { headline: 'Trattoria em Casa', primary_text: 'Massa fresca e molho de verdade' }, { approved: true });
    const c = await request(app).post('/api/campaigns').set('Authorization', `Bearer ${admin}`).send({ offer_human_id: offerHid, creative_ids: [creativeId], daily_budget_brl: 20, max_spend_brl: 150 });
    expect(c.status).toBe(201);
    const planId = c.body.id;

    const bad = await request(app).post(`/api/campaigns/${planId}/fields`).set('Authorization', `Bearer ${admin}`).send({ fields: { 'ads.0.headline': 'Kit por apenas 27,90' } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('tire o preço');
    const ok = await request(app).post(`/api/campaigns/${planId}/fields`).set('Authorization', `Bearer ${admin}`).send({ fields: { 'ads.0.headline': 'A lasanha que parece de cantina' } });
    expect(ok.status).toBe(200);

    // rascunho gravado antes da regra (direto no banco), com preço no texto principal
    await pool.query(`UPDATE launch_plans SET spec = jsonb_set(spec, '{ads,0,primary_text}', '"Leve o kit em 4x de 7,48"') WHERE id = $1`, [planId]);
    await expect(assertAdsReadyForMeta(pool, planId)).rejects.toThrow(/tire o preço/);
  });
});
