// NORQVA-0050: trazer o vídeo de um criativo importado da Meta (sem o arquivo no NORQVA).
// Só LEITURA na Meta: pega o vídeo do anúncio ligado ao criativo e anexa o link do arquivo ao criativo.
// Depois o operador aprova normalmente na tela Criativos (a aprovação continua obrigatória).
import { Pool } from 'pg';
import { CreativeFactoryError, CreativeFactoryService } from './creativeFactoryService';

export interface GraphReader {
  readGraph(endpoint: string, params?: Record<string, string>): Promise<any>;
}

const AD_ID_RE = /^[0-9]{5,30}$/;

export async function fetchCreativeVideoFromMeta(
  pool: Pool,
  service: CreativeFactoryService,
  creativeId: string,
  userId: string | null,
  graph: GraphReader
) {
  const c = await pool.query(`SELECT * FROM creatives WHERE id = $1 AND is_demo = FALSE AND is_deleted = FALSE`, [creativeId]);
  const cr = c.rows[0];
  if (!cr) throw new CreativeFactoryError(404, 'Criativo não encontrado.');
  if (cr.format !== 'VIDEO') throw new CreativeFactoryError(409, 'Este criativo não é vídeo.');
  const ads = await pool.query(`SELECT meta_ad_id FROM creative_meta_ads WHERE creative_id = $1 ORDER BY created_at DESC`, [creativeId]);
  const adIds = ads.rows.map((r: any) => String(r.meta_ad_id)).filter(id => AD_ID_RE.test(id));
  if (!adIds.length) throw new CreativeFactoryError(409, 'Este criativo não está ligado a nenhum anúncio da Meta. Use "Ligar anúncio" primeiro.');

  let lastProblem = 'O anúncio da Meta não tem vídeo.';
  for (const adId of adIds) {
    let ad: any;
    try {
      ad = await graph.readGraph(`/${adId}`, { fields: 'creative{video_id,object_story_spec,asset_feed_spec}' });
    } catch (e: any) {
      lastProblem = /META CONFIG|ACCESS_TOKEN|permission|OAuth/i.test(String(e?.message || ''))
        ? 'O NORQVA está sem acesso de leitura à conta da Meta (token). Confira a conexão com a Meta em Configurações.'
        : 'Não foi possível ler o anúncio na Meta agora. Tente de novo em instantes.';
      continue;
    }
    const cre = ad?.creative || {};
    const videoId = cre.video_id || cre.object_story_spec?.video_data?.video_id || cre.asset_feed_spec?.videos?.[0]?.video_id || null;
    if (!videoId || !AD_ID_RE.test(String(videoId))) continue;
    let video: any;
    try {
      video = await graph.readGraph(`/${videoId}`, { fields: 'source' });
    } catch {
      lastProblem = 'A Meta não liberou o arquivo do vídeo para esta conta.';
      continue;
    }
    const source = typeof video?.source === 'string' ? video.source : '';
    if (!/^https:\/\//i.test(source)) {
      lastProblem = 'A Meta não devolveu o link do arquivo do vídeo.';
      continue;
    }
    const updated = await service.attachFile(pool, creativeId, source, userId, false);
    return { creative: updated, meta_ad_id: adId, video_id: String(videoId) };
  }
  throw new CreativeFactoryError(409, lastProblem);
}
