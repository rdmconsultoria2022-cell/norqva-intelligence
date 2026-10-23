// NORQVA-0115: Referências (só a estrutura). Rede, DNS e IA sempre simulados: nada sai para a internet.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import {
  htmlToBlocks,
  shingleHashes,
  shingleHash,
  normalizeWords,
  assertSafeUrl,
  isPrivateAddress,
  fetchPage,
  setPageFetchForTests,
  setReferenceAiForTests,
  buildFingerprint,
  sanitizeStructure,
  extractStructure,
  heuristicStructure,
  validateSalesStructure,
  validateAdStructure,
  ROLE_PURPOSE,
  CreativeReferenceError,
  PageTransport,
  SalesStructure
} from '../services/creative/referenceService';

const SECRET = 'Minha avó Lucia guardava este caderno secreto de massas frescas na cozinha de Bolonha e agora ele chegou até você.';

const FIXTURE = `<!doctype html><html><head><title>Caderno da Nonna</title><style>.x{color:red}</style>
<script>var segredo = "texto do script nao deve aparecer";</script></head>
<body>
<nav><a href="/">Início</a><a href="/blog">Blog do menu principal</a></nav>
<header><h1>Você ainda erra o ponto da massa fresca?</h1>
<p>${SECRET}</p>
<a class="btn btn-primary" href="#oferta">Quero o caderno agora</a></header>
<img src="/capa.jpg" width="600" height="400" alt="Capa">
<img src="https://www.facebook.com/tr?id=1" width="1" height="1">
<iframe src="https://www.youtube.com/embed/abc123"></iframe>
<h2>O que você vai receber</h2>
<ul><li>Vinte e oito receitas com foto de cada etapa</li><li>Guia de farinhas e ovos</li><li>Tabela de tempos de cozimento</li></ul>
<h2>Depoimentos</h2>
<div class="depoimentos"><p>Fiz o ravioli no domingo e a família inteira pediu bis, nunca pensei que conseguiria em casa.</p></div>
<h2>B&ocirc;nus exclusivos</h2><p>Você também recebe um guia de molhos clássicos para acompanhar.</p>
<h2>Oferta especial</h2><p>De R$ 97,00 por apenas R$ 19,90 à vista ou em 4x no cartão.</p>
<form action="/checkout"><label>Seu e-mail</label><input type="email" name="email"><input type="submit" value="Comprar agora"></form>
<h2>Garantia de 7 dias</h2><p>Se não gostar, devolvemos todo o seu dinheiro sem complicação.</p>
<h2>Perguntas frequentes</h2>
<h3>Como recebo o material?</h3><p>Você recebe o acesso no seu e-mail logo depois do pagamento.</p>
<h3>Serve para iniciantes?</h3><p>Sim, todas as receitas explicam cada etapa com calma.</p>
<footer><p>Rodapé com CNPJ e termos de uso da empresa</p></footer>
</body></html>`;

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const publicDns = async (host: string) => {
  if (host === 'interno.test') return ['192.168.0.10'];
  if (host === 'metadados.test') return ['169.254.169.254'];
  if (host === 'v6interno.test') return ['::1'];
  return ['93.184.216.34'];
};

function pages(map: Record<string, { status?: number; location?: string; html?: string; contentType?: string }>) {
  const calls: string[] = [];
  const t: PageTransport = async url => {
    calls.push(url.toString());
    const p = map[url.toString()];
    if (!p) return { status: 404, location: null, contentType: 'text/html', body: Buffer.from('não achou') };
    return {
      status: p.status ?? 200,
      location: p.location ?? null,
      contentType: p.contentType ?? 'text/html; charset=utf-8',
      body: Buffer.from(p.html ?? '', 'utf8')
    };
  };
  return { t, calls };
}

afterEach(() => {
  setPageFetchForTests(null, null);
  setReferenceAiForTests(null);
});

