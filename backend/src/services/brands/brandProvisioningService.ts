import { Pool } from 'pg';
import { MetaMutatingClient, MetaMutatingSecurityContext, getMetaBusinessId } from '../meta/metaMutatingClient';
import { BrandError } from './brandService';
import { writeAuditLog } from '../../db/audit';

// NORQVA-0018 (fase C): provisionamento e conferência de ativos Meta de marca (D-0009).
// - Pixel: criado pela API no portfólio, só com clique do ADMIN e as travas da D-0007.
// - Página, Instagram, Pixel: conferidos pela API. VERIFIED só quando a Meta confirma o vínculo.
// - O pixel só passa a receber vendas quando o operador liga o roteamento (routing_enabled).

const creating = new Set<string>();

const clip = (v: unknown) => String((v as any)?.message || v || '').slice(0, 500);

async function getBrand(pool: Pool, brandId: string) {
  const b = (await pool.query(`SELECT * FROM brands WHERE id = $1`, [brandId])).rows[0];
  if (!b) throw new BrandError(404, 'Marca não encontrada.');
  return b;
}

async function getAsset(pool: Pool, brandId: string, type: string) {
  return (await pool.query(`SELECT * FROM brand_meta_assets WHERE brand_id = $1 AND asset_type = $2`, [brandId, type])).rows[0] || null;
}

async function upsertAsset(pool: Pool, brandId: string, type: string, fields: { external_id?: string | null; status: string; created_by?: string | null; last_error?: string | null; verified?: boolean }) {
  await pool.query(
    `INSERT INTO brand_meta_assets (brand_id, asset_type, external_id, status, created_by, last_error, verified_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (brand_id, asset_type) DO UPDATE SET
       external_id = COALESCE(EXCLUDED.external_id, brand_meta_assets.external_id),
       status = EXCLUDED.status,
       created_by = COALESCE(EXCLUDED.created_by, brand_meta_assets.created_by),
       last_error = EXCLUDED.last_error,
       verified_at = COALESCE(EXCLUDED.verified_at, brand_meta_assets.verified_at),
       updated_at = NOW()`,
    [brandId, type, fields.external_id ?? null, fields.status, fields.created_by ?? null, fields.last_error ?? null, fields.verified ? new Date() : null]
  );
}

export type VerifyResult = { asset_type: string; status: string; ok: boolean; detail: string };

export class BrandProvisioningService {
  constructor(private client: MetaMutatingClient = new MetaMutatingClient()) {}

  /** Cria o pixel da marca no portfólio e confere a posse. Nunca cria um segundo pixel. */
  async provisionPixel(pool: Pool, brandId: string, ctx: MetaMutatingSecurityContext) {
    const brand = await getBrand(pool, brandId);
    const current = await getAsset(pool, brandId, 'PIXEL');
    if (current?.external_id) throw new BrandError(409, 'Esta marca já tem um pixel registrado.');
    if (creating.has(brandId)) throw new BrandError(409, 'A criação do pixel já está em andamento.');
    creating.add(brandId);
    const businessId = getMetaBusinessId();
    try {
      let pixelId: string;
      try {
        pixelId = (await this.client.createBusinessPixel(ctx, businessId, `${brand.name} (NORQVA)`)).id;
      } catch (err) {
        // Só erro vindo da Meta vira FAILED. Travas locais (flag, preflight, papel) não mudam o ativo.
        const msg = clip(err);
        if (msg.includes('[META GRAPH API ERROR]') || msg.includes('[META TIMEOUT EXCEPTION]')) {
          await upsertAsset(pool, brandId, 'PIXEL', { status: 'FAILED', created_by: 'API', last_error: msg });
        }
        await writeAuditLog(pool, ctx.userId || null, 'BRAND_PIXEL_CREATE_FAILED', `Falha ao criar pixel da marca ${brand.name}`, null, clip(err), false).catch(() => {});
        throw err;
      }
      await upsertAsset(pool, brandId, 'PIXEL', { external_id: pixelId, status: 'LINKED', created_by: 'API' });
      await writeAuditLog(pool, ctx.userId || null, 'BRAND_PIXEL_CREATED', `Pixel ${pixelId} criado para a marca ${brand.name}`, null, pixelId, false).catch(() => {});

      let shared = false;
      try {
        shared = await this.client.shareBusinessPixelWithAdAccount(ctx, pixelId, businessId);
      } catch (err) {
        await pool.query(`UPDATE brand_meta_assets SET last_error = $3 WHERE brand_id = $1 AND asset_type = $2`, [brandId, 'PIXEL', `Pixel criado, mas não compartilhado com a conta de anúncios: ${clip(err)}`]);
      }
      const verify = await this.verifyAssets(pool, brandId, ['PIXEL']);
      return { pixel_id: pixelId, shared_with_ad_account: shared, verify };
    } finally {
      creating.delete(brandId);
    }
  }

