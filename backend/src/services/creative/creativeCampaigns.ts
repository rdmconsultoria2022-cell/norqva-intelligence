import { Pool } from 'pg';

// NORQVA-0011: which Meta campaigns each creative runs in. Deterministic only:
// a manual link (creative_meta_ads) or a Meta ad whose name equals the creative key
// (utm_content_key or human_id, case-insensitive).

export interface CreativeCampaign {
  meta_campaign_id: string;
  name: string;
  status: string | null;
  meta_ad_ids: string[];
}

export async function campaignsForCreatives(
  pool: Pool,
  isDemo: boolean,
  creatives: { id: string; human_id?: string | null; utm_content_key?: string | null }[]
): Promise<Map<string, CreativeCampaign[]>> {
  const out = new Map<string, CreativeCampaign[]>();
  if (creatives.length === 0) return out;

  const [adsRes, linksRes] = await Promise.all([
    pool.query(
      `SELECT ma.meta_ad_id, ma.name, mc.meta_campaign_id, mc.name AS campaign_name, mc.status AS campaign_status
       FROM meta_ads ma
       JOIN meta_ad_sets mas ON mas.id = ma.adset_id
       JOIN meta_campaigns mc ON mc.id = mas.campaign_id
       WHERE ma.is_demo = $1`,
      [isDemo]
    ),
    pool.query(`SELECT creative_id, meta_ad_id FROM creative_meta_ads`)
  ]);

  const adsByName = new Map<string, any[]>();
  const adById = new Map<string, any>();
  for (const a of adsRes.rows) {
    adById.set(String(a.meta_ad_id), a);
    const k = String(a.name || '').trim().toLowerCase();
    if (!k) continue;
    if (!adsByName.has(k)) adsByName.set(k, []);
    adsByName.get(k)!.push(a);
  }
  const linkedByCreative = new Map<string, string[]>();
  for (const l of linksRes.rows) {
    const k = String(l.creative_id);
    if (!linkedByCreative.has(k)) linkedByCreative.set(k, []);
    linkedByCreative.get(k)!.push(String(l.meta_ad_id));
  }

  for (const c of creatives) {
    const ads = new Map<string, any>();
    for (const key of [c.utm_content_key, c.human_id]) {
      const k = String(key || '').trim().toLowerCase();
      if (!k) continue;
      for (const a of adsByName.get(k) || []) ads.set(String(a.meta_ad_id), a);
    }
    for (const id of linkedByCreative.get(String(c.id)) || []) {
      const a = adById.get(id);
      if (a) ads.set(id, a);
    }
    const byCampaign = new Map<string, CreativeCampaign>();
    for (const a of ads.values()) {
      const cid = String(a.meta_campaign_id);
      if (!byCampaign.has(cid)) {
        byCampaign.set(cid, { meta_campaign_id: cid, name: a.campaign_name, status: a.campaign_status || null, meta_ad_ids: [] });
      }
      byCampaign.get(cid)!.meta_ad_ids.push(String(a.meta_ad_id));
    }
    // Active campaigns first
    out.set(
      String(c.id),
      [...byCampaign.values()].sort((x, y) => Number(y.status === 'ACTIVE') - Number(x.status === 'ACTIVE'))
    );
  }
  return out;
}
