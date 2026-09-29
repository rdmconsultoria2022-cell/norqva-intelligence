// NORQVA-0017: turns the Graph insights arrays (actions, action_values, video_*_actions, outbound_clicks)
// into flat funnel and video metrics. Meta reports the same conversion under several action types
// (omni_*, plain, offsite_conversion.fb_pixel_*); we take the first available in a fixed priority so
// nothing is counted twice.

export interface ActionMetrics {
  purchases: number;
  purchase_value: number;
  landing_page_views: number;
  initiate_checkouts: number;
  add_to_carts: number;
  outbound_clicks: number;
  video_3s_views: number;
  thruplays: number;
  video_p25: number;
  video_p50: number;
  video_p75: number;
  video_p100: number;
}

export const EMPTY_ACTION_METRICS: ActionMetrics = {
  purchases: 0,
  purchase_value: 0,
  landing_page_views: 0,
  initiate_checkouts: 0,
  add_to_carts: 0,
  outbound_clicks: 0,
  video_3s_views: 0,
  thruplays: 0,
  video_p25: 0,
  video_p50: 0,
  video_p75: 0,
  video_p100: 0
};

const PRIORITY: Record<'purchase' | 'lpv' | 'ic' | 'atc', string[]> = {
  purchase: ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase'],
  lpv: ['omni_landing_page_view', 'landing_page_view'],
  ic: ['omni_initiated_checkout', 'initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout', 'onsite_web_initiate_checkout'],
  atc: ['omni_add_to_cart', 'add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart', 'onsite_web_add_to_cart']
};

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

function toMap(list: unknown): Map<string, number> {
  const m = new Map<string, number>();
  if (!Array.isArray(list)) return m;
  for (const a of list) {
    if (!a || typeof a !== 'object') continue;
    const type = String((a as any).action_type ?? '');
    if (!type) continue;
    m.set(type, (m.get(type) || 0) + num((a as any).value));
  }
  return m;
}

function pick(m: Map<string, number>, keys: string[]): number {
  for (const k of keys) if (m.has(k)) return m.get(k) as number;
  return 0;
}

/** Sum of an array like video_thruplay_watched_actions ([{action_type:'video_view', value}]). */
function sumVideo(list: unknown): number {
  if (!Array.isArray(list)) return 0;
  return list.reduce((s, a) => s + num((a as any)?.value), 0);
}

export function extractActionMetrics(row: any): ActionMetrics {
  if (!row || typeof row !== 'object') return { ...EMPTY_ACTION_METRICS };
  const actions = toMap(row.actions);
  const values = toMap(row.action_values);
  // The purchase value must come from the same action type that gave the count
  const purchaseKey = PRIORITY.purchase.find(k => actions.has(k));
  const purchase_value = purchaseKey && values.has(purchaseKey) ? (values.get(purchaseKey) as number) : pick(values, PRIORITY.purchase);
  const outbound = Array.isArray(row.outbound_clicks) ? sumVideo(row.outbound_clicks) : num(row.outbound_clicks);
  return {
    purchases: pick(actions, PRIORITY.purchase),
    purchase_value: Math.round(purchase_value * 100) / 100,
    landing_page_views: pick(actions, PRIORITY.lpv),
    initiate_checkouts: pick(actions, PRIORITY.ic),
    add_to_carts: pick(actions, PRIORITY.atc),
    outbound_clicks: outbound,
    video_3s_views: actions.get('video_view') || 0,
    thruplays: sumVideo(row.video_thruplay_watched_actions),
    video_p25: sumVideo(row.video_p25_watched_actions),
    video_p50: sumVideo(row.video_p50_watched_actions),
    video_p75: sumVideo(row.video_p75_watched_actions),
    video_p100: sumVideo(row.video_p100_watched_actions)
  };
}

/** Graph fields to request at insights level so extractActionMetrics has what it needs. */
export const ACTION_METRIC_FIELDS = [
  'actions',
  'action_values',
  'outbound_clicks',
  'video_thruplay_watched_actions',
  'video_p25_watched_actions',
  'video_p50_watched_actions',
  'video_p75_watched_actions',
  'video_p100_watched_actions'
];

/** Compact, non-sensitive summary of an ad set's targeting. */
export function summarizeTargeting(t: any): Record<string, unknown> | null {
  if (!t || typeof t !== 'object') return null;
  const geo = t.geo_locations || {};
  const interests = [
    ...(Array.isArray(t.interests) ? t.interests : []),
    ...((Array.isArray(t.flexible_spec) ? t.flexible_spec : []).flatMap((f: any) => (Array.isArray(f?.interests) ? f.interests : [])))
  ];
  return {
    age_min: t.age_min ?? null,
    age_max: t.age_max ?? null,
    genders: Array.isArray(t.genders) ? t.genders : [],
    countries: Array.isArray(geo.countries) ? geo.countries.slice(0, 50) : [],
    interests: interests.slice(0, 30).map((i: any) => String(i?.name ?? i?.id ?? '')).filter(Boolean),
    advantage_audience: t.targeting_automation?.advantage_audience === 1,
    custom_audiences: Array.isArray(t.custom_audiences) ? t.custom_audiences.length : 0
  };
}
