import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { MetaClient } from '../services/meta/metaClient';

// NORQVA-0036: prévia oficial do anúncio na tela Criativos (só leitura). A prévia é gerada pela Meta na hora
// e guardada 1 h em memória para não gastar o limite de consultas. Só anúncios sincronizados da conta.

export const PREVIEW_FORMATS: Record<string, string> = {
  INSTAGRAM_STANDARD: 'Instagram feed',
  INSTAGRAM_STORY: 'Instagram Stories',
  MOBILE_FEED_STANDARD: 'Facebook feed'
};
const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; src: string | null }>();
export const clearPreviewCache = () => cache.clear();

export async function getAdPreview(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const adId = String(req.params.adId || '');
  const format = String(req.query.format || 'INSTAGRAM_STANDARD');
  if (!/^\d{5,25}$/.test(adId)) return res.status(400).json({ error: 'Anúncio inválido.' });
  if (!PREVIEW_FORMATS[format]) return res.status(400).json({ error: 'Formato de prévia inválido.' });
  try {
    const r = await pool.query(
      `SELECT ma.meta_ad_id, acc.meta_account_id
       FROM meta_ads ma
       JOIN meta_ad_sets mas ON mas.id = ma.adset_id
       JOIN meta_campaigns mc ON mc.id = mas.campaign_id
       JOIN meta_ad_accounts acc ON acc.id = mc.ad_account_id
       WHERE ma.meta_ad_id = $1 AND ma.is_demo = FALSE
       LIMIT 1`,
      [adId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Anúncio não encontrado entre os sincronizados da conta.' });
    const act = String(r.rows[0].meta_account_id || '').replace(/^act_/, '');
    const manager_url = act
      ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(act)}&selected_ad_ids=${encodeURIComponent(adId)}`
      : null;

    const key = `${adId}:${format}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) {
      return res.status(200).json({ ad_id: adId, format, src: hit.src, manager_url, cached: true });
    }
    let src: string | null = null;
    try {
      src = await new MetaClient().getAdPreview(adId, format);
    } catch (e: any) {
      console.warn('[META] prévia indisponível', adId, format, e?.message);
      return res.status(200).json({ ad_id: adId, format, src: null, manager_url, error: 'A Meta não gerou a prévia agora. Tente de novo em instantes ou abra no Gerenciador.' });
    }
    cache.set(key, { at: Date.now(), src });
    return res.status(200).json({ ad_id: adId, format, src, manager_url, cached: false });
  } catch (e: any) {
    console.error('ad preview', e?.message);
    return res.status(500).json({ error: 'Não foi possível buscar a prévia.' });
  }
}
