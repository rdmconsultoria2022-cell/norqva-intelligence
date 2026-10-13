// NORQVA-0058: mecanismo editável e lixeira de criativos (todas as versões). Sem serviços externos.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';

describe.sequential('NORQVA-0058 — editar e excluir criativos', () => {
  let pool: Pool;
  let admin: string;
  let creativeRole: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const productId = crypto.randomUUID();
  const key = `T58${tag}`;
  let c1 = '';
  let c2 = '';
  const post = (url: string, body: any, token = admin) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body);

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const u = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, $2, 'U 0058', $3, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $3, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [crypto.randomUUID(), email, role]
      );
      return signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role });
    };
    admin = await mk('admin.norqva0058@norqva.test', 'ADMIN');
    creativeRole = await mk('creative.norqva0058@norqva.test', 'CREATIVE');
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance) VALUES ($1, $2, 'Livro 0058', 'Receitas', 'x', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
      [productId, `PRD-${key}`]
    );
    const r = await pool.query(
      `INSERT INTO creatives (human_id, product_id, hook, concept, copy, primary_text, headline, cta, format, status, is_demo, utm_content_key, approval_status, mechanism)
       VALUES ($1, $2, 'Gancho', 'c', 'Texto', 'Texto', 'Título', 'Ver detalhes', 'VIDEO', 'IDEIA', FALSE, $1, 'DRAFT', 'Mecanismo') RETURNING id`,
      [key, productId]
    );
    c1 = r.rows[0].id;
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM launch_plans WHERE code = $1', [`T58-${tag}`]).catch(() => {});
    await pool.query('DELETE FROM creative_claims WHERE creative_id IN (SELECT id FROM creatives WHERE product_id = $1)', [productId]).catch(() => {});
    await pool.query('DELETE FROM creative_reviews WHERE creative_id IN (SELECT id FROM creatives WHERE product_id = $1)', [productId]).catch(() => {});
    await pool.query('UPDATE creatives SET parent_creative_id = NULL, root_creative_id = NULL WHERE product_id = $1', [productId]).catch(() => {});
    await pool.query('DELETE FROM creatives WHERE product_id = $1', [productId]).catch(() => {});
    await pool.query('DELETE FROM products WHERE id = $1', [productId]).catch(() => {});
  });

  it('rascunho nunca revisado: gancho, mecanismo e roteiro editados no lugar', async () => {
    const r = await post(`/api/creative-factory/creatives/${c1}/revise?mode=real`, { hook: 'Gancho novo', mechanism: 'Passo a passo com foto', script: 'Cena 1' }, creativeRole);
    expect(r.status).toBe(200);
    expect(r.body.mode).toBe('EDITED_IN_PLACE');
    const row = (await pool.query('SELECT hook, mechanism, script FROM creatives WHERE id = $1', [c1])).rows[0];
    expect(row).toMatchObject({ hook: 'Gancho novo', mechanism: 'Passo a passo com foto', script: 'Cena 1' });
  });

  it('revisado: mudar só o mecanismo cria nova versão', async () => {
    await pool.query(`INSERT INTO creative_reviews (creative_id, content_hash, decision, is_demo) VALUES ($1, 'x', 'REVISION_REQUESTED', FALSE)`, [c1]);
    const r = await post(`/api/creative-factory/creatives/${c1}/revise?mode=real`, { mechanism: 'Outro mecanismo' });
    expect(r.status).toBe(200);
    expect(r.body.mode).toBe('NEW_VERSION');
    c2 = r.body.creative.id;
    const row = (await pool.query('SELECT mechanism, root_creative_id FROM creatives WHERE id = $1', [c2])).rows[0];
    expect(row.mechanism).toBe('Outro mecanismo');
    expect(row.root_creative_id).toBe(c1);
  });

  it('excluir: só ADMIN, com o código; campanha que usa o criativo bloqueia', async () => {
    const hid2 = (await pool.query('SELECT human_id FROM creatives WHERE id = $1', [c2])).rows[0].human_id;
    expect((await post(`/api/creative-factory/creatives/${c2}/delete?mode=real`, { confirm_code: hid2 }, creativeRole)).status).toBe(403);
    expect((await post(`/api/creative-factory/creatives/${c2}/delete?mode=real`, { confirm_code: 'X' })).status).toBe(400);
    await pool.query(
      `INSERT INTO launch_plans (id, code, offer_human_id, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text, ad_creatives)
       VALUES (gen_random_uuid(), $1, 'OFF-000001', 'ACTIVE', $2, '{}', 20, 140, 'q', $3)`,
      [`T58-${tag}`, JSON.stringify({ ads: [{ name: 'OUTRO' }] }), JSON.stringify({ '0': c2 })]
    );
    const blocked = await post(`/api/creative-factory/creatives/${c2}/delete?mode=real`, { confirm_code: hid2 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toContain(`T58-${tag}`);
    await pool.query(`UPDATE launch_plans SET status = 'REJECTED' WHERE code = $1`, [`T58-${tag}`]);
  });

  it('exclui todas as versões, some da lista, aparece na lixeira e volta no Restaurar', async () => {
    const hid2 = (await pool.query('SELECT human_id FROM creatives WHERE id = $1', [c2])).rows[0].human_id;
    const r = await post(`/api/creative-factory/creatives/${c2}/delete?mode=real`, { confirm_code: hid2 });
    expect(r.status).toBe(200);
    expect(r.body.versions).toBe(2);
    const list = await request(app).get('/api/creative-factory/creatives?mode=real').set('Authorization', `Bearer ${admin}`);
    expect(list.body.creatives.map((c: any) => c.id)).not.toContain(c2);
    const trash = await request(app).get('/api/creative-factory/trash').set('Authorization', `Bearer ${admin}`);
    const item = trash.body.creatives.find((c: any) => c.id === c2 || c.id === c1);
    expect(item).toBeTruthy();
    expect(item.id).toBe(c2);
    const back = await post(`/api/creative-factory/creatives/${c2}/restore?mode=real`, { confirm_code: hid2 });
    expect(back.status).toBe(200);
    expect(back.body.versions).toBe(2);
    const rows = (await pool.query('SELECT is_deleted, approval_status FROM creatives WHERE id = ANY($1::uuid[]) ORDER BY version', [[c1, c2]])).rows;
    expect(rows.map((x: any) => x.is_deleted)).toEqual([false, false]);
    expect(rows[0].approval_status).toBe('SUPERSEDED');
    const audit = await pool.query(`SELECT event_type FROM audit_logs WHERE event_type IN ('CREATIVE_DELETED','CREATIVE_RESTORED') AND description LIKE $1`, [`%${hid2}%`]);
    expect(audit.rows.length).toBe(2);
  });
});
