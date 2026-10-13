// NORQVA-0061: Volumes III, IV e V à venda separadamente.
// - A migration 062 cria os 3 livros em RASCUNHO, a R$ 19,90, com o cartão da OFF-000001 (bloco DO: só no PostgreSQL do CI).
// - A página da oferta recebe a chave do livro; a página do kit lista só os livros com oferta ATIVA.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import app from '../index';
import { initializeDB, isDbInMemory } from '../db/db';
import { runMigrations } from '../db/migrations';
import { bookKeyForProductName, bookKeyForProduct } from '../services/catalog/collectionBooks';

const SQL = fs.readFileSync(path.join(__dirname, '../db/migrations/062_collection_books.sql'), 'utf8');

describe('NORQVA-0061 — chave do livro', () => {
  it('reconhece os três livros pelo nome do produto', () => {
    expect(bookKeyForProductName('Pães & Fermentação Natural')).toBe('paes');
    expect(bookKeyForProductName('  antipasti & aperitivo ')).toBe('antipasti');
    expect(bookKeyForProductName('Risotos & Polentas')).toBe('risotos');
    expect(bookKeyForProductName('Trattoria em Casa')).toBeNull();
    expect(bookKeyForProductName(null)).toBeNull();
    // nome editado na tela: vale a chave fixa
    expect(bookKeyForProduct({ collection_key: 'risotos', name: 'Risotos do Norte' })).toBe('risotos');
    expect(bookKeyForProduct({ collection_key: null, name: 'Antipasti & Aperitivo' })).toBe('antipasti');
  });
});

