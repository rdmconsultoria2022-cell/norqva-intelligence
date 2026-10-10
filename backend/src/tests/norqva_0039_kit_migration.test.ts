// NORQVA-0039: a migration 050 cria o kit só no cenário exato e fica fora do ar (RASCUNHO).
// Roda o bloco da migration de verdade no PostgreSQL do CI, dentro de uma transação desfeita no fim.
// No emulador pg-mem (sem PostgreSQL) o bloco DO não existe, então o teste é pulado.
import { describe, it, expect, beforeAll } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { initializeDB, isDbInMemory } from '../db/db';
import { runMigrations } from '../db/migrations';

const SQL = fs.readFileSync(path.join(__dirname, '../db/migrations/051_create_kit_by_product.sql'), 'utf8');

describe.skipIf(!process.env.DATABASE_URL_TEST || isDbInMemory())('NORQVA-0039 — migration do kit', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
  });

  const tag = crypto.randomUUID().slice(0, 8).toUpperCase();
  const trHuman = `OFF-T${tag}`;
  const doName = `Dolci della Nonna ${tag}`;
  const kitName = `Kit Cozinha Italiana ${tag}`;
  // Mesmo bloco, com nomes únicos para não depender do que já existe no banco de teste
  const sql = SQL.split("'PRD-000003'").join(`'PRD-T${tag}'`)
    .split("'PRD-000006'").join(`'PRD-D${tag}'`)
    .split("'Kit Cozinha Italiana'").join(`'${kitName}'`);

  async function fixtures(c: any, opts: { secondTrAsset?: boolean } = {}) {
    const prod = crypto.randomUUID();
    await c.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance) VALUES ($1, $2, 'Trattoria', 'Receitas', 'x', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
      [prod, `PRD-T${tag}`]
    );
    const tr = crypto.randomUUID();
    const dol = crypto.randomUUID();
    await c.query(`INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, 'Trattoria em Casa', $3, 19.90, 'ATIVA', 'x', false)`, [tr, trHuman, prod]);
    const prodD = crypto.randomUUID();
    await c.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance) VALUES ($1, $2, 'Dolci', 'Receitas', 'x', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
      [prodD, `PRD-D${tag}`]
    );
    await c.query(`INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, $3, $4, 14.90, 'ATIVA', 'x', false)`, [dol, `OFF-D${tag}`, doName, prodD]);
    const assets = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    for (const a of assets) {
      await c.query(`INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo) VALUES ($1, $2, 'SUPABASE', 'digital-products', $3, false)`, [a, `kit-${a}`, `books/${a}.pdf`]);
    }
    await c.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [tr, assets[0]]);
    await c.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [dol, assets[1]]);
    if (opts.secondTrAsset) await c.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [tr, assets[2]]);
    return { trAsset: assets[0], doAsset: assets[1] };
  }

  it('cria produto e oferta em RASCUNHO, com cartão 4x e os dois PDFs', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const { trAsset, doAsset } = await fixtures(c);
      await c.query(sql);
      const off = (await c.query(
        `SELECT o.*, p.category, p.data_provenance AS p_prov FROM offers o JOIN products p ON p.id = o.product_id WHERE p.name = $1`,
        [kitName]
      )).rows;
      expect(off).toHaveLength(1);
      expect(off[0]).toMatchObject({ status: 'RASCUNHO', is_demo: false, card_enabled: true, card_max_installments: 4, category: 'Receitas', data_provenance: 'COMMERCIAL_PRODUCTION', p_prov: 'COMMERCIAL_PRODUCTION' });
      expect(Number(off[0].price)).toBe(34.8);
      expect(Number(off[0].promotional_price)).toBe(27.9);
      expect(Number(off[0].card_total_price)).toBe(27.96);
      expect(off[0].human_id).toMatch(/^OFF-\d{6}$/);
      const links = (await c.query('SELECT asset_id FROM offer_digital_assets WHERE offer_id = $1', [off[0].id])).rows.map((r: any) => r.asset_id).sort();
      expect(links).toEqual([trAsset, doAsset].sort());
      // Rodar de novo não cria outro kit
      await c.query(sql);
      expect((await c.query('SELECT count(*)::int AS n FROM products WHERE name = $1', [kitName])).rows[0].n).toBe(1);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  it('com mais de um PDF no Trattoria, não cria nada e registra o motivo', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await fixtures(c, { secondTrAsset: true });
      await c.query(sql);
      expect((await c.query('SELECT count(*)::int AS n FROM products WHERE name = $1', [kitName])).rows[0].n).toBe(0);
      const log = await c.query("SELECT count(*)::int AS n FROM audit_logs WHERE event_type = 'KIT_CREATE_SKIPPED' AND description LIKE '%PDFs ligados ao Trattoria: 2%'");
      expect(log.rows[0].n).toBeGreaterThan(0);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });
});
