// NORQVA-0069: a oferta pública informa a oferta de saída (só se estiver ativa). Sem serviços externos.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';

describe.sequential('NORQVA-0069 — oferta de saída na oferta pública', () => {
  let pool: Pool;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const prd = crypto.randomUUID();
  const kit = crypto.randomUUID();
  const e1 = crypto.randomUUID();
  const e2 = crypto.randomUUID();
  const hKit = `OFF-T69K${tag}`;
  const hE1 = `OFF-T69A${tag}`;
  const hE2 = `OFF-T69B${tag}`;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance) VALUES ($1, $2, 'Kit 0069', 'Receitas', 'x', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
      [prd, `PRD-T69${tag}`]
    );
    const ins = (id: string, h: string, price: number, status: string, exitId: string | null) =>
      pool.query(
        `INSERT INTO offers (id, human_id, product_id, name, price, description, status, exit_offer_id) VALUES ($1, $2, $3, $4, $5, 'x', $6, $7)`,
        [id, h, prd, `Oferta ${h}`, price, status, exitId]
      );
    await ins(e2, hE2, 39.9, 'ATIVA', null);
    await ins(e1, hE1, 49.9, 'ATIVA', e2);
    await ins(kit, hKit, 79.92, 'ATIVA', e1);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('UPDATE offers SET exit_offer_id = NULL WHERE product_id = $1', [prd]).catch(() => {});
    await pool.query('DELETE FROM offers WHERE product_id = $1', [prd]).catch(() => {});
    await pool.query('DELETE FROM products WHERE id = $1', [prd]).catch(() => {});
  });

  it('informa a oferta de saída em cadeia: kit → 49,90 → 39,90 → nenhuma', async () => {
    const a = await request(app).get(`/api/public/offers/${hKit}`);
    expect(a.status).toBe(200);
    expect(a.body.exit_offer).toEqual({ human_id: hE1 });
    const b = await request(app).get(`/api/public/offers/${hE1}`);
    expect(b.body.price).toBe(49.9);
    expect(b.body.exit_offer).toEqual({ human_id: hE2 });
    const c = await request(app).get(`/api/public/offers/${hE2}`);
    expect(c.body.exit_offer).toBeNull();
  });

  it('oferta de saída pausada deixa de ser informada', async () => {
    await pool.query(`UPDATE offers SET status = 'PAUSADA' WHERE id = $1`, [e1]);
    const a = await request(app).get(`/api/public/offers/${hKit}`);
    expect(a.body.exit_offer).toBeNull();
    await pool.query(`UPDATE offers SET status = 'ATIVA' WHERE id = $1`, [e1]);
  });
});