describe.sequential('NORQVA-0061 — página da oferta e página do kit', () => {
  let pool: Pool;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const prd = crypto.randomUUID();
  const offA = crypto.randomUUID();
  const offB = crypto.randomUUID();

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance) VALUES ($1, $2, 'Pães & Fermentação Natural', 'Receitas', 'x', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
      [prd, `PRD-P61${tag}`]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo, data_provenance) VALUES ($1, $2, 'Pães', $3, 19.90, 'TESTE', 'x', false, 'COMMERCIAL_PRODUCTION')`,
      [offA, `OFF-P61${tag}`, prd]
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM offers WHERE id = ANY($1::uuid[])', [[offA, offB]]).catch(() => {});
    await pool.query('DELETE FROM products WHERE id = $1', [prd]).catch(() => {});
  });

  it('a oferta pública traz a chave do livro', async () => {
    const r = await request(app).get(`/api/public/offers/OFF-P61${tag}`);
    expect(r.status).toBe(200);
    expect(r.body.book).toBe('paes');
  });

  it('o kit lista o livro só com a oferta ATIVA', async () => {
    const before = await request(app).get('/api/public/collection');
    expect(before.status).toBe(200);
    expect(before.body.books.map((b: any) => b.human_id)).not.toContain(`OFF-P61${tag}`);
    await pool.query(`UPDATE offers SET status = 'ATIVA' WHERE id = $1`, [offA]);
    const after = await request(app).get('/api/public/collection');
    const paes = after.body.books.find((b: any) => b.book === 'paes');
    expect(paes).toBeTruthy();
    expect(paes.price).toBe(19.9);
    // sem dados internos
    expect(Object.keys(paes).sort()).toEqual(['book', 'human_id', 'price']);
  });

  it('oferta na lixeira sai da lista do kit', async () => {
    await pool.query(`UPDATE offers SET is_deleted = TRUE WHERE id = $1`, [offA]);
    const r = await request(app).get('/api/public/collection');
    expect(r.body.books.map((b: any) => b.human_id)).not.toContain(`OFF-P61${tag}`);
    await pool.query(`UPDATE offers SET is_deleted = FALSE, status = 'PAUSADA' WHERE id = $1`, [offA]);
  });
});

describe.skipIf(!process.env.DATABASE_URL_TEST || isDbInMemory())('NORQVA-0061 — migration 062', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
  });

  const tag = crypto.randomUUID().slice(0, 8).toUpperCase();
  const trHuman = `OFF-T${tag}`;
  const names = { paes: `Pães ${tag}`, antipasti: `Antipasti ${tag}`, risotos: `Risotos ${tag}` };
  // Mesmo bloco, com nomes únicos para não depender do que já existe no banco de teste
  const sql = SQL.split("'OFF-000001'").join(`'${trHuman}'`)
    .split("'Pães & Fermentação Natural'").join(`'${names.paes}'`)
    .split("'Antipasti & Aperitivo'").join(`'${names.antipasti}'`)
    .split("'Risotos & Polentas'").join(`'${names.risotos}'`);

  async function trattoria(c: any, over: { price?: number; promo?: number | null; card?: boolean } = {}) {
    const prod = crypto.randomUUID();
    await c.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance) VALUES ($1, $2, 'Trattoria', 'Receitas', 'x', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
      [prod, `PRD-T${tag}`]
    );
    await c.query(
      `INSERT INTO offers (human_id, name, product_id, price, promotional_price, status, description, is_demo,
                           card_enabled, card_max_installments, card_total_price, card_free_installments, card_interest_monthly)
       VALUES ($1, 'Trattoria em Casa', $2, $3, $4, 'ATIVA', 'x', false, $5, 4, 19.92, 4, 0)`,
      [trHuman, prod, over.price ?? 19.9, over.promo ?? null, over.card ?? true]
    );
  }

  const created = (c: any) =>
    c.query(
      `SELECT p.name, p.status AS pstatus, p.origin_provenance, o.price, o.promotional_price, o.status, o.card_enabled,
              o.card_max_installments, o.card_total_price, o.card_free_installments, o.data_provenance
       FROM products p JOIN offers o ON o.product_id = p.id
       WHERE p.name = ANY($1::text[]) ORDER BY p.name`,
      [Object.values(names)]
    );

  it('cria os três livros em RASCUNHO a R$ 19,90, com o cartão do Trattoria, e não duplica', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await trattoria(c);
      await c.query(sql);
      const rows = (await created(c)).rows;
      expect(rows).toHaveLength(3);
      for (const r of rows) {
        expect(r.status).toBe('RASCUNHO');
        expect(r.pstatus).toBe('PLANEJADO');
        expect(r.origin_provenance).toBe('ORIGINAL');
        expect(Number(r.price)).toBe(19.9);
        expect(r.promotional_price).toBeNull();
        expect(r.data_provenance).toBe('COMMERCIAL_PRODUCTION');
        expect(r.card_enabled).toBe(true);
        expect(r.card_max_installments).toBe(4);
        expect(Number(r.card_total_price)).toBe(19.92);
      }
      const keys = await c.query(`SELECT collection_key FROM products WHERE name = ANY($1::text[]) ORDER BY collection_key`, [Object.values(names)]);
      expect(keys.rows.map((r: any) => r.collection_key)).toEqual(['antipasti', 'paes', 'risotos']);
      // nenhum PDF ligado: rascunho sem entrega
      const assets = await c.query(
        `SELECT count(*)::int AS n FROM offer_digital_assets oda JOIN offers o ON o.id = oda.offer_id JOIN products p ON p.id = o.product_id WHERE p.name = ANY($1::text[])`,
        [Object.values(names)]
      );
      expect(assets.rows[0].n).toBe(0);
      await c.query(sql);
      expect((await created(c)).rows).toHaveLength(3);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  it('Trattoria com outro preço: livros só no Pix', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await trattoria(c, { price: 24.9 });
      await c.query(sql);
      const rows = (await created(c)).rows;
      expect(rows).toHaveLength(3);
      for (const r of rows) {
        expect(r.card_enabled).toBe(false);
        expect(r.card_max_installments).toBe(1);
      }
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  it('sem a OFF-000001 não cria nada e registra o motivo', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(sql);
      expect((await created(c)).rows).toHaveLength(0);
      const a = await c.query(`SELECT 1 FROM audit_logs WHERE event_type = 'COLLECTION_BOOKS_SKIPPED' AND description LIKE '%OFF-000001%' AND created_at = now() LIMIT 1`);
      expect(a.rows.length).toBe(1);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });
});
