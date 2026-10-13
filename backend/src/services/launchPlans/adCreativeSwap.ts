// NORQVA-0056 (contrato "NORQVA-0055 editar anúncio", aprovado em 13/10/2026 16h46): trocar destino, texto, título e botão de um
// anúncio que JÁ ESTÁ na Meta. A Meta não deixa editar a peça de um anúncio existente, então o NORQVA
// cria uma peça nova com o MESMO vídeo, a mesma página/Instagram e as mesmas etiquetas de origem
// (url_tags), e troca a peça dentro do mesmo anúncio. Status, orçamento e público não mudam.
import { Pool } from 'pg';
import { MetaMutatingClient, MetaMutatingSecurityContext } from '../meta/metaMutatingClient';
import { LaunchPlanError, ALLOWED_CTA_TYPES, normalizeMetaIds, humanIdFromUrl } from './launchPlanService';
import { findPriceInFields, priceErrorMessage } from '../creative/priceInCopy';
import { protectedMetaIds } from '../experiments/protectedIds';
import { beginDecision, DecisionContext, DecisionAuditError } from '../../db/decisionEvents';
import { writeAuditLog } from '../../db/audit';

const UUID_RE = /^[0-9a-f-]{36}$/i;
const obj = (v: any) => (v && typeof v === 'object' ? v : typeof v === 'string' ? JSON.parse(v || '{}') : {});

export interface AdSwapInput {
  destination_url?: unknown;
  primary_text?: unknown;
  headline?: unknown;
  cta?: unknown;
  confirm_code?: unknown;
}

