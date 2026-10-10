// NORQVA-0040: oferta à venda não perde o último PDF; com outro PDF ou pausada, pode remover.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';

describe.sequential('NORQVA-0040 — remover PDF de oferta à venda', () => {
  let pool: Pool;
  let token: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const product = crypto.randomUUID();
  const offer = crypto.randomUUID();
  const a1 = crypto.randomUUID();
  const a2 = crypto.randomUUID();

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const r = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.norqva0040@norqva.test', 'Admin 0040', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    token = signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role: 'ADMIN' });
    await pool.query(`INSERT INTO products (id, human_id, name, category, description, status, is_demo) VALUES ($1, $2, 'P 0040', 'Receitas', 'x', 'PLANEJADO', false)`, [product, `PRD-G${tag}`]);
    await pool.query(`INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, 'O 0040', $3, 19.9, 'ATIVA', 'x', false)`, [offer, `OFF-G${tag}`, product]);
    for (const a of [a1, a2]) {
      await pool.query(`INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo) VALUES ($1, $2, 'SUPABASE', 'digital-products', $3, false)`, [a, `a-${a}`, `books/${a}.pdf`]);
    }
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2), ($1, $3)', [offer, a1, a2]);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM offer_digital_assets WHERE offer_id = $1', [offer]).catch(() => {});
    await pool.query('DELETE FROM digital_assets WHERE id = ANY($1::uuid[])', [[a1, a2]]).catch(() => {});
  });

  const del = (asset: string) => request(app).delete(`/api/offers/${offer}/digital-assets/${asset}`).set('Authorization', `Bearer ${token}`);

  it('com dois PDFs, remove um', async () => {
    expect((await del(a2)).status).toBe(200);
  });

  it('não remove o último PDF de oferta ativa', async () => {
    const r = await del(a1);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/único arquivo/);
    const n = await pool.query('SELECT COUNT(*)::int AS n FROM offer_digital_assets WHERE offer_id = $1', [offer]);
    expect(n.rows[0].n).toBe(1);
  });

  it('pausada, pode remover', async () => {
    await pool.query("UPDATE offers SET status = 'PAUSADA' WHERE id = $1", [offer]);
    expect((await del(a1)).status).toBe(200);
  });
});
