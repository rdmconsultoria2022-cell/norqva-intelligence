// NORQVA-0160: vídeo com apresentadora pela Fábrica de Criativos. O motor é sempre simulado: nada sai para a internet.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { setVideoFactoryForTests, motorProduct, priceIssues, FetchLike, motorCall } from '../services/creative/videoFactoryClient';
import { ProductFacts } from '../services/creative/generationService';

type Call = { method: string; url: string; body: any; auth: string };

/** Motor simulado com uma produção em memória. */
function fakeMotor(opts: { falaComPreco?: boolean; down?: boolean } = {}) {
  const calls: Call[] = [];
  const prod: any = {
    id: 77, titulo: 'x', status: 'roteiro', duracao: 30, custo_estimado_usd: 2.4, alertas: [],
    cenas: [
      { id: 501, ordem: 1, fala: 'Olha só o que chegou aqui em casa', acao: 'andando', tentativas: [] },
      { id: 502, ordem: 2, fala: opts.falaComPreco ? 'E custa só R$ 19,90' : 'Tem receita de massa fresca', acao: 'mostra',
        tentativas: [{ id: 9001, status: 'pronta' }, { id: 9002, status: 'falhou' }] }
    ]
  };
  const fetch: FetchLike = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init?.method || 'GET', url, body, auth: init?.headers?.Authorization || '' });
    if (opts.down) throw new Error('ECONNREFUSED');
    const path = url.replace('https://motor.test/api/v1', '');
    const ok = (data: any) => ({ ok: true, status: 200, json: async () => data });
    if (path === '/personas') return ok([{ id: 1, nome: 'Dona Lena', voz: 'Alice', aparencia: 'x', imagem: 'https://motor.test/publico/a.jpg' }]);
    if (path === '/templates') return ok([{ id: 'selfie_caminhando', nome: 'Selfie', descricao: 'd', duracoes: [{ segundos: 30, cenas: 5 }] }]);
    if (path === '/status') return ok({ ok: true, orcamento_mensal_usd: 150, gasto_mes_usd: 12.5 });
    if (path === '/producoes' && init?.method === 'POST') return ok(prod);
    if (path === '/producoes/77' && (init?.method || 'GET') === 'GET') return ok(prod);
    if (path === '/producoes/77/roteiro') {
      for (const c of body.cenas) {
        const s = prod.cenas.find((x: any) => x.id === c.id);
        if (c.fala !== undefined) s.fala = c.fala;
      }
      return ok(prod);
    }
    if (path === '/producoes/77/aprovar') {
      prod.status = 'gerando';
      return ok(prod);
    }
    if (path === '/cenas/502/escolher') return ok(prod);
    if (path === '/cenas/501/regerar') return ok(prod);
    if (path === '/producoes/77/montar') {
      prod.status = 'montando';
      return ok(prod);
    }
    if (path === '/producoes/999') return { ok: false, status: 404, json: async () => ({ detail: 'produção não encontrada' }) };
    return { ok: false, status: 500, json: async () => ({}) };
  };
  return { fetch, calls, prod };
}

const facts = (over: Partial<ProductFacts['offer']> = {}): ProductFacts => ({
  product: { id: 'p', name: 'Trattoria em Casa', description: 'Livro de receitas italianas', category: 'Receitas', collection_key: null },
  offer: { id: 'o', human_id: 'OFF-000001', name: 'Trattoria', description: 'Livro digital', bonus: null, status: 'ATIVA', ...over },
  deliveryTitles: ['Trattoria em PDF'],
  claims: [{ id: 'c', human_id: 'CLM-1', text: 'Receitas com passo a passo', type: 'FEATURE' }]
});

describe('NORQVA-0160 — dados enviados ao motor', () => {
  it('produto sem preço, com a chave da oferta e as promessas aprovadas', () => {
    const p = motorProduct(facts({ description: 'De R$ 49,90 por R$ 19,90', bonus: 'Cardápio de 4 semanas' }));
    expect(p.ref_externa).toBe('norqva:offer:OFF-000001');
    expect(p.oferta).not.toMatch(/R\$/);
    expect(p.oferta).toContain('Bônus: Cardápio de 4 semanas');
    expect(p.alegacoes_permitidas).toBe('Receitas com passo a passo');
    expect(p.alegacoes_proibidas).toMatch(/Preço/);
    expect(p.descricao).toContain('Trattoria em PDF');
  });

  it('acha fala com preço no roteiro', () => {
    expect(priceIssues({ cenas: [{ id: 1, ordem: 1, fala: 'Só R$ 19,90 hoje' }, { id: 2, ordem: 2, fala: 'Receita boa' }] })).toEqual([
      { scene_id: 1, order: 1, match: expect.any(String) }
    ]);
  });

  it('sem simulação, em teste, nunca chama o motor', async () => {
    setVideoFactoryForTests(null);
    await expect(motorCall('GET', '/status')).rejects.toMatchObject({ status: 503 });
  });
});

