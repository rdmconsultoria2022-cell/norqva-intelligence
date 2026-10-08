import crypto from 'crypto';
import { Pool } from 'pg';
import { CREATIVE_BATCHES, CreativeBatch } from '../../data/creativeBatches';
import { CreativePerformanceService, CreativeItemPerformance } from '../intelligence/creativePerformanceService';
import { writeAuditLog } from '../../db/audit';
import { campaignsForCreatives } from './creativeCampaigns';

// NORQVA-0005 / G1: Creative Factory — matrix, versions, claims, human approval and a
// deterministic scorecard per creative. Recommendations only; nothing here touches Meta.

export const REVIEW_DECISIONS = ['APPROVED', 'REJECTED', 'REVISION_REQUESTED'] as const;
export const CLAIM_TYPES = ['FEATURE', 'PRICE', 'OFFER_TERM', 'RESULT', 'SOCIAL_PROOF', 'TESTIMONIAL', 'SCARCITY', 'AUTHORITY'] as const;
export type ReviewDecision = typeof REVIEW_DECISIONS[number];

export const REJECTION_REASONS = [
  'WEAK_HOOK',
  'ARTIFICIAL_LOOK',
  'BAD_COPY',
  'EXAGGERATED_PROMISE',
  'UNCLEAR_PRODUCT',
  'BAD_VIDEO',
  'WRONG_IDENTITY',
  'BAD_CTA',
  'OFF_STRATEGY',
  'POLICY_RISK',
  'OTHER'
] as const;

export class CreativeFactoryError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const demoSuffix = (isDemo: boolean) => (isDemo ? '-DEMO' : '');

function assertSafeFileUrl(url: string | null | undefined) {
  if (url === null || url === undefined || url === '') return;
  if (!/^https?:\/\/[^\s]+$/i.test(url)) {
    throw new CreativeFactoryError(400, 'O link do arquivo precisa começar com http:// ou https://.');
  }
}

// "$1, $2, ..." placeholders for an IN list (portable across Postgres and pg-mem)
function inList(values: any[], offset = 0): string {
  return values.map((_, i) => `$${i + 1 + offset}`).join(', ');
}