describe('NORQVA-0115 — leitura da página em blocos', () => {
  it('tira script, estilo, menu e rodapé e reconhece cada tipo de bloco', () => {
    const blocks = htmlToBlocks(FIXTURE);
    const all = blocks.map(b => b.text).join(' ');
    expect(all).not.toContain('script nao deve');
    expect(all).not.toContain('color:red');
    expect(all).not.toContain('Blog do menu');
    expect(all).not.toContain('Rodapé com CNPJ');
    expect(all).not.toContain('Seu e-mail');
    const kinds = blocks.map(b => b.kind);
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1 });
    expect(kinds).toContain('paragraph');
    expect(kinds).toContain('button');
    expect(kinds).toContain('video');
    expect(kinds).toContain('form');
    expect(kinds.filter(k => k === 'image')).toHaveLength(1); // o pixel 1x1 não conta
    const list = blocks.find(b => b.kind === 'list');
    expect(list?.items).toBe(3);
    expect(blocks.find(b => b.kind === 'testimonial-like')?.text).toContain('ravioli');
    expect(blocks.filter(b => b.kind === 'faq-like').length).toBeGreaterThanOrEqual(2);
    expect(blocks.some(b => b.kind === 'button' && b.text === 'Comprar agora')).toBe(true);
    expect(blocks.some(b => b.kind === 'heading' && b.text === 'Bônus exclusivos')).toBe(true);
    const p = blocks.find(b => b.text.startsWith('Minha avó'));
    expect(p?.wordCount).toBe(20);
  });

  it('é determinística', () => {
    expect(JSON.stringify(htmlToBlocks(FIXTURE))).toBe(JSON.stringify(htmlToBlocks(FIXTURE)));
  });
});

describe('NORQVA-0115 — impressões de 6 palavras', () => {
  it('normaliza acentos, maiúsculas e pontuação antes do hash', () => {
    expect(normalizeWords('Olá, MUNDO! Ação—já')).toEqual(['ola', 'mundo', 'acao', 'ja']);
    const a = shingleHashes('Olá, Mundo! um dois três quatro');
    const b = shingleHashes('ola mundo um dois tres quatro');
    expect(a).toEqual(b);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatch(/^[0-9a-f]{16}$/);
    expect(a[0]).toBe(shingleHash('ola mundo um dois tres quatro'));
  });

  it('uma por janela; menos de 6 palavras não gera nenhuma', () => {
    expect(shingleHashes('um dois três quatro cinco')).toEqual([]);
    expect(shingleHashes('a b c d e f g h')).toHaveLength(3);
  });
});

