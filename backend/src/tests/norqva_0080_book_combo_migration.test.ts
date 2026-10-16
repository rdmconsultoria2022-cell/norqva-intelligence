// NORQVA-0080: migration 068 (bloco DO: só no PostgreSQL do CI) e preço do Dolci sozinho na página pública.
// - Dolci por R$ 5,00 nos quatro livros, cartão com 1x sem acréscimo e 2,99% ao mês acima.
// - Kit de 5 de R$ 94,50 por R$ 29,90, ofertas de saída pausadas, Kit Cozinha Italiana por R$ 24,90, +4 livros por R$ 9,90.
import { describe, it, expect, beforeAll } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { initializeDB, isDbInMemory } from '../db/db';
import { runMigrations } from '../db/migrations';
import { installmentOptions, planFromOffer } from '../services/commerce/cardInstallments';

const SQL = fs.readFileSync(path.join(__dirname, '../db/migrations/068_book_dolci_combo_kit_2990.sql'), 'utf8');

describe('NORQVA-0080 — parcelas reais com 1x sem acréscimo e 2,99% ao mês', () => {
  const plan = planFromOffer({ card_max_installments: 10, card_free_installments: 1, card_interest_monthly: 2.99 });
  const last = (cents: number) => installmentOptions(cents, plan).slice(-1)[0];
  it('livro R$ 19,90 vai até 4x, livro + Dolci R$ 24,90 até 5x, kit R$ 29,90 até 6x (parcela mínima R$ 5,00)', () => {
    expect(last(1990)).toEqual({ n: 4, valueCents: 536, totalCents: 2144, interest: true });
    expect(last(2490)).toEqual({ n: 5, valueCents: 544, totalCents: 2720, interest: true });
    expect(last(2990)).toEqual({ n: 6, valueCents: 552, totalCents: 3312, interest: true });
    expect(installmentOptions(2490, plan)[0]).toEqual({ n: 1, valueCents: 2490, totalCents: 2490, interest: false });
  });
});

