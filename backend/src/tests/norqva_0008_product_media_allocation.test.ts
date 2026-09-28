import { describe, it, expect, beforeAll } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { resolveCampaignProducts, allocateSpendToProducts } from '../services/finance/productMediaAllocation';

// NORQVA-0008: media spend per product by deterministic campaign → product evidence.
describe('NORQVA-0008 — media per product', () => {
  describe('allocateSpendToProducts (pure)', () => {
    const products = [
      { productId: 'trattoria', grossRevenue: 79.6 },
      { productId: 'bolso', grossRevenue: 0 }
    ];

    it('a product without sales still receives the spend of its own campaign', () => {
      const r = allocateSpendToProducts({
        products,
        campaigns: [
          { campaignDbId: 'c-bb', metaCampaignId: '1', spend: 20.1 },
          { campaignDbId: 'c-tr', metaCampaignId: '2', spend: 231.26 },
          { campaignDbId: 'c-old', metaCampaignId: '3', spend: 939.35 }
        ],
        campaignProduct: new Map([
          ['c-bb', 'bolso'],
          ['c-tr', 'trattoria'],
          ['c-old', null]
        ]),
        totalSpend: 1190.71
      });
      expect(r.directByProduct.get('bolso')).toBe(20.1);
      expect(r.directByProduct.get('trattoria')).toBe(231.26);
      expect(r.unmappedSpend).toBe(939.35);
      // unmapped goes by revenue share: Trattoria is the only product with revenue
      expect(r.proratedByProduct.get('trattoria')).toBe(939.35);
      expect(r.proratedByProduct.get('bolso')).toBeUndefined();
    });

    it('spend without a campaign row (account-level total) is treated as unmapped', () => {
      const r = allocateSpendToProducts({
        products,
        campaigns: [{ campaignDbId: 'c-bb', metaCampaignId: '1', spend: 10 }],
        campaignProduct: new Map([['c-bb', 'bolso']]),
        totalSpend: 50
      });
      expect(r.mappedSpend).toBe(10);
      expect(r.unmappedSpend).toBe(40);
    });

    it('never allocates more than the verified total', () => {
      const r = allocateSpendToProducts({
        products,
        campaigns: [
          { campaignDbId: 'a', metaCampaignId: '1', spend: 60 },
          { campaignDbId: 'b', metaCampaignId: '2', spend: 40 }
        ],
        campaignProduct: new Map([
          ['a', 'bolso'],
          ['b', 'trattoria']
        ]),
        totalSpend: 50
      });
      expect(r.directByProduct.get('bolso')).toBe(30);
      expect(r.directByProduct.get('trattoria')).toBe(20);
      expect(r.unmappedSpend).toBe(0);
    });

    it('with no revenue anywhere, unmapped spend stays unallocated unless there is a single product', () => {
      const two = allocateSpendToProducts({
        products: [
          { productId: 'a', grossRevenue: 0 },
          { productId: 'b', grossRevenue: 0 }
        ],
        campaigns: [],
        campaignProduct: new Map(),
        totalSpend: 30
      });
      expect(two.proratedByProduct.size).toBe(0);
      const one = allocateSpendToProducts({ products: [{ productId: 'a', grossRevenue: 0 }], campaigns: [], campaignProduct: new Map(), totalSpend: 30 });
      expect(one.proratedByProduct.get('a')).toBe(30);
    });
  });

  describe('resolveCampaignProducts (DB)', () => {
    let pool: Pool;
    const tag = crypto.randomUUID().slice(0, 8);
    const ids: Record<string, string> = {};

    beforeAll(async () => {
      pool = initializeDB();
      await runMigrations(pool);

      const mkProduct = async (k: string) => {
        const id = crypto.randomUUID();
        await pool.query(
          `INSERT INTO products (id, human_id, name, category, description, is_demo) VALUES ($1, $2, $3, 'X', 'fixture', TRUE)`,
          [id, `PRD-0008-${k}-${tag}`, `P ${k}`]
        );
        return id;
      };
      ids.pA = await mkProduct('A');
      ids.pB = await mkProduct('B');
      ids.oA = crypto.randomUUID();
      ids.oB = crypto.randomUUID();
      await pool.query(
        `INSERT INTO offers (id, human_id, product_id, name, description, price, is_demo)
         VALUES ($1, $2, $3, 'Offer A', 'x', 10, TRUE), ($4, $5, $6, 'Offer B', 'x', 10, TRUE)`,
        [ids.oA, `OFF-0008-A-${tag}`, ids.pA, ids.oB, `OFF-0008-B-${tag}`, ids.pB]
      );

      const acct = await pool.query(
        `INSERT INTO meta_ad_accounts (meta_account_id, name, currency, is_demo) VALUES ($1, 'acc 0008', 'BRL', TRUE) RETURNING id`,
        [`act_0008_${tag}`]
      );
      const mkCampaign = async (k: string) => {
        const id = crypto.randomUUID();
        await pool.query(
          `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, is_demo)
           VALUES ($1, $2, $3, $4, 'ACTIVE', 'ACTIVE', TRUE)`,
          [id, `cmp0008${k}${tag}`, acct.rows[0].id, `C ${k}`]
        );
        const setId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO meta_ad_sets (id, meta_adset_id, campaign_id, name, status, effective_status, is_demo)
           VALUES ($1, $2, $3, 'S', 'ACTIVE', 'ACTIVE', TRUE)`,
          [setId, `set0008${k}${tag}`, id]
        );
        return { id, setId };
      };
      const mkAd = async (setId: string, metaId: string, name: string) => {
        await pool.query(
          `INSERT INTO meta_ads (id, meta_ad_id, adset_id, name, status, effective_status, is_demo)
           VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE', 'ACTIVE', TRUE)`,
          [metaId, setId, name]
        );
      };

      // Campaign 1: ad name = Factory creative key of product A
      const c1 = await mkCampaign('1');
      ids.c1 = c1.id;
      const key = `KEY-0008-${tag}`;
      await pool.query(
        `INSERT INTO creatives (human_id, product_id, hook, concept, copy, cta, format, status, is_demo, utm_content_key)
         VALUES ($1, $2, 'h', 'c', 'x', 'cta', 'VIDEO', 'IDEIA', TRUE, $1)`,
        [key, ids.pA]
      );
      await mkAd(c1.setId, `ad0008a${tag}`, key.toLowerCase());

      // Campaign 2: no creative, but landing events with campaign_id → offer B
      const c2 = await mkCampaign('2');
      ids.c2 = c2.id;
      await mkAd(c2.setId, `ad0008b${tag}`, `Some ad ${tag}`);
      await pool.query(
        `INSERT INTO commercial_funnel_events (event_id, event_type, visitor_id, offer_id, utm_content, metadata, is_demo)
         VALUES ($1, 'OFFER_VIEW', 'v1', $2, NULL, $3::jsonb, TRUE)`,
        [`ev-0008-1-${tag}`, ids.oB, JSON.stringify({ campaign_id: `cmp00082${tag}` })]
      );

      // Campaign 3: conflicting evidence (utm_content = ad name → offer A and B)
      const c3 = await mkCampaign('3');
      ids.c3 = c3.id;
      await mkAd(c3.setId, `ad0008c${tag}`, `Mixed ${tag}`);
      await pool.query(
        `INSERT INTO commercial_funnel_events (event_id, event_type, visitor_id, offer_id, utm_content, is_demo)
         VALUES ($1, 'OFFER_VIEW', 'v2', $2, $3, TRUE), ($4, 'OFFER_VIEW', 'v3', $5, $3, TRUE)`,
        [`ev-0008-2-${tag}`, ids.oA, `Mixed ${tag}`, `ev-0008-3-${tag}`, ids.oB]
      );

      // Campaign 4: no evidence at all
      const c4 = await mkCampaign('4');
      ids.c4 = c4.id;
      await mkAd(c4.setId, `ad0008d${tag}`, `Lonely ${tag}`);
    });

    it('maps by creative key, by funnel campaign id, and refuses conflicts or missing evidence', async () => {
      const map = await resolveCampaignProducts(pool, true);
      expect(map.get(ids.c1)).toBe(ids.pA);
      expect(map.get(ids.c2)).toBe(ids.pB);
      expect(map.get(ids.c3)).toBeNull();
      expect(map.get(ids.c4)).toBeNull();
    });

    it('does not mix DEMO and REAL rows', async () => {
      const real = await resolveCampaignProducts(pool, false);
      expect(real.has(ids.c1)).toBe(false);
    });
  });
});
