import { Pool } from 'pg';
import { CriteriaNumbers, DEFAULT_NUMBERS, CriteriaService } from '../research/criteriaService';

// NORQVA-0017 (fase 2): European market via the official Ad Library API (ads_archive).
// Meta only returns third-party COMMERCIAL ads delivered in the EU (DSA); Brazil is out of reach
// through the API and scraping the web library breaks Meta's terms (D-0008).

export const AD_ARCHIVE_FIELDS = [
  'id', 'page_id', 'page_name', 'ad_creation_time', 'ad_delivery_start_time', 'ad_delivery_stop_time', 'ad_snapshot_url',
  'ad_creative_bodies', 'ad_creative_link_titles', 'ad_creative_link_descriptions', 'ad_creative_link_captions',
  'publisher_platforms', 'languages', 'eu_total_reach', 'target_ages', 'target_gender'
];

export interface ArchiveQuery {
  search_terms: string;
  countries: string[];
  limit?: number;
  after?: string | null;
}

export interface ArchivePage {
  data: any[];
  next: string | null;
  error?: { code?: number; message?: string; type?: string } | null;
}

export type ArchiveFetcher = (q: ArchiveQuery) => Promise<ArchivePage>;

export function adLibraryToken(): string | null {
  return process.env.META_AD_LIBRARY_TOKEN || process.env.META_ACCESS_TOKEN || null;
}

/** Default fetcher: GET graph.facebook.com/{v}/ads_archive (read-only, 15 s timeout). */
export const defaultArchiveFetcher: ArchiveFetcher = async q => {
  const token = adLibraryToken();
  if (!token) return { data: [], next: null, error: { code: -1, message: 'UNCONFIGURED' } };
  const version = (process.env.META_API_VERSION || 'v23.0').trim();
  const params = new URLSearchParams({
    access_token: token,
    search_terms: q.search_terms.slice(0, 100),
    ad_reached_countries: JSON.stringify(q.countries.slice(0, 27)),
    ad_type: 'ALL',
    ad_active_status: 'ALL',
    fields: AD_ARCHIVE_FIELDS.join(','),
    limit: String(Math.min(100, q.limit || 100))
  });
  if (q.after) params.set('after', q.after);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`https://graph.facebook.com/${version}/ads_archive?${params.toString()}`, { signal: controller.signal });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) {
      return { data: [], next: null, error: { code: body?.error?.code, message: body?.error?.message || `HTTP ${res.status}`, type: body?.error?.type } };
    }
    return { data: Array.isArray(body.data) ? body.data : [], next: body?.paging?.cursors?.after && body?.paging?.next ? body.paging.cursors.after : null };
  } catch (err: any) {
    return { data: [], next: null, error: { code: -2, message: err?.name === 'AbortError' ? 'timeout' : String(err?.message || err) } };
  } finally {
    clearTimeout(timer);
  }
};

export interface NormalizedEuAd {
  ad_library_id: string;
  page_id: string | null;
  page_name: string | null;
  start_date: string | null;
  stop_date: string | null;
  is_active: boolean;
  eu_total_reach: number | null;
  languages: string[];
  platforms: string[];
  body: string | null;
  title: string | null;
  link_caption: string | null;
  link_description: string | null;
  snapshot_url: string | null;
  target_ages: string | null;
  target_gender: string | null;
}

const first = (v: any): string | null => (Array.isArray(v) && v.length ? String(v[0]).slice(0, 4000) : null);
const day = (v: any): string | null => (v ? String(v).slice(0, 10) : null);