export function computeContentHash(c: {
  hook?: string | null;
  mechanism?: string | null;
  cta?: string | null;
  format?: string | null;
  script?: string | null;
  primary_text?: string | null;
  headline?: string | null;
  file_url?: string | null;
}): string {
  const payload = JSON.stringify([
    c.hook || '',
    c.mechanism || '',
    c.cta || '',
    c.format || '',
    c.script || '',
    c.primary_text || '',
    c.headline || '',
    c.file_url || ''
  ]);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export type CreativeRecommendation =
  | 'NOT_PUBLISHED'
  | 'INSUFFICIENT_DATA'
  | 'OBSERVING'
  | 'PAUSE_RECOMMENDED'
  | 'UNDERPERFORMING'
  | 'PROMISING'
  | 'WINNER_CANDIDATE';

export interface CreativeMetrics {
  spend: number;
  impressions: number;
  link_clicks: number;
  offer_views: number;
  checkout_modal_opened: number;
  checkout_started: number;
  paid_orders: number;
  gross_revenue: number;
}

/**
 * Decision rules from norqva-ai/creative-batches/BB-B01.md section 7, anchored on the
 * offer's unit economics. Auditable and deterministic.
 */
export function recommendCreativeAction(
  m: CreativeMetrics | null,
  breakevenCpa: number | null,
  targetCpa: number | null
): { recommendation: CreativeRecommendation; reason: string } {
  if (!m) return { recommendation: 'NOT_PUBLISHED', reason: 'Nenhum anúncio da Meta ligado a este criativo.' };
  if (!breakevenCpa || breakevenCpa <= 0) {
    return { recommendation: 'OBSERVING', reason: 'Oferta sem custos configurados: não há CPA de equilíbrio para decidir.' };
  }
  const cpa = m.paid_orders > 0 ? m.spend / m.paid_orders : null;
  const linkCtr = m.impressions > 0 ? (m.link_clicks / m.impressions) * 100 : 0;

  if (m.paid_orders >= 3 && cpa !== null && targetCpa !== null && cpa <= targetCpa) {
    return { recommendation: 'WINNER_CANDIDATE', reason: `3+ vendas com CPA R$ ${cpa.toFixed(2)} ≤ alvo R$ ${targetCpa.toFixed(2)}.` };
  }
  if (m.paid_orders >= 1 && cpa !== null && cpa <= breakevenCpa) {
    return { recommendation: 'PROMISING', reason: `Venda com CPA R$ ${cpa.toFixed(2)} ≤ equilíbrio R$ ${breakevenCpa.toFixed(2)}.` };
  }
  if (m.spend < breakevenCpa / 2) {
    return { recommendation: 'INSUFFICIENT_DATA', reason: `Gasto R$ ${m.spend.toFixed(2)} abaixo de metade do CPA de equilíbrio.` };
  }
  if (m.paid_orders === 0 && m.spend >= breakevenCpa * 2) {
    return { recommendation: 'PAUSE_RECOMMENDED', reason: `R$ ${m.spend.toFixed(2)} gastos (≥ 2× equilíbrio) sem venda.` };
  }
  if (m.spend >= 15 && m.impressions >= 500 && linkCtr < 0.6) {
    return { recommendation: 'PAUSE_RECOMMENDED', reason: `CTR de link ${linkCtr.toFixed(2)}% abaixo de 0,6%: o hook não prende.` };
  }
  if (m.paid_orders >= 1 && cpa !== null && cpa > breakevenCpa) {
    return { recommendation: 'UNDERPERFORMING', reason: `CPA R$ ${cpa.toFixed(2)} acima do equilíbrio R$ ${breakevenCpa.toFixed(2)}.` };
  }
  return { recommendation: 'OBSERVING', reason: 'Coletando dados.' };
}

function emptyMetrics(): CreativeMetrics {
  return { spend: 0, impressions: 0, link_clicks: 0, offer_views: 0, checkout_modal_opened: 0, checkout_started: 0, paid_orders: 0, gross_revenue: 0 };
}

function addAd(target: CreativeMetrics, ad: CreativeItemPerformance) {
  target.spend += ad.spend || 0;
  target.impressions += ad.impressions || 0;
  target.link_clicks += ad.link_clicks || 0;
  target.offer_views += ad.offer_views || 0;
  target.checkout_modal_opened += ad.checkout_modal_opened || 0;
  target.checkout_started += ad.checkout_started || 0;
  target.paid_orders += ad.paid_orders || 0;
  target.gross_revenue += ad.gross_revenue || 0;
}

export class CreativeFactoryService {
  async importBatch(pool: Pool, code: string, userId: string | null, isDemo: boolean) {
    let batch: CreativeBatch | undefined = CREATIVE_BATCHES[code];
    if (!batch) {
      // NORQVA-0017 (fase 3): batches built by the AI team live in creative_batches
      const r = await pool.query(`SELECT payload FROM creative_batches WHERE code = $1 AND is_demo = $2`, [code, isDemo]).catch(() => ({ rows: [] as any[] }));
      batch = r.rows[0]?.payload as CreativeBatch | undefined;
    }
    if (!batch) throw new CreativeFactoryError(404, `Lote ${code} não existe.`);
    return this.importBatchData(pool, batch, userId, isDemo);
  }

  /** Imports claims (new ones as given) and creatives as DRAFT. Claim codes not in the batch are looked up in claims_registry. */
  async importBatchData(pool: Pool, batch: CreativeBatch, userId: string | null, isDemo: boolean) {
    const code = batch.code;
    const suffix = demoSuffix(isDemo);
    const product = await pool.query('SELECT id FROM products WHERE id = $1', [batch.productId]);
    if (product.rows.length === 0) throw new CreativeFactoryError(409, 'Produto do lote não encontrado.');
    const offer = await pool.query('SELECT id FROM offers WHERE id = $1', [batch.offerId]);
    if (offer.rows.length === 0) throw new CreativeFactoryError(409, 'Oferta do lote não encontrada.');

    let claimsCreated = 0;
    let creativesCreated = 0;
    let creativesSkipped = 0;
    const claimIdByCode = new Map<string, string>();

    for (const claim of batch.claims) {
      const humanId = `${claim.code}${suffix}`;
      const existing = await pool.query('SELECT id FROM claims_registry WHERE human_id = $1', [humanId]);
      if (existing.rows.length > 0) {
        claimIdByCode.set(claim.code, existing.rows[0].id);
        continue;
      }
      const ins = await pool.query(
        `INSERT INTO claims_registry (human_id, product_id, claim_text, claim_type, source, status, status_note, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [humanId, batch.productId, claim.text, claim.type, claim.source, claim.initialStatus || 'UNVERIFIED', claim.statusNote || null, isDemo]
      );
      claimIdByCode.set(claim.code, ins.rows[0].id);
      claimsCreated++;
    }

    for (const c of batch.creatives) {
      const key = `${c.key}${suffix}`;
      const existing = await pool.query('SELECT id FROM creatives WHERE human_id = $1', [key]);
      if (existing.rows.length > 0) {
        creativesSkipped++;
        continue;
      }
      const hash = computeContentHash({
        hook: c.hook,
        mechanism: c.mechanism,
        cta: c.cta,
        format: c.format,
        script: c.script,
        primary_text: c.primaryText,
        headline: c.headline,
        file_url: null
      });
      const ins = await pool.query(
        `INSERT INTO creatives (
           human_id, product_id, offer_id, hook, concept, copy, cta, format, file_url, responsible_id,
           status, is_demo, batch_code, hook_family, mechanism, duration_seconds, primary_text, headline,
           script, generation_source, version, lineage_code, utm_content_key, content_hash, approval_status
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, NULL, $9,
           'IDEIA', $10, $11, $12, $13, $14, $15, $16,
           $17, 'AI_ASSISTED', 1, $18, $1, $19, 'DRAFT'
         ) RETURNING id`,
        [
          key, batch.productId, batch.offerId, c.hook, c.mechanism, c.primaryText, c.cta, c.format, userId,
          isDemo, batch.code, c.hookFamily, c.mechanism, c.durationSeconds, c.primaryText, c.headline,
          c.script, c.key, hash
        ]
      );
      const creativeId = ins.rows[0].id;
      for (const claimCode of c.claimCodes) {
        let claimId = claimIdByCode.get(claimCode);
        if (!claimId) {
          const found = await pool.query('SELECT id FROM claims_registry WHERE human_id = $1 OR human_id = $2 LIMIT 1', [`${claimCode}${suffix}`, claimCode]);
          if (found.rows[0]) {
            claimId = found.rows[0].id as string;
            claimIdByCode.set(claimCode, claimId);
          }
        }
        if (claimId) {
          await pool.query(
            'INSERT INTO creative_claims (creative_id, claim_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [creativeId, claimId]
          );
        }
      }
      creativesCreated++;
    }

    await writeAuditLog(
      pool,
      userId,
      'CREATIVE_BATCH_IMPORTED',
      `Lote ${code} importado: ${creativesCreated} criativos novos, ${creativesSkipped} já existentes, ${claimsCreated} claims novas.`,
      null,
      null,
      isDemo
    );

    return { batch: code, claimsCreated, creativesCreated, creativesSkipped, totalCreatives: batch.creatives.length };
  }

  async listCreatives(
    pool: Pool,
    opts: { isDemo: boolean; batchCode?: string; dateFrom?: string; dateTo?: string }
  ) {
    const params: any[] = [opts.isDemo];
    // NORQVA-0025: a tela Criativos mostra todos os criativos (lote, manual, Time de IAs, Meta), não só os de lote.
    let where = 'c.is_demo = $1 AND c.is_deleted = FALSE';
    if (opts.batchCode) {
      params.push(opts.batchCode);
      where += ` AND c.batch_code = $${params.length}`;
    }
    const creativesRes = await pool.query(
      `SELECT c.id, c.human_id, c.product_id, c.offer_id, c.hook, c.cta, c.format, c.file_url, c.status,
              c.batch_code, c.hook_family, c.mechanism, c.duration_seconds, c.primary_text, c.headline,
              c.script, c.generation_source, c.parent_creative_id, c.root_creative_id, c.version,
              c.lineage_code, c.utm_content_key, c.content_hash, c.approval_status, c.created_at,
              c.concept, c.copy,
              o.human_id AS offer_human_id, o.name AS offer_name, o.price AS offer_price,
              p.name AS product_name,
              CASE
                WHEN c.batch_code IS NULL THEN 'MANUAL'
                WHEN c.batch_code = 'META_EXTERNO' THEN 'META'
                WHEN EXISTS (SELECT 1 FROM creative_batches cb WHERE cb.code = c.batch_code AND cb.source = 'AI' AND cb.is_demo = c.is_demo) THEN 'AI_TEAM'
                ELSE 'BATCH'
              END AS origin
       FROM creatives c
       LEFT JOIN offers o ON o.id = c.offer_id
       LEFT JOIN products p ON p.id = c.product_id
       WHERE ${where}
       ORDER BY c.human_id ASC`,
      params
    );
    const creatives = creativesRes.rows;
    const ids = creatives.map(c => c.id);

    const claimsByCreative = new Map<string, any[]>();
    const reviewsByCreative = new Map<string, any[]>();
    const manualLinks = new Map<string, string[]>();
    if (ids.length > 0) {
      const claimRows = await pool.query(
        `SELECT cc.creative_id, cr.id, cr.human_id, cr.claim_text, cr.claim_type, cr.status, cr.valid_until
         FROM creative_claims cc JOIN claims_registry cr ON cr.id = cc.claim_id
         WHERE cc.creative_id IN (${inList(ids)})
         ORDER BY cr.human_id`,
        ids
      );
      for (const r of claimRows.rows) {
        const list = claimsByCreative.get(r.creative_id) || [];
        list.push({ id: r.id, human_id: r.human_id, text: r.claim_text, type: r.claim_type, status: r.status, valid_until: r.valid_until });
        claimsByCreative.set(r.creative_id, list);
      }
      const reviewRows = await pool.query(
        `SELECT cr.creative_id, cr.decision, cr.reason_code, cr.notes, cr.content_hash, cr.created_at, u.name AS reviewer_name
         FROM creative_reviews cr LEFT JOIN users u ON u.id = cr.reviewer_id
         WHERE cr.creative_id IN (${inList(ids)})
         ORDER BY cr.created_at DESC`,
        ids
      );
      for (const r of reviewRows.rows) {
        const list = reviewsByCreative.get(r.creative_id) || [];
        list.push(r);
        reviewsByCreative.set(r.creative_id, list);
      }
      const linkRows = await pool.query(
        `SELECT creative_id, meta_ad_id FROM creative_meta_ads WHERE creative_id IN (${inList(ids)})`,
        ids
      );
      for (const r of linkRows.rows) {
        const list = manualLinks.get(r.creative_id) || [];
        list.push(r.meta_ad_id);
        manualLinks.set(r.creative_id, list);
      }
    }

    // Unit economics per offer (same formula as the financial dashboard)
    const econByOffer = new Map<string, { breakeven_cpa: number | null; target_cpa: number | null }>();
    const offerIds = [...new Set(creatives.map(c => c.offer_id).filter(Boolean))];
    if (offerIds.length > 0) {
      const econ = await pool.query(
        `SELECT o.id AS offer_id, o.price, o.promotional_price, ue.tax_rate, ue.gateway_fixed_fee, ue.gateway_pct_fee,
                ue.other_variable_cost, ue.target_net_margin, ue.id AS ue_id
         FROM offers o
         LEFT JOIN offer_unit_economics ue ON ue.offer_id = o.id AND ue.is_demo = FALSE
         WHERE o.id IN (${inList(offerIds)})`,
        offerIds
      );
      for (const r of econ.rows) {
        if (!r.ue_id) {
          econByOffer.set(r.offer_id, { breakeven_cpa: null, target_cpa: null });
          continue;
        }
        const price = r.promotional_price !== null ? parseFloat(r.promotional_price) : parseFloat(r.price);
        const breakeven = price - (price * parseFloat(r.tax_rate) + parseFloat(r.gateway_fixed_fee) + price * parseFloat(r.gateway_pct_fee) + parseFloat(r.other_variable_cost));
        const target = breakeven - price * parseFloat(r.target_net_margin);
        econByOffer.set(r.offer_id, {
          breakeven_cpa: Math.round(breakeven * 100) / 100,
          target_cpa: Math.round(target * 100) / 100
        });
      }
    }

    // Scorecard: Meta ad name == utm_content_key (exact), or a manual link by meta_ad_id
    const perf = await new CreativePerformanceService().getCreativePerformance(pool, {
      is_demo: opts.isDemo,
      date_from: opts.dateFrom,
      date_to: opts.dateTo
    });
    const adsByName = new Map<string, CreativeItemPerformance[]>();
    const adsById = new Map<string, CreativeItemPerformance>();
    for (const ad of perf.creatives) {
      adsById.set(ad.ad_id, ad);
      const nameKey = (ad.ad_name || '').trim().toUpperCase();
      const list = adsByName.get(nameKey) || [];
      list.push(ad);
      adsByName.set(nameKey, list);
    }

    // NORQVA-0011: campaign(s) each creative runs in
    const campaignsByCreative = await campaignsForCreatives(pool, opts.isDemo, creatives);

    const items = creatives.map(c => {
      const linked = new Map<string, CreativeItemPerformance>();
      // NORQVA-0025: criativo manual antigo pode não ter chave; sem chave, só vínculos manuais
      const nameKey = c.utm_content_key || c.human_id;
      if (nameKey) {
        for (const ad of adsByName.get(String(nameKey).toUpperCase()) || []) linked.set(ad.ad_id, ad);
      }
      for (const adId of manualLinks.get(c.id) || []) {
        const ad = adsById.get(adId);
        if (ad) linked.set(ad.ad_id, ad);
      }
      let metrics: CreativeMetrics | null = null;
      if (linked.size > 0) {
        metrics = emptyMetrics();
        for (const ad of linked.values()) addAd(metrics, ad);
        metrics.spend = Math.round(metrics.spend * 100) / 100;
        metrics.gross_revenue = Math.round(metrics.gross_revenue * 100) / 100;
      }
      const econ = econByOffer.get(c.offer_id) || { breakeven_cpa: null, target_cpa: null };
      const rec = recommendCreativeAction(metrics, econ.breakeven_cpa, econ.target_cpa);
      const claims = claimsByCreative.get(c.id) || [];
      return {
        ...c,
        claims,
        claims_all_verified: claims.length > 0 && claims.every(cl => cl.status === 'VERIFIED' && (!cl.valid_until || new Date(cl.valid_until) > new Date())),
        reviews: reviewsByCreative.get(c.id) || [],
        linked_meta_ads: [...linked.keys()],
        campaigns: campaignsByCreative.get(String(c.id)) || [],
        metrics,
        cpa: metrics && metrics.paid_orders > 0 ? Math.round((metrics.spend / metrics.paid_orders) * 100) / 100 : null,
        link_ctr: metrics && metrics.impressions > 0 ? Math.round((metrics.link_clicks / metrics.impressions) * 10000) / 100 : null,
        breakeven_cpa: econ.breakeven_cpa,
        target_cpa: econ.target_cpa,
        recommendation: rec.recommendation,
        recommendation_reason: rec.reason
      };
    });

    // Visão por campanha: todas as campanhas da conta (ativas, pausadas e demais), cada uma com
    // seus anúncios na Meta. Anúncio ligado a um criativo da Fábrica leva factory_creative_id;
    // os demais (ex.: criados no Gerenciador ou por plano de lançamento) aparecem como externos.
    const adToCreative = new Map<string, string>();
    for (const it of items) {
      for (const cp of it.campaigns) for (const adId of cp.meta_ad_ids) adToCreative.set(String(adId), String(it.id));
      for (const adId of it.linked_meta_ads) adToCreative.set(String(adId), String(it.id));
    }
    const campRows = await pool.query(
      `SELECT mc.meta_campaign_id, mc.name, mc.status, mc.effective_status,
              ma.meta_ad_id, ma.name AS ad_name, ma.status AS ad_status, ma.effective_status AS ad_effective_status,
              mas.name AS adset_name, ma.creative_title, ma.creative_body, ma.creative_cta,
              ma.thumbnail_url, ma.image_url, ma.video_id
       FROM meta_campaigns mc
       LEFT JOIN meta_ad_sets mas ON mas.campaign_id = mc.id
       LEFT JOIN meta_ads ma ON ma.adset_id = mas.id
       WHERE mc.is_demo = $1
       ORDER BY mc.name ASC, ma.name ASC`,
      [opts.isDemo]
    );
    const campaignsById = new Map<string, any>();
    for (const r of campRows.rows) {
      const cid = String(r.meta_campaign_id);
      if (!campaignsById.has(cid)) {
        campaignsById.set(cid, { meta_campaign_id: cid, name: r.name, status: r.status || null, effective_status: r.effective_status || null, ads: [] });
      }
      if (!r.meta_ad_id) continue;
      const perfAd = adsById.get(String(r.meta_ad_id));
      let adMetrics: CreativeMetrics | null = null;
      if (perfAd) {
        adMetrics = emptyMetrics();
        addAd(adMetrics, perfAd);
        adMetrics.spend = Math.round(adMetrics.spend * 100) / 100;
        adMetrics.gross_revenue = Math.round(adMetrics.gross_revenue * 100) / 100;
      }
      campaignsById.get(cid).ads.push({
        meta_ad_id: String(r.meta_ad_id),
        name: r.ad_name,
        status: r.ad_status || null,
        effective_status: r.ad_effective_status || null,
        adset_name: r.adset_name || null,
        creative_title: r.creative_title || null,
        creative_body: r.creative_body || null,
        creative_cta: r.creative_cta || null,
        thumbnail_url: r.thumbnail_url || null,
        image_url: r.image_url || null,
        video_id: r.video_id || null,
        factory_creative_id: adToCreative.get(String(r.meta_ad_id)) || null,
        metrics: adMetrics
      });
    }

    const batchRows = await pool.query(
      'SELECT DISTINCT batch_code FROM creatives WHERE is_demo = $1 AND batch_code IS NOT NULL ORDER BY batch_code',
      [opts.isDemo]
    );
    const claimsRes = await pool.query(
      `SELECT id, human_id, product_id, claim_text, claim_type, source, status, status_note, verified_at, valid_until
       FROM claims_registry WHERE is_demo = $1 ORDER BY human_id`,
      [opts.isDemo]
    );

    return {
      availableBatches: Object.keys(CREATIVE_BATCHES),
      importedBatches: batchRows.rows.map(r => r.batch_code),
      claims: claimsRes.rows,
      creatives: items,
      campaigns: [...campaignsById.values()],
      rejectionReasons: REJECTION_REASONS,
      producedAssets: Object.fromEntries(
        Object.entries(CREATIVE_BATCHES).map(([code, b]) => [code, Object.keys(b.producedAssets || {})])
      )
    };
  }

  async updateClaimStatus(
    pool: Pool,
    claimId: string,
    status: string,
    note: string | null,
    userId: string | null,
    isDemo: boolean
  ) {
    if (!['VERIFIED', 'REJECTED', 'UNVERIFIED', 'EXPIRED'].includes(status)) {
      throw new CreativeFactoryError(400, 'Status de claim inválido.');
    }
    if (status === 'REJECTED' && !note) {
      throw new CreativeFactoryError(400, 'Informe o motivo da rejeição da claim.');
    }
    const prev = await pool.query('SELECT id, human_id, status FROM claims_registry WHERE id = $1 AND is_demo = $2', [claimId, isDemo]);
    if (prev.rows.length === 0) throw new CreativeFactoryError(404, 'Claim não encontrada.');
    const res =
      status === 'VERIFIED'
        ? await pool.query(
            `UPDATE claims_registry SET status = 'VERIFIED', status_note = $1, verified_by = $2, verified_at = NOW(), updated_at = NOW()
             WHERE id = $3 RETURNING id, human_id, status, status_note, verified_at`,
            [note, userId, claimId]
          )
        : await pool.query(
            `UPDATE claims_registry SET status = $1, status_note = $2, updated_at = NOW()
             WHERE id = $3 RETURNING id, human_id, status, status_note, verified_at`,
            [status, note, claimId]
          );
    // An approval is only valid while every claim it relies on stays VERIFIED
    if (status !== 'VERIFIED') {
      const affected = await pool.query(
        `SELECT c.id, c.human_id, c.content_hash FROM creatives c
         JOIN creative_claims cc ON cc.creative_id = c.id
         WHERE cc.claim_id = $1 AND c.approval_status = 'APPROVED'`,
        [claimId]
      );
      for (const c of affected.rows) {
        await pool.query(
          `INSERT INTO creative_reviews (creative_id, content_hash, decision, reason_code, notes, reviewer_id, is_demo)
           VALUES ($1, $2, 'REVISION_REQUESTED', 'POLICY_RISK', $3, $4, $5)`,
          [c.id, c.content_hash || 'UNHASHED', `Claim ${prev.rows[0].human_id} deixou de estar verificada`, userId, isDemo]
        );
        await pool.query(`UPDATE creatives SET approval_status = 'REVISION_REQUESTED', updated_at = NOW() WHERE id = $1`, [c.id]);
      }
    }
    await writeAuditLog(pool, userId, 'CLAIM_STATUS_CHANGED', `Claim ${prev.rows[0].human_id}: ${prev.rows[0].status} → ${status}`, prev.rows[0].status, status, isDemo);
    return res.rows[0];
  }

  async reviewCreative(
    pool: Pool,
    creativeId: string,
    input: { decision: string; reason_code?: string | null; notes?: string | null },
    userId: string | null,
    isDemo: boolean
  ) {
    const decision = input.decision as ReviewDecision;
    if (!REVIEW_DECISIONS.includes(decision)) throw new CreativeFactoryError(400, 'Decisão inválida.');
    if (decision === 'REJECTED' && !input.reason_code) {
      throw new CreativeFactoryError(400, 'Informe o motivo da rejeição.');
    }
    if (input.reason_code && !(REJECTION_REASONS as readonly string[]).includes(input.reason_code)) {
      throw new CreativeFactoryError(400, 'Motivo inválido.');
    }
    if (decision === 'REVISION_REQUESTED' && !input.notes && !input.reason_code) {
      throw new CreativeFactoryError(400, 'Descreva o ajuste pedido.');
    }

    const cRes = await pool.query(
      'SELECT id, human_id, approval_status, content_hash FROM creatives WHERE id = $1 AND is_demo = $2 AND is_deleted = FALSE',
      [creativeId, isDemo]
    );
    if (cRes.rows.length === 0) throw new CreativeFactoryError(404, 'Criativo não encontrado.');
    const creative = cRes.rows[0];
    if (creative.approval_status === 'SUPERSEDED') {
      throw new CreativeFactoryError(409, 'Esta versão foi substituída por uma mais nova.');
    }

    if (decision === 'APPROVED') {
      const claims = await pool.query(
        `SELECT cr.human_id, cr.status, cr.valid_until
         FROM creative_claims cc JOIN claims_registry cr ON cr.id = cc.claim_id
         WHERE cc.creative_id = $1`,
        [creativeId]
      );
      if (claims.rows.length === 0) {
        throw new CreativeFactoryError(409, 'Criativo sem claims registradas: não pode ser aprovado.');
      }
      const blocked = claims.rows.filter(
        r => r.status !== 'VERIFIED' || (r.valid_until && new Date(r.valid_until) <= new Date())
      );
      if (blocked.length > 0) {
        throw new CreativeFactoryError(
          409,
          `Aprovação bloqueada: claims não verificadas (${blocked.map(b => b.human_id).join(', ')}).`
        );
      }
    }

    const reviewIns = await pool.query(
      `INSERT INTO creative_reviews (creative_id, content_hash, decision, reason_code, notes, reviewer_id, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [creativeId, creative.content_hash || 'UNHASHED', decision, input.reason_code || null, input.notes || null, userId, isDemo]
    );
    const updated = await pool.query(
      `UPDATE creatives SET approval_status = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, human_id, approval_status`,
      [decision, creativeId]
    );
    await writeAuditLog(
      pool,
      userId,
      'CREATIVE_REVIEWED',
      `Criativo ${creative.human_id}: ${decision}${input.reason_code ? ` (${input.reason_code})` : ''}`,
      creative.approval_status,
      decision,
      isDemo
    );
    return { ...updated.rows[0], review_id: reviewIns.rows[0]?.id || null };
  }

  async reviseCreative(
    pool: Pool,
    creativeId: string,
    changes: { hook?: string; primary_text?: string; headline?: string; cta?: string; script?: string; file_url?: string | null },
    userId: string | null,
    isDemo: boolean,
    options: { forceNewVersion?: boolean } = {}
  ) {
    const cRes = await pool.query(
      'SELECT * FROM creatives WHERE id = $1 AND is_demo = $2 AND is_deleted = FALSE',
      [creativeId, isDemo]
    );
    if (cRes.rows.length === 0) throw new CreativeFactoryError(404, 'Criativo não encontrado.');
    const cur = cRes.rows[0];
    if (cur.approval_status === 'SUPERSEDED') {
      throw new CreativeFactoryError(409, 'Edite a versão mais nova deste criativo.');
    }

    assertSafeFileUrl(changes.file_url);
    if (changes.cta !== undefined && String(changes.cta).length > 100) {
      throw new CreativeFactoryError(400, 'O CTA pode ter no máximo 100 caracteres.');
    }
    for (const [field, value] of Object.entries({ hook: changes.hook, primary_text: changes.primary_text, cta: changes.cta })) {
      if (value !== undefined && String(value).trim() === '') {
        throw new CreativeFactoryError(400, `O campo ${field} não pode ficar vazio.`);
      }
    }
    const next = {
      hook: changes.hook ?? cur.hook,
      primary_text: changes.primary_text ?? cur.primary_text ?? cur.copy,
      headline: changes.headline ?? cur.headline,
      cta: changes.cta ?? cur.cta,
      script: changes.script ?? cur.script,
      file_url: changes.file_url !== undefined ? changes.file_url : cur.file_url
    };
    const hash = computeContentHash({ ...next, mechanism: cur.mechanism, format: cur.format });
    // NORQVA-0025: criativos antigos podem não ter hash salvo; calcula o atual para comparar
    const curHash =
      cur.content_hash ||
      computeContentHash({
        hook: cur.hook, mechanism: cur.mechanism, cta: cur.cta, format: cur.format, script: cur.script,
        primary_text: cur.primary_text ?? cur.copy, headline: cur.headline, file_url: cur.file_url
      });
    if (hash === curHash) throw new CreativeFactoryError(400, 'Nenhuma alteração no conteúdo.');

    // NORQVA-0007: only the file changed → attach it to this version. The approved copy stays the same,
    // and a new version (new key) would break the link with the Meta ad name.
    const copyUnchanged =
      next.hook === cur.hook &&
      (next.primary_text || '') === (cur.primary_text ?? cur.copy ?? '') &&
      (next.headline || '') === (cur.headline || '') &&
      next.cta === cur.cta &&
      (next.script || '') === (cur.script || '');
    if (!options.forceNewVersion && copyUnchanged && next.file_url && next.file_url !== cur.file_url) {
      const attached = await this.attachFile(pool, creativeId, next.file_url, userId, isDemo);
      return { mode: 'FILE_ATTACHED', creative: attached };
    }

    const reviewed = await pool.query('SELECT 1 FROM creative_reviews WHERE creative_id = $1 LIMIT 1', [creativeId]);
    if (!options.forceNewVersion && reviewed.rows.length === 0 && cur.approval_status === 'DRAFT') {
      // Never reviewed: edit in place (no review is bound to the old content)
      const upd = await pool.query(
        `UPDATE creatives SET hook = $1, primary_text = $2, copy = $2, headline = $3, cta = $4, script = $5,
                file_url = $6, content_hash = $7, updated_at = NOW()
         WHERE id = $8 RETURNING id, human_id, version, approval_status`,
        [next.hook, next.primary_text, next.headline, next.cta, next.script, next.file_url, hash, creativeId]
      );
      return { mode: 'EDITED_IN_PLACE', creative: upd.rows[0] };
    }

    // Reviewed content is immutable: create a new version
    const rootId = cur.root_creative_id || cur.id;
    const rootRes = await pool.query('SELECT human_id FROM creatives WHERE id = $1', [rootId]);
    const rootKey = String(rootRes.rows[0]?.human_id || cur.human_id).replace(/-DEMO$/, '');
    const maxV = await pool.query('SELECT MAX(version)::int AS v FROM creatives WHERE id = $1 OR root_creative_id = $1', [rootId]);
    const version = (maxV.rows[0]?.v || cur.version || 1) + 1;
    const newKey = `${rootKey}-V${version}${demoSuffix(isDemo)}`;

    // New version + claim copy + supersede old one: all or nothing
    const client = await pool.connect();
    let ins: any;
    try {
      await client.query('BEGIN');
      ins = await client.query(
        `INSERT INTO creatives (
           human_id, product_id, offer_id, hook, concept, copy, cta, format, file_url, responsible_id, status, is_demo,
           batch_code, hook_family, angle, pain, desire, mechanism, proof_type, audience, duration_seconds,
           primary_text, headline, script, generation_source, parent_creative_id, root_creative_id, version,
           lineage_code, utm_content_key, content_hash, approval_status
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'IDEIA', $11,
           $12, $13, $14, $15, $16, $17, $18, $19, $20,
           $6, $21, $22, $23, $24, $25, $26,
           $27, $1, $28, 'DRAFT'
         ) RETURNING id, human_id, version, approval_status`,
        [
          newKey, cur.product_id, cur.offer_id, next.hook, cur.concept, next.primary_text, next.cta, cur.format, next.file_url, userId, isDemo,
          cur.batch_code, cur.hook_family, cur.angle, cur.pain, cur.desire, cur.mechanism, cur.proof_type, cur.audience, cur.duration_seconds,
          next.headline, next.script, 'HUMAN', cur.id, rootId, version,
          `${cur.lineage_code || rootKey}>V${version}`, hash
        ]
      );
      const newId = ins.rows[0].id;
      await client.query(
        'INSERT INTO creative_claims (creative_id, claim_id) SELECT $1::uuid, claim_id FROM creative_claims WHERE creative_id = $2::uuid ON CONFLICT DO NOTHING',
        [newId, cur.id]
      );
      await client.query(`UPDATE creatives SET approval_status = 'SUPERSEDED', updated_at = NOW() WHERE id = $1`, [cur.id]);
      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      if (err?.code === '23505') {
        throw new CreativeFactoryError(409, 'Outra edição deste criativo acabou de ser salva. Recarregue e tente de novo.');
      }
      throw err;
    } finally {
      client.release();
    }
    await writeAuditLog(pool, userId, 'CREATIVE_VERSIONED', `Criativo ${cur.human_id} → nova versão ${newKey}`, cur.human_id, newKey, isDemo);
    return { mode: 'NEW_VERSION', creative: ins.rows[0] };
  }

  /**
   * NORQVA-0007: attach (or replace) the produced file of a creative without creating a new version.
   * The file is the production of the approved copy; approval and the Meta link are kept.
   */
  async attachFile(pool: Pool, creativeId: string, fileUrl: string, userId: string | null, isDemo: boolean) {
    const url = String(fileUrl || '').trim();
    if (!url) throw new CreativeFactoryError(400, 'Informe o link do arquivo.');
    assertSafeFileUrl(url);
    const cRes = await pool.query(
      'SELECT * FROM creatives WHERE id = $1 AND is_demo = $2 AND is_deleted = FALSE',
      [creativeId, isDemo]
    );
    if (cRes.rows.length === 0) throw new CreativeFactoryError(404, 'Criativo não encontrado.');
    const cur = cRes.rows[0];
    if (cur.approval_status === 'SUPERSEDED') {
      throw new CreativeFactoryError(409, 'Anexe o arquivo na versão mais nova deste criativo.');
    }
    const hash = computeContentHash({
      hook: cur.hook,
      mechanism: cur.mechanism,
      cta: cur.cta,
      format: cur.format,
      script: cur.script,
      primary_text: cur.primary_text ?? cur.copy,
      headline: cur.headline,
      file_url: url
    });
    const upd = await pool.query(
      `UPDATE creatives SET file_url = $1, content_hash = $2, updated_at = NOW()
       WHERE id = $3 RETURNING id, human_id, file_url, version, approval_status`,
      [url, hash, creativeId]
    );
    await writeAuditLog(pool, userId, 'CREATIVE_FILE_ATTACHED', `Arquivo anexado ao criativo ${cur.human_id}`, cur.file_url || null, url, isDemo);
    return upd.rows[0];
  }

  /** NORQVA-0007: attach every file already produced for a batch to creatives that still have none. */
  async attachProducedAssets(pool: Pool, batchCode: string, userId: string | null, isDemo: boolean) {
    const batch = CREATIVE_BATCHES[batchCode];
    if (!batch) throw new CreativeFactoryError(404, 'Lote não encontrado.');
    const assets = batch.producedAssets || {};
    const attached: string[] = [];
    const skipped: string[] = [];
    for (const [key, url] of Object.entries(assets)) {
      const humanId = `${key}${demoSuffix(isDemo)}`;
      const r = await pool.query(
        `SELECT id, file_url FROM creatives
         WHERE human_id = $1 AND is_demo = $2 AND is_deleted = FALSE AND batch_code = $3 AND approval_status <> 'SUPERSEDED'`,
        [humanId, isDemo, batchCode]
      );
      if (r.rows.length === 0 || (r.rows[0].file_url && String(r.rows[0].file_url).trim() !== '')) {
        skipped.push(key);
        continue;
      }
      await this.attachFile(pool, r.rows[0].id, url, userId, isDemo);
      attached.push(key);
    }
    return { batch: batchCode, attached, skipped, available: Object.keys(assets).length };
  }

  async linkMetaAd(pool: Pool, creativeId: string, metaAdId: string, userId: string | null, isDemo: boolean) {
    const c = await pool.query('SELECT id, human_id FROM creatives WHERE id = $1 AND is_demo = $2 AND is_deleted = FALSE', [creativeId, isDemo]);
    if (c.rows.length === 0) throw new CreativeFactoryError(404, 'Criativo não encontrado.');
    const ad = await pool.query('SELECT meta_ad_id FROM meta_ads WHERE meta_ad_id = $1 AND is_demo = $2', [metaAdId, isDemo]);
    if (ad.rows.length === 0) throw new CreativeFactoryError(404, 'Anúncio da Meta não encontrado (sincronize antes).');
    await pool.query(
      `INSERT INTO creative_meta_ads (creative_id, meta_ad_id, link_method, linked_by) VALUES ($1, $2, 'MANUAL', $3)
       ON CONFLICT (creative_id, meta_ad_id) DO NOTHING`,
      [creativeId, metaAdId, userId]
    );
    await writeAuditLog(pool, userId, 'CREATIVE_AD_LINKED', `Criativo ${c.rows[0].human_id} ligado ao anúncio ${metaAdId}`, null, metaAdId, isDemo);
    return { creative_id: creativeId, meta_ad_id: metaAdId };
  }

  /**
   * NORQVA-0025: registra uma promessa (claim) num criativo — uma claim já existente do mesmo produto
   * ou uma nova, que entra como UNVERIFIED. A regra de aprovação não muda: só aprova com todas verificadas.
   */
  async addClaimToCreative(
    pool: Pool,
    creativeId: string,
    input: { claim_id?: string | null; claim_text?: string | null; claim_type?: string | null; source?: string | null },
    userId: string | null,
    isDemo: boolean
  ) {
    const cRes = await pool.query(
      'SELECT id, human_id, product_id, approval_status FROM creatives WHERE id = $1 AND is_demo = $2 AND is_deleted = FALSE',
      [creativeId, isDemo]
    );
    if (cRes.rows.length === 0) throw new CreativeFactoryError(404, 'Criativo não encontrado.');
    const creative = cRes.rows[0];
    if (creative.approval_status === 'SUPERSEDED') {
      throw new CreativeFactoryError(409, 'Registre a promessa na versão mais nova deste criativo.');
    }
    if (creative.approval_status === 'APPROVED') {
      throw new CreativeFactoryError(409, 'Criativo já aprovado: para mudar as promessas, crie uma nova versão.');
    }

    let claimId: string;
    let claimHumanId: string;
    if (input.claim_id) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.claim_id)) {
        throw new CreativeFactoryError(400, 'Promessa inválida.');
      }
      const existing = await pool.query(
        'SELECT id, human_id, product_id FROM claims_registry WHERE id = $1 AND is_demo = $2',
        [input.claim_id, isDemo]
      );
      if (existing.rows.length === 0) throw new CreativeFactoryError(404, 'Promessa não encontrada.');
      if (existing.rows[0].product_id && String(existing.rows[0].product_id) !== String(creative.product_id)) {
        throw new CreativeFactoryError(409, 'Esta promessa é de outro produto.');
      }
      claimId = existing.rows[0].id;
      claimHumanId = existing.rows[0].human_id;
    } else {
      const text = String(input.claim_text || '').trim();
      if (!text) throw new CreativeFactoryError(400, 'Escreva a promessa que o anúncio faz.');
      if (text.length > 500) throw new CreativeFactoryError(400, 'A promessa pode ter no máximo 500 caracteres.');
      const type = String(input.claim_type || 'FEATURE');
      if (!(CLAIM_TYPES as readonly string[]).includes(type)) throw new CreativeFactoryError(400, 'Tipo de promessa inválido.');
      claimHumanId = `CLM-${crypto.randomBytes(4).toString('hex').toUpperCase()}${demoSuffix(isDemo)}`;
      const ins = await pool.query(
        `INSERT INTO claims_registry (human_id, product_id, claim_text, claim_type, source, status, is_demo)
         VALUES ($1, $2, $3, $4, $5, 'UNVERIFIED', $6) RETURNING id`,
        [claimHumanId, creative.product_id, text, type, input.source ? String(input.source).slice(0, 500) : `Criativo ${creative.human_id}`, isDemo]
      );
      claimId = ins.rows[0].id;
    }
    await pool.query(
      'INSERT INTO creative_claims (creative_id, claim_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [creativeId, claimId]
    );
    await writeAuditLog(pool, userId, 'CREATIVE_CLAIM_ADDED', `Promessa ${claimHumanId} registrada no criativo ${creative.human_id}`, null, claimHumanId, isDemo);
    return { creative_id: creativeId, claim_id: claimId, claim_human_id: claimHumanId };
  }
}
