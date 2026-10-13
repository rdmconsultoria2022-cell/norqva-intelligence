// NORQVA-0056 (contrato "NORQVA-0055 editar anúncio", aprovado em 13/10/2026 16h46): trocar destino, texto,
// título e botão de um anúncio que JÁ ESTÁ na Meta. A Meta não deixa editar a peça de um anúncio existente,
// então o NORQVA cria uma peça nova com o MESMO vídeo, a mesma página/Instagram e as mesmas etiquetas de
// origem (url_tags), e troca a peça dentro do mesmo anúncio. Status, orçamento e público não mudam.
import { Pool } from 'pg';
import { MetaMutatingClient, MetaMutatingSecurityContext, CreateAdCreativeParams } from '../meta/metaMutatingClient';
import { LaunchPlanError, ALLOWED_CTA_TYPES, normalizeMetaIds, humanIdFromUrl } from './launchPlanService';
import { findPriceInFields, priceErrorMessage } from '../creative/priceInCopy';
import { protectedMetaIds } from '../experiments/protectedIds';
import { beginDecision, DecisionContext, DecisionAuditError, DecisionHandle } from '../../db/decisionEvents';
import { writeAuditLog } from '../../db/audit';

const UUID_RE = /^[0-9a-f-]{36}$/i;
const META_ID_RE = /^\d{5,25}$/;
const obj = (v: any) => (v && typeof v === 'object' ? v : typeof v === 'string' ? JSON.parse(v || '{}') : {});

export interface AdSwapInput {
  destination_url?: unknown;
  primary_text?: unknown;
  headline?: unknown;
  cta?: unknown;
  confirm_code?: unknown;
}

async function brandAsset(pool: Pool, brandId: string | null, type: 'FACEBOOK_PAGE' | 'INSTAGRAM'): Promise<string | null> {
  if (!brandId) return null;
  const r = await pool.query(
    `SELECT external_id FROM brand_meta_assets WHERE brand_id = $1 AND asset_type = $2 AND external_id IS NOT NULL
       AND status IN ('LINKED', 'VERIFIED') LIMIT 1`,
    [brandId, type]
  );
  return r.rows[0]?.external_id ? String(r.rows[0].external_id) : null;
}