export function normalizeEuAd(raw: any, today: string): NormalizedEuAd | null {
  if (!raw || !raw.id) return null;
  const stop = day(raw.ad_delivery_stop_time);
  const reach = raw.eu_total_reach === undefined || raw.eu_total_reach === null ? null : parseInt(String(raw.eu_total_reach), 10);
  return {
    ad_library_id: String(raw.id),
    page_id: raw.page_id ? String(raw.page_id) : null,
    page_name: raw.page_name ? String(raw.page_name).slice(0, 300) : null,
    start_date: day(raw.ad_delivery_start_time || raw.ad_creation_time),
    stop_date: stop,
    is_active: !stop || stop >= today,
    eu_total_reach: Number.isFinite(reach as number) ? (reach as number) : null,
    languages: Array.isArray(raw.languages) ? raw.languages.map(String).slice(0, 10) : [],
    platforms: Array.isArray(raw.publisher_platforms) ? raw.publisher_platforms.map(String).slice(0, 10) : [],
    body: first(raw.ad_creative_bodies),
    title: first(raw.ad_creative_link_titles),
    link_caption: first(raw.ad_creative_link_captions),
    link_description: first(raw.ad_creative_link_descriptions),
    snapshot_url: raw.ad_snapshot_url ? String(raw.ad_snapshot_url) : null,
    target_ages: Array.isArray(raw.target_ages) ? raw.target_ages.join('-') : raw.target_ages ? String(raw.target_ages) : null,
    target_gender: raw.target_gender ? String(raw.target_gender) : null
  };
}

export function daysRunning(start: string | null, stop: string | null, isActive: boolean, today: string): number {
  if (!start) return 0;
  const end = isActive || !stop ? today : stop;
  const ms = new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime();
  return Math.max(0, Math.round(ms / 86400000) + 1);
}

export type NicheClass = 'VALIDADO' | 'PROMISSOR' | 'FRACO' | 'SEM_DADOS';

export interface NicheStats {
  ads_total: number;
  active_ads: number;
  advertisers: number;
  long_runners: number; // active and running for 30+ days
  total_reach: number; // Σ eu_total_reach of active ads
  new_ads_7d: number;
  reach_growth_7d: number;
}

/**
 * Validation score 0–100 (log scales, so a few giants don't dominate):
 * 40% long-running active ads, 25% distinct advertisers, 20% EU reach, 15% momentum (new ads in 7 days).
 */
export function scoreNiche(s: NicheStats, rules: CriteriaNumbers = DEFAULT_NUMBERS): { score: number; classification: NicheClass; reason: string } {
  // NORQVA-0029: pesos e notas de corte vêm dos critérios validados na tela Pesquisa
  const R = rules;
  if (s.ads_total < R.eu_min_ads) {
    return { score: 0, classification: 'SEM_DADOS', reason: `Menos de ${R.eu_min_ads} anúncios encontrados: ajuste os termos de busca ou aguarde a próxima coleta.` };
  }
  const lg = (x: number, full: number) => Math.min(1, Math.log10(1 + Math.max(0, x)) / Math.log10(1 + full));
  const score = Math.round(
    100 *
      (R.eu_w_long_runners * lg(s.long_runners, 50) +
        R.eu_w_advertisers * lg(s.advertisers, 30) +
        R.eu_w_reach * lg(s.total_reach, 10_000_000) +
        R.eu_w_momentum * Math.min(1, s.new_ads_7d / 20))
  );
  const classification: NicheClass = score >= R.eu_validated_min ? 'VALIDADO' : score >= R.eu_promising_min ? 'PROMISSOR' : 'FRACO';
  const reason =
    `${s.long_runners} anúncio(s) ativos há 30+ dias, ${s.advertisers} anunciante(s), ` +
    `alcance UE ${s.total_reach.toLocaleString('pt-BR')}, ${s.new_ads_7d} novo(s) em 7 dias.`;
  return { score, classification, reason };
}

const MAX_PAGES_PER_TERM = 3;

