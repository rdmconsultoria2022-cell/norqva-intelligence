import { Pool } from 'pg';
import { writeAuditLog } from '../../db/audit';
import { loadFacts, ProductFacts, GenerationError, GenerationService } from './generationService';
import { CreativeFactoryService, CreativeFactoryError } from './creativeFactoryService';
import { isFactoryVideoUrl } from '../launchPlans/generatedCampaignService';
import { findPriceInText } from './priceInCopy';

// NORQVA-0160: vídeo com apresentadora fictícia, feito pela Fábrica de Criativos (o "motor", serviço separado no Render).
// O NORQVA só conversa com a API interna do motor (/api/v1, chave FABRICA_VIDEO_TOKEN) e guarda a ligação na
// tabela video_productions. Gasto de dinheiro (gerar os clipes) só com ADMIN, e o motor tem a própria trava de
// orçamento mensal. Falas com preço são barradas aqui (D-0053: anúncio sem preço).
// Testes nunca falam com o motor: sem simulação, qualquer chamada em NODE_ENV=test falha.

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: any; signal?: any }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<any>;
}>;

let testFetch: FetchLike | null = null;
let testConfig: { url: string; token: string } | null = null;

/** Só para testes: motor simulado. null volta ao normal. */
export function setVideoFactoryForTests(opts: { fetch: FetchLike; url?: string; token?: string } | null) {
  testFetch = opts ? opts.fetch : null;
  testConfig = opts ? { url: opts.url ?? 'https://motor.test', token: opts.token ?? 'token-teste' } : null;
}

export const VIDEO_FACTORY_DISABLED_MESSAGE = 'O vídeo com apresentadora ainda não está ligado neste ambiente.';
export const VIDEO_FACTORY_MISSING_MESSAGE = 'A Fábrica de vídeo não está configurada (endereço ou chave ausente).';

export function videoFactoryEnabled(): boolean {
  return String(process.env.VIDEO_FACTORY_ENABLED || '').trim().toLowerCase() === 'true';
}

function config(): { url: string; token: string } {
  if (testConfig) return testConfig;
  if (process.env.NODE_ENV === 'test') return { url: '', token: '' };
  return {
    url: String(process.env.FABRICA_VIDEO_URL || '').trim().replace(/\/+$/, ''),
    token: String(process.env.FABRICA_VIDEO_TOKEN || '').trim()
  };
}

export function videoFactoryConfigured(): boolean {
  const c = config();
  return Boolean(c.url && c.token);
}

function doFetch(): FetchLike {
  if (testFetch) return testFetch;
  if (process.env.NODE_ENV === 'test') {
    return async () => {
      throw new Error('Teste sem motor de vídeo simulado.');
    };
  }
  return fetch as unknown as FetchLike;
}