describe('NORQVA-0160 — rotas', () => {
  let pool: Pool;
  let admin: string;
  let creative: string;
  let performance: string;
  const tag = crypto.randomUUID().slice(0, 6);
  const productId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const otherProductId = crypto.randomUUID();
  const otherOfferId = crypto.randomUUID();

  const as = (token: string) => ({
    get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${token}`),
    post: (u: string, b: any = {}) => request(app).post(u).set('Authorization', `Bearer ${token}`).send(b),
    put: (u: string, b: any = {}) => request(app).put(u).set('Authorization', `Bearer ${token}`).send(b)
  });

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const u = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, $2, 'U 0160', $3, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $3, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [crypto.randomUUID(), email, role]
      );
      return signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role });
    };
    admin = await mk('admin.norqva0160@norqva.test', 'ADMIN');
    creative = await mk('creative.norqva0160@norqva.test', 'CREATIVE');
    performance = await mk('perf.norqva0160@norqva.test', 'PERFORMANCE');
    for (const [pid, oid, n] of [[productId, offerId, 'A'], [otherProductId, otherOfferId, 'B']]) {
      await pool.query(
        `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance)
         VALUES ($1, $2, $3, 'Receitas', 'Receitas italianas', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
        [pid, `PRD-T160${n}${tag}`, `Livro 0160 ${n}`]
      );
      await pool.query(
        `INSERT INTO offers (id, human_id, product_id, name, price, description, status, is_demo, data_provenance)
         VALUES ($1, $2, $3, $4, 19.90, 'Livro digital', 'ATIVA', false, 'COMMERCIAL_PRODUCTION')`,
        [oid, `OFF-T160${n}${tag}`, pid, `Livro 0160 ${n}`]
      );
    }
    process.env.VIDEO_FACTORY_ENABLED = 'true';
  });

  afterEach(() => setVideoFactoryForTests(null));

  afterAll(async () => {
    delete process.env.VIDEO_FACTORY_ENABLED;
  });

  const create = (token = creative) =>
    as(token).post('/api/video-factory/productions', { product_id: productId, offer_id: offerId, persona_id: 1, duration_s: 30 });

  it('trava desligada: 404', async () => {
    delete process.env.VIDEO_FACTORY_ENABLED;
    expect((await as(admin).get('/api/video-factory/catalog')).status).toBe(404);
    process.env.VIDEO_FACTORY_ENABLED = 'true';
  });

  it('PERFORMANCE não entra', async () => {
    setVideoFactoryForTests({ fetch: fakeMotor().fetch });
    expect((await as(performance).get('/api/video-factory/catalog')).status).toBe(403);
  });

  it('catálogo: apresentadoras, modelos e orçamento, com a chave no cabeçalho', async () => {
    const m = fakeMotor();
    setVideoFactoryForTests({ fetch: m.fetch });
    const r = await as(creative).get('/api/video-factory/catalog');
    expect(r.status).toBe(200);
    expect(r.body.personas[0]).toMatchObject({ id: 1, name: 'Dona Lena' });
    expect(r.body.budget).toEqual({ monthly_usd: 150, spent_month_usd: 12.5 });
    expect(m.calls.every(c => c.auth === 'Bearer token-teste')).toBe(true);
  });

  it('motor fora do ar: 502 com mensagem simples', async () => {
    setVideoFactoryForTests({ fetch: fakeMotor({ down: true }).fetch });
    const r = await as(creative).get('/api/video-factory/catalog');
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/não respondeu/);
  });

  it('cria roteiro, guarda a ligação e registra na auditoria', async () => {
    const m = fakeMotor();
    setVideoFactoryForTests({ fetch: m.fetch });
    const r = await create();
    expect(r.status).toBe(201);
    expect(r.body.motor_production_id).toBe(77);
    expect(r.body.status).toBe('roteiro');
    const sent = m.calls.find(c => c.method === 'POST')!.body;
    expect(sent.produto.ref_externa).toBe(`norqva:offer:OFF-T160A${tag}`);
    expect(JSON.stringify(sent)).not.toMatch(/19[,.]90/);
    const list = await as(admin).get(`/api/video-factory/productions?product_id=${productId}`);
    expect(list.body.map((v: any) => v.id)).toContain(r.body.id);
    const audit = await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'VIDEO_PRODUCTION_CREATED' AND description LIKE $1`, [`%OFF-T160A${tag}%`]);
    expect(audit.rowCount).toBeGreaterThan(0);
    await pool.query('DELETE FROM video_productions WHERE motor_production_id = 77');
  });

  it('valida entrada: oferta de outro produto, duração e apresentadora', async () => {
    setVideoFactoryForTests({ fetch: fakeMotor().fetch });
    const bad = async (b: any) => (await as(creative).post('/api/video-factory/productions', { product_id: productId, offer_id: offerId, persona_id: 1, duration_s: 30, ...b })).status;
    expect(await bad({ offer_id: otherOfferId })).toBe(400);
    expect(await bad({ duration_s: 20 })).toBe(400);
    expect(await bad({ persona_id: 0 })).toBe(400);
    expect(await bad({ template_id: '../x' })).toBe(400);
  });

  it('roteiro: fala com preço é barrada; sem preço é salva', async () => {
    const m = fakeMotor();
    setVideoFactoryForTests({ fetch: m.fetch });
    const id = (await create()).body.id;
    const r1 = await as(creative).put(`/api/video-factory/productions/${id}/script`, { scenes: [{ id: 501, line: 'Por apenas R$ 9,90' }] });
    expect(r1.status).toBe(400);
    expect(r1.body.error).toMatch(/preço/);
    const r2 = await as(creative).put(`/api/video-factory/productions/${id}/script`, { scenes: [{ id: 501, line: 'Olha que lindo' }] });
    expect(r2.status).toBe(200);
    expect(m.prod.cenas[0].fala).toBe('Olha que lindo');
    await pool.query('DELETE FROM video_productions WHERE motor_production_id = 77');
  });

  it('aprovar gasto: só ADMIN; roteiro com preço não é aprovado', async () => {
    const m = fakeMotor({ falaComPreco: true });
    setVideoFactoryForTests({ fetch: m.fetch });
    const id = (await create()).body.id;
    expect((await create()).status).toBe(409); // mesma produção do motor não é ligada duas vezes
    expect((await as(creative).post(`/api/video-factory/productions/${id}/approve`)).status).toBe(403);
    const r = await as(admin).post(`/api/video-factory/productions/${id}/approve`);
    expect(r.status).toBe(400);
    expect(m.calls.some(c => c.url.endsWith('/aprovar'))).toBe(false);
    m.prod.cenas[1].fala = 'Tem receita de massa fresca';
    const ok = await as(admin).post(`/api/video-factory/productions/${id}/approve`, { extra: true });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('gerando');
    expect(m.calls.find(c => c.url.endsWith('/aprovar'))!.body).toEqual({ aprovacao_extra: true });
    const row = await pool.query('SELECT status, approved_at FROM video_productions WHERE id = $1', [id]);
    expect(row.rows[0].status).toBe('gerando');
    expect(row.rows[0].approved_at).not.toBeNull();
    await pool.query('DELETE FROM video_productions WHERE motor_production_id = 77');
  });

  it('cena e tomada têm que ser deste vídeo; gerar de novo só ADMIN', async () => {
    const m = fakeMotor();
    setVideoFactoryForTests({ fetch: m.fetch });
    const id = (await create()).body.id;
    expect((await as(creative).post(`/api/video-factory/productions/${id}/scenes/123/choose`, { take_id: 9001 })).status).toBe(404);
    expect((await as(creative).post(`/api/video-factory/productions/${id}/scenes/502/choose`, { take_id: 9002 })).status).toBe(400);
    expect((await as(creative).post(`/api/video-factory/productions/${id}/scenes/502/choose`, { take_id: 9001 })).status).toBe(200);
    expect((await as(creative).post(`/api/video-factory/productions/${id}/scenes/501/regenerate`)).status).toBe(403);
    expect((await as(admin).post(`/api/video-factory/productions/${id}/scenes/501/regenerate`, { new_line: 'R$ 5,00' })).status).toBe(400);
    expect((await as(admin).post(`/api/video-factory/productions/${id}/scenes/501/regenerate`, { new_line: 'Fala nova' })).status).toBe(200);
    expect(m.calls.find(c => c.url.endsWith('/cenas/501/regerar'))!.body).toEqual({ nova_fala: 'Fala nova' });
    await pool.query('DELETE FROM video_productions WHERE motor_production_id = 77');
  });

  it('montar: formato válido', async () => {
    const m = fakeMotor();
    setVideoFactoryForTests({ fetch: m.fetch });
    const id = (await create()).body.id;
    expect((await as(creative).post(`/api/video-factory/productions/${id}/assemble`, { format: '16:9' })).status).toBe(400);
    const r = await as(creative).post(`/api/video-factory/productions/${id}/assemble`, { format: '4:5' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('montando');
    await pool.query('DELETE FROM video_productions WHERE motor_production_id = 77');
  });

  it('id inexistente: 404', async () => {
    setVideoFactoryForTests({ fetch: fakeMotor().fetch });
    expect((await as(admin).get(`/api/video-factory/productions/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await as(admin).get('/api/video-factory/productions/abc')).status).toBe(404);
  });
});
