import { OFFICIAL_NORQVA_PIXEL_ID } from '../meta/metaMutatingClient';
import { ALLOWED_CTA_TYPES, LaunchPlanError, LaunchPlanInput, VIDEO_URL_PLACEHOLDER, validateLaunchPlanInput } from '../launchPlans/launchPlanService';
import { BatchCreative } from '../../data/creativeBatches';

// NORQVA-0021 (P3): "ficha da campanha" written by the Creative AI. It becomes a DRAFT launch plan
// (NORQVA-0019) next to the DRAFT creative batch. Nothing is created on Meta here: the plan stays DRAFT,
// videos are TO_BE_FILLED until the creatives are produced and approved, and activation keeps the
// operator flow (H2/H3).

export const DEFAULT_OFFER_BASE_URL = 'https://norqva-intelligence-frontend.vercel.app';

export class LaunchSheetError extends Error {
  constructor(message: string) {
    super(message);
  }
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, n: number) => (v === undefined || v === null ? null : String(v).trim().slice(0, n) || null);

export interface LaunchSheet {
  code: string;
  campaign_name: string;
  objective: 'OUTCOME_SALES';
  event: 'PURCHASE';
  destination_url: string;
  cta_type: string;
  daily_budget_brl: number;
  max_spend_brl: number;
  adsets: { name: string; daily_budget_brl: number; targeting: any; targeting_summary: string | null }[];
  ads: { name: string; adset_name: string; format: string }[];
  excluded_creatives: { key: string; format: string; reason: string }[];
  url_tags_template: string;
  pause_rules: string[];
  hypothesis: string | null;
}

export const urlTagsFor = (campaignCode: string, adName: string) =>
  `utm_source=meta&utm_medium=paid_social&utm_campaign=${campaignCode}&utm_content=${adName}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}`;

/**
 * Builds and validates the DRAFT launch plan from the Creative AI's sheet.
 * Only VIDEO creatives enter the plan (the launch flow publishes video ads); others are listed as excluded.
 * Throws LaunchSheetError with an operator-readable message.
 */
export function buildLaunchFromSheet(
  raw: unknown,
  ctx: { opportunityHumanId: string; offerHumanId: string; creatives: BatchCreative[]; offerBaseUrl?: string }
): { input: LaunchPlanInput; sheet: LaunchSheet } {
  if (!isObj(raw)) throw new LaunchSheetError('launch deve ser um objeto com a ficha da campanha.');
  const code = `${ctx.opportunityHumanId.replace(/-DEMO$/, '')}-L01`;
  const campaignName = str(raw.campaign_name, 120) || `NORQVA_${code.replace(/-/g, '_')}`;
  if (!/^[A-Za-z0-9_|\- ]{3,120}$/.test(campaignName)) throw new LaunchSheetError('campaign_name: use letras, números, espaço, _ - ou | (3 a 120).');

  const cta = String(raw.cta_type || 'SEE_DETAILS').trim().toUpperCase();
  if (!ALLOWED_CTA_TYPES.includes(cta)) throw new LaunchSheetError(`cta_type deve ser um de: ${ALLOWED_CTA_TYPES.join(', ')}.`);

  const base = (ctx.offerBaseUrl || DEFAULT_OFFER_BASE_URL).replace(/\/+$/, '');
  const destination = str(raw.destination_url, 500) || `${base}/p/${ctx.offerHumanId}`;

  const rawAdsets: any[] = Array.isArray(raw.adsets) && raw.adsets.length ? raw.adsets : [{}];
  const adsets = rawAdsets.slice(0, 10).map((a: any, i: number) => {
    const t = isObj(a?.targeting) ? a.targeting : {};
    return {
      name: str(a?.name, 200) || `${code}_AS${String(i + 1).padStart(2, '0')}`,
      daily_budget_brl: Number(a?.daily_budget_brl ?? raw.daily_budget_brl),
      targeting: {
        countries: Array.isArray(t.countries) && t.countries.length ? t.countries : ['BR'],
        age_min: t.age_min ?? 25,
        age_max: t.age_max ?? 65,
        advantage_audience: t.advantage_audience ?? true
      },
      targeting_summary: str(a?.targeting_summary, 300)
    };
  });
  const adsetNames = adsets.map(a => a.name);
  const assign: Record<string, string> = isObj(raw.ad_adset) ? raw.ad_adset : {};

  const video = ctx.creatives.filter(c => c.format === 'VIDEO');
  const excluded = ctx.creatives
    .filter(c => c.format !== 'VIDEO')
    .map(c => ({ key: c.key, format: c.format, reason: 'O plano de lançamento publica só vídeo; este criativo fica só na Fábrica.' }));
  if (video.length === 0) throw new LaunchSheetError('Nenhum criativo VIDEO no plano: o plano de lançamento precisa de ao menos um vídeo.');

  const ads = video.map((c, i) => {
    const wanted = str(assign[c.key], 200);
    const adsetName = wanted && adsetNames.includes(wanted) ? wanted : adsetNames[i % adsetNames.length];
    return {
      name: c.key,
      adset_name: adsetName,
      video_url: VIDEO_URL_PLACEHOLDER,
      thumbnail_url: null,
      primary_text: c.primaryText,
      headline: c.headline,
      cta,
      destination_url: destination,
      url_tags: urlTagsFor(code, c.key)
    };
  });

  const pauseRules = Array.isArray(raw.pause_rules) ? raw.pause_rules.map((r: unknown) => str(r, 300)).filter(Boolean) : [];
  const body = {
    code,
    offer_human_id: ctx.offerHumanId,
    max_spend_brl: Number(raw.max_spend_brl),
    question_text: str(raw.question_text, 500) || `Ativar o teste ${code} (${campaignName}) com até R$ ${Number(raw.max_spend_brl || 0).toFixed(2)} no total?`,
    spec: {
      campaign: { name: campaignName, objective: 'OUTCOME_SALES' },
      pixel_id: OFFICIAL_NORQVA_PIXEL_ID,
      custom_event_type: 'PURCHASE',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      adsets,
      ads,
      pause_rules: pauseRules.length ? pauseRules : ['Pausar anúncio com 2× o CPA de equilíbrio gasto sem venda.', 'Pausar tudo ao atingir o teto de gasto do plano.'],
      hypothesis: str(raw.hypothesis, 1000)
    }
  };

  let input: LaunchPlanInput;
  try {
    input = validateLaunchPlanInput(body);
  } catch (err: any) {
    if (err instanceof LaunchPlanError) throw new LaunchSheetError(`Ficha da campanha: ${err.message}`);
    throw err;
  }
  const sheet: LaunchSheet = {
    code,
    campaign_name: input.spec.campaign.name,
    objective: 'OUTCOME_SALES',
    event: 'PURCHASE',
    destination_url: destination,
    cta_type: cta,
    daily_budget_brl: input.daily_budget_brl,
    max_spend_brl: input.max_spend_brl,
    adsets: input.spec.adsets,
    ads: input.spec.ads.map(a => ({ name: a.name, adset_name: a.adset_name, format: 'VIDEO' })),
    excluded_creatives: excluded,
    url_tags_template: urlTagsFor(code, '<chave do criativo>'),
    pause_rules: input.spec.pause_rules,
    hypothesis: input.spec.hypothesis
  };
  return { input, sheet };
}