/** Chama o motor. Erro do motor (4xx) vira mensagem para a tela; falha de rede vira 502. */
export async function motorCall(method: 'GET' | 'POST' | 'PUT', path: string, body?: any, timeoutMs = 120000): Promise<any> {
  const c = config();
  if (!c.url || !c.token) throw new GenerationError(503, VIDEO_FACTORY_MISSING_MESSAGE);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let r;
  try {
    r = await doFetch()(`${c.url}/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal
    });
  } catch (e: any) {
    console.error('[fábrica de vídeo] sem resposta:', e?.message || e);
    throw new GenerationError(502, 'A Fábrica de vídeo não respondeu. Tente de novo em alguns minutos.');
  } finally {
    clearTimeout(timer);
  }
  let data: any = null;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  if (!r.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : '';
    if (r.status === 401 || r.status === 503) {
      console.error('[fábrica de vídeo] chave ou configuração:', r.status, detail);
      throw new GenerationError(503, VIDEO_FACTORY_MISSING_MESSAGE);
    }
    if (r.status >= 400 && r.status < 500) {
      const code = r.status === 404 ? 404 : r.status === 409 ? 409 : 400;
      throw new GenerationError(code, detail || 'A Fábrica de vídeo recusou o pedido.');
    }
    console.error('[fábrica de vídeo] erro', r.status, detail);
    throw new GenerationError(502, 'A Fábrica de vídeo teve um erro. Tente de novo em alguns minutos.');
  }
  return data;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const samePath = (a: unknown, b: unknown) => {
  try {
    const x = new URL(String(a || '')), y = new URL(String(b || ''));
    return x.origin === y.origin && x.pathname === y.pathname;
  } catch {
    return false;
  }
};
const TEMPLATE_RE = /^[a-z0-9_]{1,60}$/;
const FORMATS = ['9:16', '4:5', '1:1'];

/** Produto como o motor espera. Sem preço (o anúncio não fala preço: D-0053). */
export function motorProduct(f: ProductFacts) {
  const offerParts = [f.offer.name, f.offer.description, f.offer.bonus ? `Bônus: ${f.offer.bonus}` : '']
    .map(s => String(s || '').trim())
    .filter(s => s && !findPriceInText(s));
  return {
    ref_externa: `norqva:offer:${f.offer.human_id}`,
    nome: f.product.name,
    categoria: f.product.category,
    descricao: [
      ...String(f.product.description || '').split(/\n+/),
      f.deliveryTitles.length ? `O que a pessoa recebe: ${f.deliveryTitles.join('; ')}` : '',
      'Entrega digital, acesso por e-mail depois do pagamento.'
    ]
      .map(s => s.trim())
      .filter(s => s && !findPriceInText(s))
      .join('\n'),
    oferta: offerParts.join('\n'),
    cta: 'Clica no botão aqui embaixo',
    alegacoes_permitidas: f.claims.map(c => c.text).join('\n'),
    alegacoes_proibidas: 'Preço, valores em reais, parcelas, descontos com número, frete. Promessas de saúde, emagrecimento, cura ou renda.'
  };
}

/** Falas do roteiro que citam preço (barradas antes de gastar). */
export function priceIssues(motor: any): Array<{ scene_id: number; order: number; match: string }> {
  const out: Array<{ scene_id: number; order: number; match: string }> = [];
  for (const c of Array.isArray(motor?.cenas) ? motor.cenas : []) {
    const p = findPriceInText(c?.fala);
    if (p) out.push({ scene_id: Number(c.id), order: Number(c.ordem), match: p.match });
  }
  return out;
}

const ROW_COLS = `v.id, v.product_id, v.offer_id, v.generated_page_id, v.motor_production_id, v.persona_id, v.template_id, v.duration_s,
  v.status, v.estimated_cost_usd, v.creative_id, v.created_at, v.updated_at, v.approved_at, p.name AS product_name, o.human_id AS offer_human_id`;

export class VideoFactoryService {
  constructor(private pool: Pool) {}

  async catalog() {
    const [personas, templates, status] = await Promise.all([
      motorCall('GET', '/personas', undefined, 30000),
      motorCall('GET', '/templates', undefined, 30000),
      motorCall('GET', '/status', undefined, 30000)
    ]);
    return {
      personas: (Array.isArray(personas) ? personas : []).map((p: any) => ({ id: p.id, name: p.nome, voice: p.voz, look: p.aparencia, image: p.imagem })),
      templates: (Array.isArray(templates) ? templates : []).map((t: any) => ({
        id: t.id, name: t.nome, description: t.descricao,
        durations: (t.duracoes || []).map((d: any) => ({ seconds: d.segundos, scenes: d.cenas }))
      })),
      budget: { monthly_usd: Number(status?.orcamento_mensal_usd || 0), spent_month_usd: Number(status?.gasto_mes_usd || 0) }
    };
  }

  async list(filter: { productId?: unknown; pageId?: unknown }) {
    const where = ['v.deleted_at IS NULL'];
    const params: any[] = [];
    if (typeof filter.productId === 'string' && UUID_RE.test(filter.productId)) {
      params.push(filter.productId);
      where.push(`v.product_id = $${params.length}`);
    }
    if (typeof filter.pageId === 'string' && UUID_RE.test(filter.pageId)) {
      params.push(filter.pageId);
      where.push(`v.generated_page_id = $${params.length}`);
    }
    const r = await this.pool.query(
      `SELECT ${ROW_COLS} FROM video_productions v LEFT JOIN products p ON p.id = v.product_id LEFT JOIN offers o ON o.id = v.offer_id
       WHERE ${where.join(' AND ')} ORDER BY v.created_at DESC LIMIT 50`,
      params
    );
    return r.rows;
  }

  private async row(id: string) {
    if (!UUID_RE.test(id)) throw new GenerationError(404, 'Vídeo não encontrado.');
    const r = await this.pool.query(
      `SELECT ${ROW_COLS} FROM video_productions v LEFT JOIN products p ON p.id = v.product_id LEFT JOIN offers o ON o.id = v.offer_id
       WHERE v.id = $1 AND v.deleted_at IS NULL`,
      [id]
    );
    if (!r.rows[0]) throw new GenerationError(404, 'Vídeo não encontrado.');
    return r.rows[0];
  }

  /** Junta o que o NORQVA guarda com o estado atual no motor e atualiza o estado local. */
  private async view(row: any, motor: any) {
    const status = String(motor?.status || row.status).slice(0, 30);
    const cost = Number(motor?.custo_estimado_usd);
    if (status !== row.status || (Number.isFinite(cost) && Number(row.estimated_cost_usd) !== cost)) {
      await this.pool.query('UPDATE video_productions SET status = $2, estimated_cost_usd = $3, updated_at = NOW() WHERE id = $1', [
        row.id, status, Number.isFinite(cost) ? cost : row.estimated_cost_usd
      ]);
    }
    return { ...row, status, estimated_cost_usd: Number.isFinite(cost) ? cost : row.estimated_cost_usd, motor, price_issues: priceIssues(motor) };
  }

  async get(id: string) {
    const row = await this.row(id);
    return this.view(row, await motorCall('GET', `/producoes/${row.motor_production_id}`, undefined, 30000));
  }

  async create(input: any, actor: string | null) {
    const productId = String(input?.product_id || '');
    const offerId = String(input?.offer_id || '');
    const facts = await loadFacts(this.pool, productId, offerId);
    let pageId: string | null = null;
    if (input?.generated_page_id) {
      pageId = String(input.generated_page_id);
      if (!UUID_RE.test(pageId)) throw new GenerationError(400, 'Página gerada inválida.');
      const pg = await this.pool.query('SELECT product_id, offer_id FROM generated_pages WHERE id = $1 AND deleted_at IS NULL', [pageId]);
      if (!pg.rows[0]) throw new GenerationError(400, 'Página gerada não encontrada.');
      if (String(pg.rows[0].product_id) !== productId || String(pg.rows[0].offer_id) !== offerId) {
        throw new GenerationError(400, 'A página gerada é de outro produto ou oferta.');
      }
    }
    const personaId = Number(input?.persona_id);
    if (!Number.isInteger(personaId) || personaId <= 0) throw new GenerationError(400, 'Escolha a apresentadora.');
    const templateId = String(input?.template_id || 'selfie_caminhando');
    if (!TEMPLATE_RE.test(templateId)) throw new GenerationError(400, 'Modelo de vídeo inválido.');
    const duration = Number(input?.duration_s ?? 30);
    if (![15, 30, 45, 60].includes(duration)) throw new GenerationError(400, 'Escolha a duração: 15, 30, 45 ou 60 segundos.');
    const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

    const motor = await motorCall('POST', '/producoes', {
      produto: motorProduct(facts),
      persona_id: personaId,
      template_id: templateId,
      duracao: duration,
      objetivo: clip(input?.objective, 300),
      tom: clip(input?.tone, 120)
    });
    const motorId = Number(motor?.id);
    if (!Number.isInteger(motorId)) throw new GenerationError(502, 'A Fábrica de vídeo não devolveu a produção.');
    const orphan = async (why: string) => {
      await writeAuditLog(this.pool, actor, 'VIDEO_PRODUCTION_ORPHANED', `Produção ${motorId} criada na Fábrica mas não ligada no NORQVA (${why}).`);
      return new GenerationError(409, 'Esta produção da Fábrica já está ligada a outro vídeo. Avise o suporte.');
    };
    const exists = await this.pool.query('SELECT 1 FROM video_productions WHERE motor_production_id = $1', [motorId]);
    if (exists.rowCount) throw await orphan('número já em uso');
    let ins;
    try {
      ins = await this.pool.query(
      `INSERT INTO video_productions (product_id, offer_id, generated_page_id, motor_production_id, persona_id, template_id, duration_s, status, estimated_cost_usd, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [productId, offerId, pageId, motorId, personaId, templateId, duration, String(motor.status || 'roteiro').slice(0, 30),
        Number.isFinite(Number(motor.custo_estimado_usd)) ? Number(motor.custo_estimado_usd) : null, actor]
      );
    } catch (e: any) {
      if (e?.code === '23505') throw await orphan('número já em uso');
      throw e;
    }
    await writeAuditLog(this.pool, actor, 'VIDEO_PRODUCTION_CREATED',
      `Roteiro de vídeo (${duration}s) criado na Fábrica para a oferta ${facts.offer.human_id} (produção ${motorId}).`, null, 'roteiro');
    return this.view(await this.row(ins.rows[0].id), motor);
  }

  async editScript(id: string, scenes: unknown, actor: string | null) {
    const row = await this.row(id);
    if (!Array.isArray(scenes) || !scenes.length || scenes.length > 20) throw new GenerationError(400, 'Envie as falas das cenas.');
    const cenas = scenes.map((s: any) => {
      const out: any = { id: Number(s?.id) };
      if (!Number.isInteger(out.id)) throw new GenerationError(400, 'Cena inválida.');
      if (s?.line !== undefined) out.fala = String(s.line ?? '').trim().slice(0, 400);
      if (s?.action !== undefined) out.acao = String(s.action ?? '').trim().slice(0, 400);
      if (out.fala !== undefined) {
        const p = findPriceInText(out.fala);
        if (p) throw new GenerationError(400, `Anúncio não fala preço (D-0053): "${p.match}". O preço fica na página e no pagamento.`);
      }
      return out;
    });
    const motor = await motorCall('PUT', `/producoes/${row.motor_production_id}/roteiro`, { cenas }, 30000);
    await writeAuditLog(this.pool, actor, 'VIDEO_SCRIPT_EDITED', `Roteiro da produção ${row.motor_production_id} editado.`);
    return this.view(row, motor);
  }

  /** Aprova o gasto (gera os clipes). Só ADMIN (rota). Barra falas com preço. */
  async approve(id: string, extra: boolean, actor: string | null) {
    const row = await this.row(id);
    if (row.approved_at) throw new GenerationError(409, 'O gasto deste vídeo já foi aprovado.');
    const current = await motorCall('GET', `/producoes/${row.motor_production_id}`, undefined, 30000);
    if (current?.status !== 'roteiro') throw new GenerationError(409, 'O gasto deste vídeo já foi aprovado.');
    const issues = priceIssues(current);
    if (issues.length) {
      throw new GenerationError(400, `Anúncio não fala preço (D-0053). Corrija a cena ${issues[0].order}: "${issues[0].match}".`);
    }
    // trava contra dois cliques ao mesmo tempo: só quem marcar primeiro chama o motor (o motor também recusa a segunda)
    const claim = await this.pool.query(
      'UPDATE video_productions SET approved_by = $2, approved_at = NOW() WHERE id = $1 AND approved_at IS NULL RETURNING id',
      [row.id, actor]
    );
    if (!claim.rowCount) throw new GenerationError(409, 'O gasto deste vídeo já foi aprovado.');
    let motor;
    try {
      motor = await motorCall('POST', `/producoes/${row.motor_production_id}/aprovar`, { aprovacao_extra: Boolean(extra) }, 30000);
    } catch (e) {
      await this.pool.query('UPDATE video_productions SET approved_by = NULL, approved_at = NULL WHERE id = $1', [row.id]);
      throw e;
    }
    await writeAuditLog(this.pool, actor, 'VIDEO_PRODUCTION_APPROVED',
      `Gasto aprovado na produção ${row.motor_production_id} (estimado US$ ${Number(current?.custo_estimado_usd || 0).toFixed(2)}).`, 'roteiro', String(motor?.status || ''), false, true);
    return this.view(row, motor);
  }

  private sceneOf(motor: any, sceneId: unknown) {
    const sid = Number(sceneId);
    const scene = (motor?.cenas || []).find((c: any) => Number(c.id) === sid);
    if (!Number.isInteger(sid) || !scene) throw new GenerationError(404, 'Cena não encontrada neste vídeo.');
    return { sid, scene };
  }

  /** Gera a cena de novo (gasta). Só ADMIN (rota). */
  async regenerateScene(id: string, sceneId: unknown, newLine: unknown, actor: string | null) {
    const row = await this.row(id);
    if (!row.approved_at) throw new GenerationError(409, 'Aprove o gasto do vídeo antes de gerar cenas.');
    const current = await motorCall('GET', `/producoes/${row.motor_production_id}`, undefined, 30000);
    if (current?.status === 'roteiro') throw new GenerationError(409, 'Aprove o gasto do vídeo antes de gerar cenas.');
    const { sid, scene } = this.sceneOf(current, sceneId);
    const line = newLine === undefined || newLine === null ? '' : String(newLine).trim().slice(0, 400);
    const p = findPriceInText(line || scene.fala);
    if (p) throw new GenerationError(400, `Anúncio não fala preço (D-0053): "${p.match}".`);
    const motor = await motorCall('POST', `/cenas/${sid}/regerar`, { nova_fala: line || null }, 30000);
    await writeAuditLog(this.pool, actor, 'VIDEO_SCENE_REGENERATED', `Cena ${sid} da produção ${row.motor_production_id} gerada de novo.`);
    return this.view(row, motor);
  }

  async chooseTake(id: string, sceneId: unknown, takeId: unknown, actor: string | null) {
    const row = await this.row(id);
    const { sid, scene } = this.sceneOf(await motorCall('GET', `/producoes/${row.motor_production_id}`, undefined, 30000), sceneId);
    const tid = Number(takeId);
    if (!(scene.tentativas || []).some((t: any) => Number(t.id) === tid && t.status === 'pronta')) {
      throw new GenerationError(400, 'Escolha uma tomada pronta desta cena.');
    }
    const motor = await motorCall('POST', `/cenas/${sid}/escolher`, { tentativa_id: tid }, 30000);
    await writeAuditLog(this.pool, actor, 'VIDEO_TAKE_CHOSEN', `Cena ${sid}: tomada ${tid} escolhida.`);
    return this.view(row, motor);
  }

  /**
   * Etapa C: põe o vídeo final num anúncio da página gerada. O anúncio vira uma versão nova (mesmo texto, formato
   * VIDEO, arquivo = link de longa duração do motor) e precisa ser aprovado de novo antes de ir para a campanha.
   */
  async useInAd(id: string, creativeId: unknown, actor: string | null) {
    const row = await this.row(id);
    if (!row.generated_page_id) throw new GenerationError(409, 'Este vídeo não está ligado a uma página da Fábrica.');
    const motor = await motorCall('GET', `/producoes/${row.motor_production_id}`, undefined, 30000);
    const link = String(motor?.video_final_anuncio || '');
    if (motor?.status !== 'pronto' || !link) throw new GenerationError(409, 'Monte o vídeo antes de colocá-lo num anúncio.');
    if (!isFactoryVideoUrl(link)) throw new GenerationError(502, 'O link do vídeo não veio da Fábrica de vídeo configurada.');
    const issues = priceIssues(motor);
    if (issues.length) throw new GenerationError(400, `Anúncio não fala preço (D-0053). Corrija a cena ${issues[0].order}.`);
    const cid = String(creativeId || '');
    const ads = await new GenerationService(this.pool).ads(String(row.generated_page_id));
    const ad = ads.find((a: any) => a.id === cid);
    if (!ad) throw new GenerationError(404, 'Anúncio não encontrado nesta página.');
    // o motor assina um link novo a cada leitura: compara o arquivo (endereço sem a assinatura)
    if (samePath(ad.file_url, link)) throw new GenerationError(409, 'Este anúncio já está com este vídeo.');
    let out: any;
    try {
      out = await new CreativeFactoryService().reviseCreative(
        this.pool,
        cid,
        { file_url: link },
        actor,
        false,
        { forceNewVersion: true, format: 'VIDEO', copyCheck: ad.copy_check ?? undefined }
      );
    } catch (e: any) {
      if (e instanceof CreativeFactoryError) throw new GenerationError(e.status, e.message);
      throw e;
    }
    const newId = out?.creative?.id || cid;
    await this.pool.query('UPDATE video_productions SET creative_id = $2, updated_at = NOW() WHERE id = $1', [row.id, newId]);
    await writeAuditLog(this.pool, actor, 'VIDEO_USED_IN_AD',
      `Vídeo da produção ${row.motor_production_id} colocado no anúncio ${ad.human_id} (versão nova ${out?.creative?.human_id || ''}, aprovar de novo).`,
      ad.human_id, out?.creative?.human_id || null);
    return { ...(await this.view(await this.row(id), motor)), ad: out?.creative || null };
  }

  async assemble(id: string, format: unknown, actor: string | null) {
    const row = await this.row(id);
    const f = String(format || '9:16');
    if (!FORMATS.includes(f)) throw new GenerationError(400, 'Formato inválido (9:16, 4:5 ou 1:1).');
    const current = await motorCall('GET', `/producoes/${row.motor_production_id}`, undefined, 30000);
    const issues = priceIssues(current);
    if (issues.length) throw new GenerationError(400, `Anúncio não fala preço (D-0053). Corrija a cena ${issues[0].order}.`);
    const motor = await motorCall('POST', `/producoes/${row.motor_production_id}/montar`, { formato: f }, 30000);
    await writeAuditLog(this.pool, actor, 'VIDEO_ASSEMBLY_REQUESTED', `Montagem ${f} pedida na produção ${row.motor_production_id}.`);
    return this.view(row, motor);
  }
}