/** DATE column value → 'YYYY-MM-DD' (node-pg returns DATE as a local-midnight Date). */
function dateStr(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  const d = v as Date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class MarketEuService {
  constructor(private fetcher: ArchiveFetcher = defaultArchiveFetcher) {}

  async probe() {
    if (!adLibraryToken()) {
      return { status: 'UNCONFIGURED', message: 'Nenhum token configurado (META_AD_LIBRARY_TOKEN ou META_ACCESS_TOKEN).', guidance: GUIDANCE };
    }
    const r = await this.fetcher({ search_terms: 'app', countries: ['DE'], limit: 1 });
    if (r.error) {
      return { status: 'BLOCKED', message: `A Meta recusou o acesso à Biblioteca de Anúncios: ${r.error.message || 'erro'} (código ${r.error.code ?? '?'}).`, guidance: GUIDANCE };
    }
    return { status: 'AVAILABLE', message: 'Acesso à Biblioteca de Anúncios (UE) confirmado.', sample: r.data.length };
  }

  async listNiches(pool: Pool) {
    const today = new Date().toISOString().slice(0, 10);
    const crit = await new CriteriaService().effective(pool);
    const [niches, ads, growth] = await Promise.all([
      pool.query(`SELECT * FROM market_niches ORDER BY is_active DESC, name`),
      pool.query(`SELECT niche_id, page_id, start_date, stop_date, is_active, eu_total_reach FROM market_eu_ads`),
      pool.query(
        `SELECT a.niche_id,
                SUM(COALESCE(cur.eu_total_reach,0) - COALESCE(old.eu_total_reach,0)) AS growth
         FROM market_eu_ads a
         JOIN LATERAL (SELECT eu_total_reach FROM market_eu_ad_snapshots s WHERE s.ad_row_id = a.id ORDER BY observed_date DESC LIMIT 1) cur ON TRUE
         JOIN LATERAL (SELECT eu_total_reach FROM market_eu_ad_snapshots s WHERE s.ad_row_id = a.id AND s.observed_date <= CURRENT_DATE - 7
                       ORDER BY observed_date DESC LIMIT 1) old ON TRUE
         GROUP BY a.niche_id`
      )
    ]);
    const growthBy = new Map<string, number>();
    for (const g of growth.rows) growthBy.set(String(g.niche_id), parseInt(g.growth || '0', 10));
    const stats = new Map<string, NicheStats & { pages: Set<string> }>();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    for (const a of ads.rows) {
      const id = String(a.niche_id);
      const s = stats.get(id) || { ads_total: 0, active_ads: 0, advertisers: 0, long_runners: 0, total_reach: 0, new_ads_7d: 0, reach_growth_7d: 0, pages: new Set<string>() };
      const start = dateStr(a.start_date);
      const stop = dateStr(a.stop_date);
      s.ads_total++;
      if (a.page_id) s.pages.add(String(a.page_id));
      if (a.is_active) {
        s.active_ads++;
        s.total_reach += parseInt(a.eu_total_reach || '0', 10) || 0;
        if (daysRunning(start, stop, true, today) >= 30) s.long_runners++;
      }
      if (start && start >= weekAgo) s.new_ads_7d++;
      stats.set(id, s);
    }
    return niches.rows.map(n => {
      const s = stats.get(String(n.id));
      const st: NicheStats = s
        ? { ads_total: s.ads_total, active_ads: s.active_ads, advertisers: s.pages.size, long_runners: s.long_runners, total_reach: s.total_reach, new_ads_7d: s.new_ads_7d, reach_growth_7d: growthBy.get(String(n.id)) || 0 }
        : { ads_total: 0, active_ads: 0, advertisers: 0, long_runners: 0, total_reach: 0, new_ads_7d: 0, reach_growth_7d: 0 };
      return { ...n, stats: st, ...scoreNiche(st, crit.numbers) };
    }).sort((a: any, b: any) => Number(b.is_active) - Number(a.is_active) || b.score - a.score);
  }

  /** "Ofertas que se sustentam": active ads ordered by days running, then reach. */
  async topAds(pool: Pool, nicheId: string, limit = 30) {
    const today = new Date().toISOString().slice(0, 10);
    const r = await pool.query(
      `SELECT * FROM market_eu_ads WHERE niche_id = $1 ORDER BY is_active DESC, start_date ASC NULLS LAST, eu_total_reach DESC NULLS LAST LIMIT $2`,
      [nicheId, Math.min(100, Math.max(1, limit))]
    );
    return r.rows
      .map(a => {
        const start = dateStr(a.start_date);
        const stop = dateStr(a.stop_date);
        return { ...a, start_date: start, stop_date: stop, days_running: daysRunning(start, stop, a.is_active, today) };
      })
      .sort((a, b) => Number(b.is_active) - Number(a.is_active) || b.days_running - a.days_running || (Number(b.eu_total_reach) || 0) - (Number(a.eu_total_reach) || 0));
  }

  async createNiche(pool: Pool, input: { name: string; search_terms: string[]; countries?: string[]; product_category?: string | null; notes?: string | null }, userId: string | null) {
    const terms = cleanTerms(input.search_terms);
    if (!input.name?.trim() || terms.length === 0) throw new MarketEuError(400, 'Informe o nome do nicho e pelo menos um termo de busca.');
    const countries = cleanCountries(input.countries);
    const r = await pool.query(
      `INSERT INTO market_niches (name, search_terms, countries, product_category, notes, created_by)
       VALUES ($1, $2, COALESCE($3, ARRAY['DE','FR','ES','IT','PT','NL','PL','IE']), $4, $5, $6)
       ON CONFLICT (name) DO UPDATE SET search_terms = EXCLUDED.search_terms, is_active = TRUE, updated_at = NOW()
       RETURNING *`,
      [input.name.trim().slice(0, 120), terms, countries.length ? countries : null, input.product_category || null, input.notes || null, userId]
    );
    return r.rows[0];
  }

  async updateNiche(pool: Pool, id: string, patch: { is_active?: boolean; search_terms?: string[]; countries?: string[] }) {
    const terms = patch.search_terms ? cleanTerms(patch.search_terms) : null;
    const countries = patch.countries ? cleanCountries(patch.countries) : null;
    const r = await pool.query(
      `UPDATE market_niches SET is_active = COALESCE($2, is_active), search_terms = COALESCE($3, search_terms),
              countries = COALESCE($4, countries), updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, typeof patch.is_active === 'boolean' ? patch.is_active : null, terms && terms.length ? terms : null, countries && countries.length ? countries : null]
    );
    if (!r.rows[0]) throw new MarketEuError(404, 'Nicho não encontrado.');
    return r.rows[0];
  }

  /** Collect every active niche (or the given ones). Stops early and marks BLOCKED on an access error. */
  async collect(pool: Pool, opts: { trigger?: string; nicheIds?: string[] } = {}) {
    const run = (await pool.query(`INSERT INTO market_eu_runs (trigger) VALUES ($1) RETURNING id`, [opts.trigger || 'MANUAL'])).rows[0].id;
    const niches = (
      await pool.query(
        `SELECT * FROM market_niches WHERE is_active = TRUE ${opts.nicheIds?.length ? 'AND id = ANY($1::uuid[])' : ''}`,
        opts.nicheIds?.length ? [opts.nicheIds] : []
      )
    ).rows;
    const today = new Date().toISOString().slice(0, 10);
    let requests = 0;
    let upserted = 0;
    let blocked: string | null = null;
    for (const n of niches) {
      for (const term of n.search_terms as string[]) {
        let after: string | null = null;
        for (let page = 0; page < MAX_PAGES_PER_TERM; page++) {
          const res = await this.fetcher({ search_terms: term, countries: n.countries, limit: 100, after });
          requests++;
          if (res.error) {
            blocked = `${res.error.message || 'erro'} (código ${res.error.code ?? '?'})`;
            break;
          }
          for (const raw of res.data) {
            const ad = normalizeEuAd(raw, today);
            if (!ad) continue;
            const row = await pool.query(
              `INSERT INTO market_eu_ads (ad_library_id, niche_id, search_term, page_id, page_name, start_date, stop_date, is_active, eu_total_reach,
                                          languages, platforms, countries, body, title, link_caption, link_description, snapshot_url, target_ages, target_gender)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
               ON CONFLICT (ad_library_id, niche_id) DO UPDATE SET
                 page_name = EXCLUDED.page_name, stop_date = EXCLUDED.stop_date, is_active = EXCLUDED.is_active,
                 eu_total_reach = COALESCE(EXCLUDED.eu_total_reach, market_eu_ads.eu_total_reach), languages = EXCLUDED.languages,
                 platforms = EXCLUDED.platforms, body = COALESCE(EXCLUDED.body, market_eu_ads.body), title = COALESCE(EXCLUDED.title, market_eu_ads.title),
                 link_caption = COALESCE(EXCLUDED.link_caption, market_eu_ads.link_caption), snapshot_url = EXCLUDED.snapshot_url, last_seen_at = NOW()
               RETURNING id`,
              [ad.ad_library_id, n.id, term, ad.page_id, ad.page_name, ad.start_date, ad.stop_date, ad.is_active, ad.eu_total_reach,
               ad.languages, ad.platforms, n.countries, ad.body, ad.title, ad.link_caption, ad.link_description, ad.snapshot_url, ad.target_ages, ad.target_gender]
            );
            await pool.query(
              `INSERT INTO market_eu_ad_snapshots (ad_row_id, observed_date, eu_total_reach, is_active) VALUES ($1, $2, $3, $4)
               ON CONFLICT (ad_row_id, observed_date) DO UPDATE SET eu_total_reach = EXCLUDED.eu_total_reach, is_active = EXCLUDED.is_active`,
              [row.rows[0].id, today, ad.eu_total_reach, ad.is_active]
            );
            upserted++;
          }
          after = res.next;
          if (!after) break;
        }
        if (blocked) break;
      }
      if (blocked) break;
    }
    const status = blocked ? (upserted === 0 ? 'BLOCKED' : 'FAILED') : 'DONE';
    await pool.query(
      `UPDATE market_eu_runs SET status = $2, niches = $3, requests = $4, ads_upserted = $5, error = $6, finished_at = NOW() WHERE id = $1`,
      [run, status, niches.length, requests, upserted, blocked]
    );
    return { run_id: run, status, niches: niches.length, requests, ads_upserted: upserted, error: blocked };
  }

  async latestRun(pool: Pool) {
    const r = await pool.query(`SELECT * FROM market_eu_runs ORDER BY started_at DESC LIMIT 1`);
    return r.rows[0] || null;
  }
}

export class MarketEuError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function cleanTerms(terms: unknown): string[] {
  const list = Array.isArray(terms) ? terms : typeof terms === 'string' ? terms.split(',') : [];
  return [...new Set(list.map(t => String(t).trim()).filter(t => t.length >= 2).map(t => t.slice(0, 100)))].slice(0, 10);
}

function cleanCountries(c: unknown): string[] {
  const list = Array.isArray(c) ? c : [];
  return [...new Set(list.map(x => String(x).trim().toUpperCase()).filter(x => /^[A-Z]{2}$/.test(x)))].slice(0, 27);
}

export const GUIDANCE = [
  'Entre no Facebook com a conta de administrador do app NORQVA e confirme sua identidade em facebook.com/ID (pode levar até 48 h).',
  'Abra facebook.com/ads/library/api e aceite os termos da Biblioteca de Anúncios.',
  'No Graph API Explorer (developers.facebook.com/tools/explorer), selecione o app NORQVA e gere um token de usuário.',
  'No Depurador de token (developers.facebook.com/tools/debug/accesstoken), cole o token e clique em "Estender token de acesso" para ele valer ~60 dias.',
  'No Render, em norqva-staging-api → Environment, crie META_AD_LIBRARY_TOKEN com esse token e salve (o deploy reinicia sozinho).'
];