export async function replaceAdCreative(
  pool: Pool,
  planId: string,
  adIndex: number,
  input: AdSwapInput,
  user: { id: string | null; email?: string | null },
  decisionCtx: DecisionContext,
  client: MetaMutatingClient
) {
  if (!UUID_RE.test(String(planId || ''))) throw new LaunchPlanError(404, 'Campanha não encontrada.');
  const row = (await pool.query('SELECT * FROM launch_plans WHERE id = $1', [planId])).rows[0];
  if (!row) throw new LaunchPlanError(404, 'Campanha não encontrada.');
  const spec = obj(row.spec);
  const ads: any[] = Array.isArray(spec.ads) ? spec.ads : [];
  if (!Number.isInteger(adIndex) || adIndex < 0 || adIndex >= ads.length) throw new LaunchPlanError(400, 'Anúncio não existe.');
  const ad = ads[adIndex];
  const ids = normalizeMetaIds(row.meta_ids);
  const adId = ids.ads?.[ad.name] ? String(ids.ads[ad.name]) : null;
  if (!adId) throw new LaunchPlanError(409, 'Este anúncio ainda não foi criado na Meta: edite na Configuração, como rascunho.');
  if (protectedMetaIds().has(adId)) throw new LaunchPlanError(403, 'Anúncio protegido (controle): não pode ser alterado.');

  if (String(input.confirm_code || '').trim().toUpperCase() !== String(row.code).toUpperCase()) {
    throw new LaunchPlanError(400, `Para trocar o anúncio na Meta, digite o código da campanha (${row.code}).`);
  }
  const destination = String(input.destination_url ?? ad.destination_url ?? '').trim();
  const body = String(input.primary_text ?? ad.primary_text ?? '').trim();
  const title = String(input.headline ?? ad.headline ?? '').trim();
  const cta = String(input.cta ?? ad.cta ?? 'SEE_DETAILS').trim().toUpperCase();
  if (!body || body.length > 2000) throw new LaunchPlanError(400, 'Informe o texto do anúncio (até 2.000 caracteres).');
  if (!title || title.length > 255) throw new LaunchPlanError(400, 'Informe o título do anúncio (até 255 caracteres).');
  if (!ALLOWED_CTA_TYPES.includes(cta)) throw new LaunchPlanError(400, `Botão inválido (${ALLOWED_CTA_TYPES.join(', ')}).`);
  const hits = findPriceInFields({ primary_text: body, headline: title });
  if (hits.length) throw new LaunchPlanError(400, priceErrorMessage(hits, `Anúncio ${adIndex + 1}`));
  try {
    client.assertUrlWhitelisted(destination);
  } catch {
    throw new LaunchPlanError(400, 'Destino não permitido: use a página da oferta (/p/...) ou do kit (/kit/...) no endereço do NORQVA ou da marca.');
  }
  const newHumanId = humanIdFromUrl(destination);
  if (!newHumanId) throw new LaunchPlanError(400, 'Destino precisa ser a página de uma oferta (/p/...) ou de um kit (/kit/...).');
  const offer = (await pool.query(`SELECT id FROM offers WHERE human_id = $1 AND is_deleted = FALSE AND is_demo = FALSE LIMIT 1`, [newHumanId])).rows[0];
  if (!offer) throw new LaunchPlanError(400, `A oferta ${newHumanId} do link não existe no NORQVA.`);

  let handle;
  try {
    handle = await beginDecision(pool, decisionCtx, {
      action: 'CAMPAIGN_AD_CREATIVE_SWAP',
      decision: `AD:${ad.name}`,
      planId: row.id,
      planCode: row.code,
      metaIds: [adId]
    });
  } catch (err) {
    if (err instanceof DecisionAuditError) throw new LaunchPlanError(503, err.message);
    throw err;
  }

  const ctx: MetaMutatingSecurityContext = { userId: user.id || '', userRole: 'ADMIN', isDemo: false };
  try {
    // a peça atual dá o vídeo, a miniatura, a página/Instagram e as etiquetas de origem
    const adRead = await client.readGraph(`/${adId}`, { fields: 'creative{id}' });
    const oldCreativeId = String(adRead?.creative?.id || ids.creatives?.[ad.name] || '');
    if (!/^\d{5,25}$/.test(oldCreativeId)) throw new Error('Não foi possível ler a peça atual do anúncio na Meta.');
    const old = await client.readGraph(`/${oldCreativeId}`, { fields: 'object_story_spec,url_tags' });
    const story = old?.object_story_spec || {};
    const video = story.video_data || {};
    const videoId = String(video.video_id || ids.videos?.[ad.name] || '');
    if (!/^\d{5,25}$/.test(videoId)) throw new Error('A peça atual não é de vídeo: troca não suportada.');
    const urlTags = String(old?.url_tags || ad.url_tags || '') || undefined;

    const version = Number(obj(row.manual_fields)[`ads.${adIndex}.meta_swaps`] || 0) + 1;
    const created = await client.createAdCreative(
      pool,
      {
        name: `${ad.name}_CREATIVE_V${version + 1}`,
        title,
        body,
        destinationUrl: destination,
        callToAction: cta,
        videoId,
        thumbnailUrl: video.image_url || ad.thumbnail_url || undefined,
        pageId: story.page_id,
        instagramUserId: story.instagram_user_id || undefined,
        urlTags
      } as any,
      ctx
    );
    await client.updateAdCreative(adId, created.externalId, ctx, protectedMetaIds());

    // o plano passa a refletir o que está na Meta
    ads[adIndex] = { ...ad, destination_url: destination, primary_text: body, headline: title, cta };
    spec.ads = ads;
    ids.creatives = { ...(ids.creatives || {}), [ad.name]: created.externalId };
    const manual = obj(row.manual_fields);
    manual[`ads.${adIndex}.meta_swaps`] = version;
    for (const f of ['destination_url', 'primary_text', 'headline', 'cta']) manual[`ads.${adIndex}.${f}`] = true;
    const destIds = Array.from(new Set(ads.map(a => humanIdFromUrl(String(a.destination_url || '')))));
    const nextOffer = destIds.length === 1 && destIds[0] ? destIds[0] : row.offer_human_id;
    await pool.query(
      `UPDATE launch_plans SET spec = $2, meta_ids = $3, manual_fields = $4, offer_human_id = $5, updated_at = NOW() WHERE id = $1`,
      [row.id, JSON.stringify(spec), JSON.stringify(ids), JSON.stringify(manual), nextOffer]
    );
    await pool.query(`UPDATE meta_ads SET meta_creative_id = $2, updated_at = NOW() WHERE meta_ad_id = $1 AND is_demo = FALSE`, [adId, created.externalId]).catch(() => {});

    const result = {
      ad: ad.name,
      ad_id: adId,
      previous_creative_id: oldCreativeId,
      creative_id: created.externalId,
      destination_url: destination,
      previous_destination_url: ad.destination_url || null,
      offer_human_id: nextOffer
    };
    await handle.finish('EXECUTED', { result });
    await writeAuditLog(
      pool,
      user.id,
      'CAMPAIGN_AD_CREATIVE_SWAPPED',
      `Campanha ${row.code}: anúncio ${ad.name} com peça nova na Meta (${created.externalId}); destino ${destination}. Vai para revisão da Meta.`,
      JSON.stringify({ creative_id: oldCreativeId, destination_url: ad.destination_url, primary_text: ad.primary_text, headline: ad.headline, cta: ad.cta }),
      JSON.stringify({ creative_id: created.externalId, destination_url: destination, primary_text: body, headline: title, cta, by: user.email || null }),
      false,
      false
    ).catch(() => {});
    return result;
  } catch (err: any) {
    await handle.finish('FAILED', { error: err });
    if (err instanceof LaunchPlanError) throw err;
    throw new LaunchPlanError(502, `A Meta não aceitou a troca; o anúncio continua com a peça antiga. ${String(err?.message || err).slice(0, 300)}`);
  }
}