/** Peça que a troca não sabe recriar sem perder conteúdo (dinâmica, post existente, imagem). */
export class UnsupportedCreativeError extends Error {}

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
  if (row.status === 'CREATING') throw new LaunchPlanError(409, 'A campanha ainda está sendo criada na Meta: espere terminar.');
  const spec = obj(row.spec);
  const ads: any[] = Array.isArray(spec.ads) ? spec.ads : [];
  if (!Number.isInteger(adIndex) || adIndex < 0 || adIndex >= ads.length) throw new LaunchPlanError(400, 'Anúncio não existe.');
  const ad = ads[adIndex];
  const ids = normalizeMetaIds(row.meta_ids);
  const adId = ids.ads?.[ad.name] ? String(ids.ads[ad.name]) : null;
  if (!adId) throw new LaunchPlanError(409, 'Este anúncio ainda não foi criado na Meta: edite na Configuração, como rascunho.');
  // controle: nem o anúncio, nem o conjunto, nem a campanha podem estar protegidos
  const prot = protectedMetaIds();
  const planIds = [adId, ...Object.values(ids.campaign || {}), ...Object.values(ids.adsets || {})].map(String);
  if (planIds.some(id => prot.has(id))) throw new LaunchPlanError(403, 'Anúncio protegido (controle): não pode ser alterado.');

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

  let handle: DecisionHandle;
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
  const version = Number(ad.meta_swaps || 0) + 1;
  let oldCreativeId = '';
  let newCreativeId = '';
  let swapSent = false;
  try {
    // 1) a peça atual dá o vídeo, a miniatura, a página/Instagram e as etiquetas de origem
    const adRead = await client.readGraph(`/${adId}`, { fields: 'creative{id}' });
    oldCreativeId = String(adRead?.creative?.id || ids.creatives?.[ad.name] || '');
    if (!META_ID_RE.test(oldCreativeId)) throw new Error('Não foi possível ler a peça atual do anúncio na Meta.');
    const old = await client.readGraph(`/${oldCreativeId}`, { fields: 'object_story_spec,url_tags,asset_feed_spec,object_story_id' });
    const story = old?.object_story_spec || {};
    const video = story.video_data;
    if (old?.asset_feed_spec || !video) {
      throw new UnsupportedCreativeError('Esta peça não é um vídeo simples (peça dinâmica, post existente ou imagem): troque pelo Gerenciador de Anúncios da Meta.');
    }
    const videoId = String(video.video_id || '');
    if (!META_ID_RE.test(videoId)) throw new UnsupportedCreativeError('A peça atual não tem vídeo identificável: troque pelo Gerenciador de Anúncios da Meta.');
    const pageId = story.page_id || spec.page_id || (await brandAsset(pool, row.brand_id, 'FACEBOOK_PAGE'));
    if (!pageId) throw new UnsupportedCreativeError('Não foi possível saber a Página do Facebook do anúncio.');
    const instagramUserId = story.instagram_user_id || story.instagram_actor_id || spec.instagram_id || (await brandAsset(pool, row.brand_id, 'INSTAGRAM')) || undefined;
    let thumbnailUrl: string | undefined = video.image_url || ad.thumbnail_url || undefined;
    const imageHash: string | undefined = video.image_hash || undefined;
    if (!thumbnailUrl && !imageHash) {
      const v = await client.readGraph(`/${videoId}`, { fields: 'picture' }).catch(() => null);
      thumbnailUrl = v?.picture || undefined;
    }
    if (!thumbnailUrl && !imageHash) throw new UnsupportedCreativeError('Não foi possível obter a miniatura do vídeo.');
    const urlTags = String(old?.url_tags || ad.url_tags || '') || undefined;

    // 2) peça nova (nasce sem status: não ativa nem pausa nada)
    const params: CreateAdCreativeParams = {
      name: `${ad.name}_CREATIVE_V${version + 1}`,
      title,
      body,
      destinationUrl: destination,
      callToAction: cta,
      videoId,
      thumbnailUrl,
      imageHash,
      pageId: String(pageId),
      instagramUserId: instagramUserId ? String(instagramUserId) : undefined,
      urlTags
    };
    const created = await client.createAdCreative(pool, params, ctx);
    newCreativeId = created.externalId;

    // 3) troca dentro do mesmo anúncio
    swapSent = true;
    await client.updateAdCreative(adId, newCreativeId, ctx, prot);
  } catch (err: any) {
    // a troca pode ter chegado à Meta mesmo com erro (tempo esgotado): confere antes de dizer o que ficou
    let current = '';
    if (swapSent) {
      current = String((await client.readGraph(`/${adId}`, { fields: 'creative{id}' }).catch(() => null))?.creative?.id || '');
    }
    if (!(swapSent && newCreativeId && current === newCreativeId)) {
      await handle.finish('FAILED', { error: err, result: { created_creative_id: newCreativeId || null, current_creative_id: current || null } });
      if (err instanceof LaunchPlanError) throw err;
      if (err instanceof UnsupportedCreativeError) throw new LaunchPlanError(400, err.message);
      const orphan = newCreativeId ? ` (peça ${newCreativeId} criada e não usada)` : '';
      const what =
        swapSent && !current
          ? 'não foi possível confirmar se a troca aconteceu: confira no Gerenciador antes de tentar de novo'
          : 'o anúncio continua com a peça antiga';
      throw new LaunchPlanError(502, `A Meta não aceitou a troca; ${what}${orphan}. ${String(err?.message || err).slice(0, 300)}`);
    }
    // a troca chegou à Meta: segue como sucesso
  }

  // 4) o plano passa a refletir o que está na Meta (a troca já aconteceu: falha aqui não desfaz nada)
  const previousOffer = row.offer_human_id;
  ads[adIndex] = { ...ad, destination_url: destination, primary_text: body, headline: title, cta, meta_swaps: version };
  spec.ads = ads;
  ids.creatives = { ...(ids.creatives || {}), [ad.name]: newCreativeId };
  const manual = obj(row.manual_fields);
  for (const f of ['destination_url', 'primary_text', 'headline', 'cta']) manual[`ads.${adIndex}.${f}`] = true;
  const destIds = Array.from(new Set(ads.map(a => humanIdFromUrl(String(a.destination_url || '')))));
  const nextOffer = destIds.length === 1 && destIds[0] ? destIds[0] : previousOffer;
  const result = {
    ad: ad.name,
    ad_id: adId,
    previous_creative_id: oldCreativeId,
    creative_id: newCreativeId,
    destination_url: destination,
    previous_destination_url: ad.destination_url || null,
    offer_human_id: nextOffer,
    previous_offer_human_id: previousOffer,
    mixed_offers: destIds.length > 1,
    plan_sync_failed: false
  };
  try {
    await pool.query(
      `UPDATE launch_plans SET spec = $2, meta_ids = $3, manual_fields = $4, offer_human_id = $5, updated_at = NOW() WHERE id = $1`,
      [row.id, JSON.stringify(spec), JSON.stringify(ids), JSON.stringify(manual), nextOffer]
    );
  } catch (err) {
    console.error('[AD SWAP] plano não atualizado depois da troca na Meta', err);
    result.plan_sync_failed = true;
  }
  await pool.query(`UPDATE meta_ads SET meta_creative_id = $2, updated_at = NOW() WHERE meta_ad_id = $1 AND is_demo = FALSE`, [adId, newCreativeId]).catch(() => {});
  await handle.finish('EXECUTED', { result }).catch(() => {});
  await writeAuditLog(
    pool,
    user.id,
    'CAMPAIGN_AD_CREATIVE_SWAPPED',
    `Campanha ${row.code}: anúncio ${ad.name} com peça nova na Meta (${newCreativeId}); destino ${destination}. Vai para revisão da Meta.` +
      (result.plan_sync_failed ? ' ATENÇÃO: o plano no NORQVA não foi atualizado.' : ''),
    JSON.stringify({ creative_id: oldCreativeId, destination_url: ad.destination_url, primary_text: ad.primary_text, headline: ad.headline, cta: ad.cta, offer_human_id: previousOffer }),
    JSON.stringify({ creative_id: newCreativeId, destination_url: destination, primary_text: body, headline: title, cta, offer_human_id: nextOffer, by: user.email || null }),
    false,
    false
  ).catch(() => {});
  return result;
}