  /** Confere pela API os ativos com ID. Só leitura. Um erro de leitura não rebaixa o status. */
  async verifyAssets(pool: Pool, brandId: string, only?: string[]): Promise<VerifyResult[]> {
    await getBrand(pool, brandId);
    const businessId = getMetaBusinessId();
    const assets = (await pool.query(`SELECT * FROM brand_meta_assets WHERE brand_id = $1`, [brandId])).rows;
    const byType = (t: string) => assets.find(a => a.asset_type === t && a.external_id);
    const results: VerifyResult[] = [];

    const check = async (type: string, fn: () => Promise<{ ok: boolean; detail: string }>) => {
      const a = byType(type);
      if (!a || (only && !only.includes(type))) return;
      try {
        const r = await fn();
        if (r.ok) await upsertAsset(pool, brandId, type, { status: 'VERIFIED', verified: true, last_error: null });
        else await upsertAsset(pool, brandId, type, { status: 'LINKED', last_error: r.detail });
        results.push({ asset_type: type, status: r.ok ? 'VERIFIED' : 'LINKED', ok: r.ok, detail: r.detail });
      } catch (err) {
        await pool.query(`UPDATE brand_meta_assets SET last_error = $3, updated_at = NOW() WHERE brand_id = $1 AND asset_type = $2`, [brandId, type, `Não foi possível conferir: ${clip(err)}`]);
        results.push({ asset_type: type, status: a.status, ok: false, detail: `Não foi possível conferir: ${clip(err)}` });
      }
    };

    await check('FACEBOOK_PAGE', async () => {
      const pageId = byType('FACEBOOK_PAGE').external_id;
      let after: string | undefined;
      for (let i = 0; i < 10; i++) {
        const res = await this.client.readGraph(`/${businessId}/owned_pages`, { fields: 'id', limit: '100', ...(after ? { after } : {}) });
        if ((res?.data || []).some((p: any) => String(p.id) === pageId)) return { ok: true, detail: 'Página pertence ao portfólio.' };
        after = res?.paging?.cursors?.after;
        if (!res?.paging?.next || !after) break;
      }
      return { ok: false, detail: 'Página não encontrada entre as Páginas do portfólio.' };
    });

    await check('INSTAGRAM', async () => {
      const page = byType('FACEBOOK_PAGE');
      if (!page) return { ok: false, detail: 'Registre a Página antes de conferir o Instagram.' };
      const res = await this.client.readGraph(`/${page.external_id}`, { fields: 'instagram_business_account' });
      const linked = res?.instagram_business_account?.id ? String(res.instagram_business_account.id) : null;
      return linked === byType('INSTAGRAM').external_id
        ? { ok: true, detail: 'Instagram conectado à Página.' }
        : { ok: false, detail: linked ? `A Página está conectada a outro Instagram (${linked}).` : 'A Página não tem Instagram conectado.' };
    });

    await check('PIXEL', async () => {
      const res = await this.client.readGraph(`/${byType('PIXEL').external_id}`, { fields: 'id,owner_business' });
      const owner = res?.owner_business?.id ? String(res.owner_business.id) : null;
      return owner === businessId
        ? { ok: true, detail: 'Pixel pertence ao portfólio.' }
        : { ok: false, detail: owner ? `Pixel pertence a outro portfólio (${owner}).` : 'Não foi possível confirmar o dono do pixel.' };
    });

    return results;
  }

  /** Liga ou desliga o envio de vendas ao pixel da marca. Ligar exige pixel VERIFIED. */
  async setPixelRouting(pool: Pool, brandId: string, enabled: boolean, userId: string | null) {
    const brand = await getBrand(pool, brandId);
    const pixel = await getAsset(pool, brandId, 'PIXEL');
    if (!pixel?.external_id) throw new BrandError(409, 'Esta marca ainda não tem pixel.');
    if (enabled && pixel.status !== 'VERIFIED') throw new BrandError(409, 'Confira o pixel antes de ativar (precisa estar verificado).');
    await pool.query(`UPDATE brand_meta_assets SET routing_enabled = $3, updated_at = NOW() WHERE brand_id = $1 AND asset_type = $2`, [brandId, 'PIXEL', enabled]);
    await writeAuditLog(
      pool, userId, 'BRAND_PIXEL_ROUTING_CHANGED',
      `Vendas da marca ${brand.name} ${enabled ? 'passam a ir para o pixel da marca' : 'voltam ao pixel padrão'} (${pixel.external_id})`,
      String(!!pixel.routing_enabled), String(enabled), false
    ).catch(() => {});
    return { pixel_id: pixel.external_id, routing_enabled: enabled };
  }
}