describe.skipIf(!process.env.DATABASE_URL_TEST || isDbInMemory())('NORQVA-0080 — migration 068', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
  });

  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const code = (n: string) => `OFF-${n}X${tag}`;
  const CODES = ['000001', '000005', '000006', '000007', '000008', '000009', '000010'];
  let sql = SQL;
  for (const n of CODES) sql = sql.split(`'OFF-${n}'`).join(`'${code(n)}'`);

  async function fixtures(c: any, opts: { dolci?: boolean } = {}) {
    const prd = crypto.randomUUID();
    await c.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance)
       VALUES ($1, $2, 'Coleção 0080', 'Receitas', 'x', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
      [prd, `PRD-0080${tag}`]
    );
    const asset = async (name: string) => {
      const id = crypto.randomUUID();
      await c.query(
        `INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo)
         VALUES ($1, $2, 'SUPABASE', 'digital-products', $3, false)`,
        [id, name, `books/0080-${tag}-${id.slice(0, 6)}.pdf`]
      );
      return id;
    };
    const offer = async (human: string, name: string, price: number, promo: number | null, files: string[], extra: Record<string, any> = {}) => {
      const id = crypto.randomUUID();
      await c.query(
        `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo, data_provenance,
                             card_enabled, card_max_installments, card_total_price, card_free_installments, card_interest_monthly)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'x', false, 'COMMERCIAL_PRODUCTION', $8, $9, $10, $11, $12)`,
        [id, human, name, prd, price, promo, extra.status || 'ATIVA', extra.card ?? false, extra.max ?? 1, extra.total ?? null, extra.free ?? null, extra.rate ?? 0]
      );
      for (const a of files) await c.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [id, a]);
      return id;
    };
    const pdf: Record<string, string> = {};
    for (const b of ['trattoria', 'dolci', 'paes', 'antipasti', 'risotos']) pdf[b] = await asset(b);
    const ids: Record<string, string> = {};
    ids.trattoria = await offer(code('000001'), 'TRATTORIA EM CASA', 19.9, null, [pdf.trattoria]);
    if (opts.dolci !== false) ids.dolci = await offer(code('000005'), 'DOLCI DELLA NONNA', 14.9, null, [pdf.dolci]);
    ids.paes = await offer(code('000007'), 'Pães', 19.9, null, [pdf.paes]);
    ids.antipasti = await offer(code('000008'), 'Antipasti', 19.9, null, [pdf.antipasti]);
    ids.risotos = await offer(code('000009'), 'Risotos', 19.9, null, [pdf.risotos], { card: true, max: 6, free: 3, rate: 2.99, total: 19.92 });
    ids.combo = await offer(code('000006'), 'Kit Cozinha Italiana', 34.8, 27.9, [pdf.trattoria, pdf.dolci], { card: true, max: 12, free: 4, rate: 2.99, total: 27.92 });
    ids.kit = await offer(code('000010'), 'KIT TRATTORIA COMPLETO — 5 LIVROS', 94.5, 79.92, Object.values(pdf), { card: true, max: 10, free: 4, rate: 2.99, total: 79.92 });
    ids.exit39 = await offer(`OFF-E39${tag}`, 'KIT TRATTORIA COMPLETO — 5 LIVROS | Oferta de saída R$ 39,90', 39.9, null, Object.values(pdf));
    ids.exit49 = await offer(`OFF-E49${tag}`, 'KIT TRATTORIA COMPLETO — 5 LIVROS | Oferta de saída R$ 49,90', 49.9, null, Object.values(pdf));
    await c.query('UPDATE offers SET exit_offer_id = $1 WHERE id = $2', [ids.exit39, ids.exit49]);
    await c.query('UPDATE offers SET exit_offer_id = $1 WHERE id = $2', [ids.exit49, ids.kit]);
    ids.post = await offer(`OFF-PP${tag}`, 'COMPLETE A COLEÇÃO — +4 LIVROS', 27.9, null, [pdf.dolci, pdf.paes, pdf.antipasti, pdf.risotos]);
    await c.query('UPDATE offers SET post_purchase_offer_id = $1 WHERE id = $2', [ids.post, ids.trattoria]);
    if (ids.dolci) {
      // o Trattoria já tinha o Dolci como adicional a R$ 14,90 (desligado aqui, a migration liga)
      await c.query(
        `INSERT INTO offer_bumps (offer_id, bump_offer_id, bump_price, headline, is_active, is_demo) VALUES ($1, $2, 14.90, NULL, FALSE, FALSE)`,
        [ids.trattoria, ids.dolci]
      );
    }
    return ids;
  }

  const get = async (c: any, id: string) => (await c.query('SELECT * FROM offers WHERE id = $1', [id])).rows[0];

  it('liga o Dolci por R$ 5,00 nos quatro livros e o cartão com acréscimo, sem mudar o preço dos livros', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const ids = await fixtures(c);
      await c.query(sql);
      for (const b of ['trattoria', 'paes', 'antipasti', 'risotos']) {
        const bumps = await c.query('SELECT * FROM offer_bumps WHERE offer_id = $1', [ids[b]]);
        expect(bumps.rows).toHaveLength(1);
        expect(bumps.rows[0].bump_offer_id).toBe(ids.dolci);
        expect(Number(bumps.rows[0].bump_price)).toBe(5);
        expect(bumps.rows[0].is_active).toBe(true);
        expect(bumps.rows[0].headline).toBe('Leve mais um livro de sobremesa por apenas R$ 5,00 comprando os dois.');
        const o = await get(c, ids[b]);
        expect(Number(o.price)).toBe(19.9);
        expect(o.promotional_price).toBeNull();
        expect(o.card_enabled).toBe(true);
        expect(o.card_max_installments).toBe(10);
        expect(o.card_free_installments).toBe(1);
        expect(Number(o.card_interest_monthly)).toBe(2.99);
        expect(o.card_total_price).toBeNull();
      }
      const dolci = await get(c, ids.dolci);
      expect(Number(dolci.price)).toBe(14.9);
      // roda de novo sem duplicar
      await c.query(sql);
      const all = await c.query('SELECT count(*)::int AS n FROM offer_bumps WHERE bump_offer_id = $1', [ids.dolci]);
      expect(all.rows[0].n).toBe(4);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  it('kit de 5 por R$ 29,90, saídas pausadas, Kit Cozinha Italiana por R$ 24,90 e +4 livros por R$ 9,90', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const ids = await fixtures(c);
      await c.query(sql);
      const kit = await get(c, ids.kit);
      expect(Number(kit.price)).toBe(94.5);
      expect(Number(kit.promotional_price)).toBe(29.9);
      expect(kit.card_free_installments).toBe(1);
      expect(kit.card_total_price).toBeNull();
      expect((await get(c, ids.exit49)).status).toBe('PAUSADA');
      expect((await get(c, ids.exit39)).status).toBe('PAUSADA');
      const combo = await get(c, ids.combo);
      expect(Number(combo.price)).toBe(34.8);
      expect(Number(combo.promotional_price)).toBe(24.9);
      expect(combo.card_total_price).toBeNull();
      const post = await get(c, ids.post);
      expect(Number(post.price)).toBe(9.9);
      expect(post.status).toBe('ATIVA');
      const audit = await c.query(
        `SELECT event_type FROM audit_logs WHERE created_at = now() AND description LIKE 'Migration 068%' ORDER BY event_type`
      );
      const types = audit.rows.map((r: any) => r.event_type);
      expect(types.filter((t: string) => t === 'BOOK_DOLCI_COMBO_SET')).toHaveLength(4);
      expect(types.filter((t: string) => t === 'EXIT_OFFER_PAUSED')).toHaveLength(2);
      expect(types).toContain('KIT_PRICE_CHANGED');
      expect(types).toContain('POST_PURCHASE_PRICE_CHANGED');
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  it('sem o Dolci não liga adicional, mas o resto continua e registra o motivo', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const ids = await fixtures(c, { dolci: false });
      await c.query(sql);
      const bumps = await c.query('SELECT count(*)::int AS n FROM offer_bumps WHERE offer_id = ANY($1::uuid[])', [[ids.trattoria, ids.paes, ids.antipasti, ids.risotos]]);
      expect(bumps.rows[0].n).toBe(0);
      expect(Number((await get(c, ids.kit)).promotional_price)).toBe(29.9);
      const a = await c.query(`SELECT 1 FROM audit_logs WHERE event_type = 'BOOK_DOLCI_COMBO_SKIPPED' AND created_at = now() LIMIT 1`);
      expect(a.rows.length).toBe(1);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });
});