describe('NORQVA-0115 — proteção contra SSRF', () => {
  it('recusa esquema, porta, usuário e endereços internos', () => {
    const bad = [
      'ftp://exemplo.com/x',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'http://localhost/admin',
      'http://app.localhost/',
      'http://127.0.0.1/',
      'http://2130706433/',
      'http://10.1.2.3/',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/',
      'http://[::ffff:127.0.0.1]/',
      'https://exemplo.com:8443/',
      'https://user:senha@exemplo.com/',
      'http://intranet/'
    ];
    for (const u of bad) {
      expect(() => assertSafeUrl(u), u).toThrow(CreativeReferenceError);
    }
    expect(assertSafeUrl('https://exemplo.com/pagina?x=1').hostname).toBe('exemplo.com');
    expect(assertSafeUrl('http://exemplo.com:80/').hostname).toBe('exemplo.com');
  });

  it('classifica IPs', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2001:4860:4860::8888')).toBe(false);
    for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.5.4', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:7f00:1', 'lixo']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('nome que resolve para IP interno é recusado antes de qualquer pedido', async () => {
    const { t, calls } = pages({});
    setPageFetchForTests(t, publicDns);
    await expect(fetchPage('https://interno.test/x')).rejects.toMatchObject({ status: 400, kind: 'INPUT' });
    await expect(fetchPage('http://metadados.test/')).rejects.toMatchObject({ status: 400 });
    await expect(fetchPage('http://v6interno.test/')).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('redirecionamento para endereço interno é recusado', async () => {
    const { t, calls } = pages({
      'https://concorrente.test/a': { status: 302, location: 'https://interno.test/painel' },
      'https://concorrente.test/b': { status: 301, location: 'http://127.0.0.1:80/' }
    });
    setPageFetchForTests(t, publicDns);
    await expect(fetchPage('https://concorrente.test/a')).rejects.toMatchObject({ status: 400, kind: 'INPUT' });
    await expect(fetchPage('https://concorrente.test/b')).rejects.toMatchObject({ status: 400, kind: 'INPUT' });
    expect(calls).toEqual(['https://concorrente.test/a', 'https://concorrente.test/b']);
  });

  it('segue até 3 redirecionamentos e para no quarto', async () => {
    const { t } = pages({
      'https://c.test/1': { status: 302, location: '/2' },
      'https://c.test/2': { status: 302, location: '/3' },
      'https://c.test/3': { status: 302, location: '/4' },
      'https://c.test/4': { html: '<p>ok</p>' },
      'https://d.test/1': { status: 302, location: '/2' },
      'https://d.test/2': { status: 302, location: '/3' },
      'https://d.test/3': { status: 302, location: '/4' },
      'https://d.test/4': { status: 302, location: '/5' },
      'https://d.test/5': { html: '<p>longe demais</p>' }
    });
    setPageFetchForTests(t, publicDns);
    const ok = await fetchPage('https://c.test/1');
    expect(ok.html).toBe('<p>ok</p>');
    expect(ok.finalUrl.toString()).toBe('https://c.test/4');
    await expect(fetchPage('https://d.test/1')).rejects.toMatchObject({ kind: 'FETCH' });
  });

  it('erro HTTP e arquivo que não é página viram falha de leitura', async () => {
    const { t } = pages({ 'https://c.test/pdf': { html: '%PDF', contentType: 'application/pdf' } });
    setPageFetchForTests(t, publicDns);
    await expect(fetchPage('https://c.test/nada')).rejects.toMatchObject({ kind: 'FETCH' });
    await expect(fetchPage('https://c.test/pdf')).rejects.toMatchObject({ kind: 'FETCH' });
  });
});

describe('NORQVA-0115 — limpeza da estrutura', () => {
  const fp = buildFingerprint(htmlToBlocks(FIXTURE).map(b => b.text));

  it('troca frase copiada, preço/número e nome próprio da referência', () => {
    const s: SalesStructure = {
      kind: 'SALES_PAGE',
      sections: [
        { order: 1, role: 'HERO_HOOK', purpose: 'Abertura com pergunta sobre a dor do leitor', headline_style: 'QUESTION', approx_words: 30, has_image: true, has_video: false, cta_count: 1 },
        { order: 2, role: 'AUTHORITY', purpose: 'avó guardava este caderno secreto de massas frescas', headline_style: 'NONE', approx_words: 20, has_image: false, has_video: false, cta_count: 0 },
        { order: 3, role: 'OFFER_PRICE', purpose: 'Preço riscado de R$ 97 para 19,90', headline_style: 'STATEMENT', approx_words: 15, has_image: false, has_video: false, cta_count: 1 },
        { order: 4, role: 'PROOF_RESULTS', purpose: 'Mostra a Lucia cozinhando', headline_style: 'NONE', approx_words: 10, has_image: true, has_video: false, cta_count: 0 },
        { order: 5, role: 'BENEFITS', purpose: 'Promete perder 5 kg em 30%', headline_style: 'NONE', approx_words: 10, has_image: false, has_video: false, cta_count: 0 }
      ],
      tone: 'Afetivo, como na cozinha de Bolonha',
      length_class: 'MEDIUM',
      cta_text_style: 'Verbo na primeira pessoa',
      color_mood: 'Tons quentes'
    };
    const out = sanitizeStructure(s, fp) as SalesStructure;
    expect(out.sections[0].purpose).toBe('Abertura com pergunta sobre a dor do leitor');
    expect(out.sections[1].purpose).toBe(ROLE_PURPOSE.AUTHORITY);
    expect(out.sections[2].purpose).toBe(ROLE_PURPOSE.OFFER_PRICE);
    expect(out.sections[3].purpose).toBe(ROLE_PURPOSE.PROOF_RESULTS);
    expect(out.sections[4].purpose).toBe(ROLE_PURPOSE.BENEFITS);
    expect(out.tone).toBe('Não identificado');
    expect(out.cta_text_style).toBe('Verbo na primeira pessoa');
    expect(out.color_mood).toBe('Tons quentes');
  });

  it('validador limpa enum desconhecido e corta textos longos', () => {
    const v = validateSalesStructure({
      sections: [{ role: 'INVENTADO', purpose: 'x'.repeat(400), headline_style: 'question', approx_words: -3, has_image: 'true', cta_count: 99 }],
      tone: 't',
      length_class: 'GIGANTE'
    })!;
    expect(v.sections[0]).toMatchObject({ order: 1, role: 'OTHER', headline_style: 'QUESTION', approx_words: 0, has_image: true, has_video: false, cta_count: 20 });
    expect(v.sections[0].purpose).toHaveLength(140);
    expect(v.length_class).toBe('SHORT');
    expect(validateSalesStructure({ sections: [] })).toBeNull();
    expect(validateSalesStructure('nada')).toBeNull();
    const ad = validateAdStructure({ hook_type: 'question', format: 'reels', duration_s: 22.4, structure_beats: [{ t_from_s: 0, role: 'HOOK', purpose: 'Gancho' }, { role: 'X' }] })!;
    expect(ad).toMatchObject({ hook_type: 'QUESTION', format: 'IMAGE', duration_s: 22 });
    expect(ad.structure_beats[1]).toMatchObject({ t_from_s: null, role: 'OTHER' });
    expect(validateAdStructure({ structure_beats: [] })).toBeNull();
  });

  it('sem IA: estrutura por palavras-chave, só com textos fixos do NORQVA', () => {
    const s = heuristicStructure(htmlToBlocks(FIXTURE), 'SALES_PAGE') as SalesStructure;
    const roles = s.sections.map(x => x.role);
    expect(roles[0]).toBe('HERO_HOOK');
    expect(roles).toEqual(expect.arrayContaining(['CONTENTS', 'TESTIMONIALS', 'BONUS', 'OFFER_PRICE', 'GUARANTEE', 'FAQ']));
    expect(s.sections[0]).toMatchObject({ headline_style: 'QUESTION', has_image: true, has_video: true, cta_count: 1 });
    for (const sec of s.sections) expect(Object.values(ROLE_PURPOSE)).toContain(sec.purpose);
    expect(JSON.stringify(s)).not.toContain('Lucia');
  });
});

describe('NORQVA-0115 — IA simulada', () => {
  const blocks = htmlToBlocks(FIXTURE);
  const validJson = {
    sections: [
      { order: 1, role: 'HERO_HOOK', purpose: 'Abertura com pergunta', headline_style: 'QUESTION', approx_words: 40, has_image: true, has_video: true, cta_count: 1 },
      { order: 2, role: 'NAO_EXISTE', purpose: 'Parte de apoio', headline_style: 'NONE', approx_words: 10, has_image: false, has_video: false, cta_count: 0 }
    ],
    tone: 'Acolhedor',
    length_class: 'MEDIUM',
    cta_text_style: 'Imperativo curto',
    color_mood: 'Quente'
  };

  it('JSON válido: usa a IA e limpa enum desconhecido', async () => {
    let seen: any[] = [];
    setReferenceAiForTests(async (messages, schema) => {
      seen = messages;
      expect(schema.name).toBe('sales_page_structure');
      return '```json\n' + JSON.stringify(validJson) + '\n```';
    });
    const r = await extractStructure({ blocks }, 'SALES_PAGE');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.method).toBe('AI');
    expect((r.structure as SalesStructure).sections[1].role).toBe('OTHER');
    expect(String(seen[0].content)).toContain('nunca copie');
  });

  it('JSON inválido: página cai na estrutura por palavras-chave; prints falham', async () => {
    setReferenceAiForTests(async () => 'isto não é json');
    const r = await extractStructure({ blocks }, 'SALES_PAGE');
    expect(r.ok && r.method).toBe('HEURISTIC');
    const s = await extractStructure({ images: [{ mime: 'image/png', base64: PNG_1X1 }] }, 'AD');
    expect(s.ok).toBe(false);
  });

  it('IA que dá erro também cai na estrutura por palavras-chave', async () => {
    setReferenceAiForTests(async () => {
      throw new Error('HTTP 500');
    });
    const r = await extractStructure({ blocks }, 'AD');
    expect(r.ok && r.method).toBe('HEURISTIC');
  });

  it('sem chave da IA: página usa palavras-chave; prints ficam "IA não configurada"', async () => {
    const r = await extractStructure({ blocks }, 'SALES_PAGE');
    expect(r.ok && r.method).toBe('HEURISTIC');
    const s = await extractStructure({ images: [{ mime: 'image/png', base64: PNG_1X1 }] }, 'SALES_PAGE');
    expect(s).toEqual({ ok: false, reason: 'IA não configurada' });
  });

  it('prints vão no formato de imagem da OpenAI', async () => {
    let seen: any[] = [];
    setReferenceAiForTests(async (messages, schema) => {
      seen = messages;
      expect(schema.schema.required).toContain('visible_text');
      return JSON.stringify({
        hook_type: 'QUESTION', angle: 'Dor do iniciante', format: 'VIDEO', duration_s: 20, on_screen_text: true, voiceover: false,
        structure_beats: [{ t_from_s: 0, role: 'HOOK', purpose: 'Pergunta direta' }], cta_style: 'Curto', visible_text: 'texto dos prints'
      });
    });
    const r = await extractStructure({ images: [{ mime: 'image/png', base64: PNG_1X1 }], adText: 'texto colado' }, 'AD');
    expect(r.ok && r.visibleText).toBe('texto dos prints');
    const content = seen[1].content;
    expect(content[0].type).toBe('text');
    expect(content[0].text).toContain('texto colado');
    expect(content[1]).toEqual({ type: 'image_url', image_url: { url: `data:image/png;base64,${PNG_1X1}`, detail: 'high' } });
  });
});

describe.sequential('NORQVA-0115 — rotas e gravação', () => {
  let pool: Pool;
  let admin: string;
  let creative: string;
  let performance: string;
  const productId = crypto.randomUUID();
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const PAGE = 'https://concorrente.test/pagina';
  const post = (url: string, body: any, token = admin) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body);
  const get = (url: string, token = admin) => request(app).get(url).set('Authorization', `Bearer ${token}`);
  const shots = (body: any, token = admin) =>
    request(app)
      .post('/api/creative-references/screenshots')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/vnd.norqva.screenshots+json')
      .send(JSON.stringify(body));
  const rowJson = async (id: string) =>
    JSON.stringify((await pool.query('SELECT * FROM creative_references WHERE id = $1', [id])).rows[0]);
  const usePages = () =>
    setPageFetchForTests(
      pages({
        [`${PAGE}?utm=1`]: { html: FIXTURE },
        'https://concorrente.test/fora': { status: 500, html: '' },
        'https://concorrente.test/vazia': { html: '<html><body><img src="a.jpg"></body></html>' }
      }).t,
      publicDns
    );

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const u = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, $2, 'U 0115', $3, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $3, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [crypto.randomUUID(), email, role]
      );
      return signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role });
    };
    admin = await mk('admin.norqva0115@norqva.test', 'ADMIN');
    creative = await mk('creative.norqva0115@norqva.test', 'CREATIVE');
    performance = await mk('perf.norqva0115@norqva.test', 'PERFORMANCE');
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance)
       VALUES ($1, $2, 'Livro 0115', 'Receitas', 'x', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
      [productId, `PRD-T115${tag}`]
    );
    process.env.CREATIVE_REFERENCES_ENABLED = 'true';
  });

  afterAll(async () => {
    delete process.env.CREATIVE_REFERENCES_ENABLED;
    if (!pool) return;
    await pool.query('DELETE FROM creative_references WHERE product_id = $1', [productId]).catch(() => {});
    await pool.query('DELETE FROM products WHERE id = $1', [productId]).catch(() => {});
  });

  it('trava desligada: 404 com mensagem clara e status avisa', async () => {
    delete process.env.CREATIVE_REFERENCES_ENABLED;
    const r = await post('/api/creative-references', { url: PAGE, product_id: productId, reference_type: 'SALES_PAGE' });
    expect(r.status).toBe(404);
    expect(r.body.error).toContain('desligadas');
    expect((await get('/api/creative-references')).status).toBe(404);
    const st = await get('/api/creative-references/status', performance);
    expect(st.status).toBe(200);
    expect(st.body.enabled).toBe(false);
    process.env.CREATIVE_REFERENCES_ENABLED = 'true';
    expect((await get('/api/creative-references/status')).body.enabled).toBe(true);
  });

  it('perfis: PERFORMANCE não cria nem lê; CREATIVE não exclui', async () => {
    expect((await post('/api/creative-references', { url: PAGE, product_id: productId, reference_type: 'SALES_PAGE' }, performance)).status).toBe(403);
    expect((await get('/api/creative-references', performance)).status).toBe(403);
    expect((await request(app).delete(`/api/creative-references/${crypto.randomUUID()}`).set('Authorization', `Bearer ${creative}`)).status).toBe(403);
    expect((await request(app).get('/api/creative-references')).status).toBe(401);
  });

  it('link: grava só a estrutura e as impressões, nunca o texto da página', async () => {
    usePages();
    const r = await post('/api/creative-references', { url: `${PAGE}?utm=1`, product_id: productId, reference_type: 'SALES_PAGE', notes: 'Ver a ordem das seções' }, creative);
    expect(r.status).toBe(201);
    const ref = r.body.reference;
    expect(ref.human_id).toMatch(/^REF-\d{6}$/);
    expect(ref).toMatchObject({ status: 'READY', source_kind: 'PAGE_URL', source_host: 'concorrente.test', source_url: PAGE, extraction_method: 'HEURISTIC', product_name: 'Livro 0115' });
    expect(ref.structure.sections.length).toBeGreaterThan(3);
    expect(ref.shingle_count).toBeGreaterThan(10);
    expect(ref.source_shingles).toBeUndefined();
    const j = await rowJson(ref.id);
    expect(j).not.toContain('caderno secreto');
    expect(j).not.toContain('Lucia');
    expect(j).not.toContain('ravioli');
    expect(j).not.toContain('19,90');
    expect(j).not.toContain('<p>');
    const row = (await pool.query('SELECT source_shingles, source_word_count FROM creative_references WHERE id = $1', [ref.id])).rows[0];
    expect(row.source_shingles).toContain(shingleHash(normalizeWords('guardava este caderno secreto de massas').join(' ')));
    expect(row.source_word_count).toBeGreaterThan(80);
    const audit = await pool.query(`SELECT description FROM audit_logs WHERE event_type = 'CREATIVE_REFERENCE_CREATED' AND description LIKE $1`, [`%${ref.human_id}%`]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].description).not.toContain('Lucia');
  });

  it('IA que tenta copiar: o que é cópia vira texto genérico antes de gravar', async () => {
    usePages();
    setReferenceAiForTests(async () =>
      JSON.stringify({
        sections: [
          { order: 1, role: 'HERO_HOOK', purpose: SECRET.slice(0, 90), headline_style: 'QUESTION', approx_words: 30, has_image: true, has_video: true, cta_count: 1 },
          { order: 2, role: 'OFFER_PRICE', purpose: 'De R$ 97,00 por R$ 19,90', headline_style: 'STATEMENT', approx_words: 20, has_image: false, has_video: false, cta_count: 1 }
        ],
        tone: 'Saudoso, como a avó Lucia',
        length_class: 'MEDIUM',
        cta_text_style: 'Primeira pessoa',
        color_mood: 'Quente'
      })
    );
    const r = await post('/api/creative-references', { url: `${PAGE}?utm=1`, product_id: productId, reference_type: 'SALES_PAGE' });
    expect(r.status).toBe(201);
    expect(r.body.reference.extraction_method).toBe('AI');
    expect(r.body.reference.structure.sections[0].purpose).toBe(ROLE_PURPOSE.HERO_HOOK);
    expect(r.body.reference.structure.sections[1].purpose).toBe(ROLE_PURPOSE.OFFER_PRICE);
    expect(r.body.reference.structure.tone).toBe('Não identificado');
    const j = await rowJson(r.body.reference.id);
    expect(j).not.toContain('caderno secreto');
    expect(j).not.toContain('Lucia');
    expect(j).not.toContain('19,90');
  });

  it('endereço interno: 400 e nada gravado; página fora do ar: fica como falhou', async () => {
    usePages();
    const before = (await pool.query('SELECT count(*)::int AS n FROM creative_references WHERE product_id = $1', [productId])).rows[0].n;
    expect((await post('/api/creative-references', { url: 'http://169.254.169.254/latest', product_id: productId, reference_type: 'SALES_PAGE' })).status).toBe(400);
    expect((await post('/api/creative-references', { url: 'https://interno.test/x', product_id: productId, reference_type: 'SALES_PAGE' })).status).toBe(400);
    expect((await post('/api/creative-references', { url: PAGE, product_id: crypto.randomUUID(), reference_type: 'SALES_PAGE' })).status).toBe(400);
    expect((await post('/api/creative-references', { url: PAGE, product_id: productId, reference_type: 'OUTRO' })).status).toBe(400);
    const after = (await pool.query('SELECT count(*)::int AS n FROM creative_references WHERE product_id = $1', [productId])).rows[0].n;
    expect(after).toBe(before);
    const down = await post('/api/creative-references', { url: 'https://concorrente.test/fora', product_id: productId, reference_type: 'SALES_PAGE' });
    expect(down.status).toBe(201);
    expect(down.body.reference).toMatchObject({ status: 'FAILED', structure: null });
    expect(down.body.reference.failure_reason).toContain('HTTP 500');
    const empty = await post('/api/creative-references', { url: 'https://concorrente.test/vazia', product_id: productId, reference_type: 'SALES_PAGE' });
    expect(empty.body.reference.status).toBe('FAILED');
    expect(empty.body.reference.failure_reason).toContain('prints');
  });

  it('prints sem IA: falha com "IA não configurada"', async () => {
    const r = await shots({ images: [`data:image/png;base64,${PNG_1X1}`], product_id: productId, reference_type: 'AD' });
    expect(r.status).toBe(201);
    expect(r.body.reference).toMatchObject({ status: 'FAILED', failure_reason: 'IA não configurada', source_kind: 'SCREENSHOTS' });
  });

  it('prints com IA: estrutura gravada, texto e imagem não', async () => {
    setReferenceAiForTests(async () =>
      JSON.stringify({
        hook_type: 'QUESTION', angle: SECRET, format: 'VIDEO', duration_s: 25, on_screen_text: true, voiceover: true,
        structure_beats: [
          { t_from_s: 0, role: 'HOOK', purpose: 'Pergunta sobre o erro mais comum' },
          { t_from_s: 5, role: 'PROOF', purpose: 'Mostra a Lucia na cozinha' }
        ],
        cta_style: 'Convite curto', visible_text: SECRET
      })
    );
    const r = await shots({ images: [PNG_1X1], ad_text: 'Texto do anúncio colado pelo dono com a frase', product_id: productId, reference_type: 'AD' }, creative);
    expect(r.status).toBe(201);
    const ref = r.body.reference;
    expect(ref).toMatchObject({ status: 'READY', extraction_method: 'AI', source_url: null });
    expect(ref.structure.angle).toBe('Não identificado');
    expect(ref.structure.structure_beats[0].purpose).toBe('Pergunta sobre o erro mais comum');
    expect(ref.structure.structure_beats[1].purpose).toBe('Prova ou resultado');
    expect(ref.shingle_count).toBeGreaterThan(5);
    const j = await rowJson(ref.id);
    expect(j).not.toContain('caderno secreto');
    expect(j).not.toContain('Lucia');
    expect(j).not.toContain(PNG_1X1.slice(0, 20));
    expect(j).not.toContain('colado pelo dono');
  });

  it('prints: limite de 5 e só imagem', async () => {
    expect((await shots({ images: Array(6).fill(PNG_1X1), product_id: productId, reference_type: 'AD' })).status).toBe(400);
    const notImage = await shots({ images: [Buffer.from('não é imagem').toString('base64')], product_id: productId, reference_type: 'AD' });
    expect(notImage.status).toBe(400);
    expect((await shots({ product_id: productId, reference_type: 'AD' })).status).toBe(400);
  });

  it('lista, abre, exclui e restaura (lixeira, nada apagado)', async () => {
    const list = await get('/api/creative-references', creative);
    expect(list.status).toBe(200);
    const mine = list.body.references.filter((r: any) => r.product_id === productId);
    expect(mine.length).toBeGreaterThanOrEqual(5);
    expect(mine.every((r: any) => r.source_shingles === undefined)).toBe(true);
    const id = mine[0].id;
    expect((await get(`/api/creative-references/${id}`)).body.reference.id).toBe(id);
    expect((await get('/api/creative-references/nao-e-uuid')).status).toBe(404);
    const del = await request(app).delete(`/api/creative-references/${id}`).set('Authorization', `Bearer ${admin}`);
    expect(del.status).toBe(200);
    expect((await get(`/api/creative-references/${id}`)).status).toBe(404);
    const after = await get('/api/creative-references');
    expect(after.body.references.map((r: any) => r.id)).not.toContain(id);
    expect(after.body.trash.map((r: any) => r.id)).toContain(id);
    expect((await post(`/api/creative-references/${id}/restore`, {})).status).toBe(200);
    expect((await post(`/api/creative-references/${id}/restore`, {})).status).toBe(409);
    expect((await get(`/api/creative-references/${id}`)).status).toBe(200);
    const audit = await pool.query(
      `SELECT event_type FROM audit_logs WHERE event_type IN ('CREATIVE_REFERENCE_DELETED', 'CREATIVE_REFERENCE_RESTORED') AND description LIKE $1`,
      [`%${mine[0].human_id}%`]
    );
    expect(audit.rows).toHaveLength(2);
  });
});
