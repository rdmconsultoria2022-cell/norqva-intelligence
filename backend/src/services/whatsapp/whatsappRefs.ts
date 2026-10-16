// NORQVA-0054 (contrato NORQVA-0053 item 3, D-0053): página → WhatsApp → pagamento.
// A página pede um código de origem; a mensagem pronta do WhatsApp leva o código; quando a pessoa
// escreve, a conversa fica ligada à origem (campanha, anúncio, clique) e o pedido herda tudo.
import crypto from 'crypto';
import { Pool } from 'pg';
import { getWhatsAppProvider } from './provider';
import { cloudSendEnabled, allowedCloudEnvironments } from './metaCloudProvider';

// sem letras/números que se confundem (O/0, I/1, L)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REF_CODE_RE = /c[oó]digo\s*[:#-]?\s*([A-HJ-KM-NP-Z2-9]{6})(?![A-Za-z0-9])/i;
/** A origem vale para pedidos feitos até 28 dias depois do clique (janela de atribuição). */
export const REF_MAX_AGE_DAYS = 28;

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export function newRefCode(): string {
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/**
 * Número do WhatsApp que atende esta oferta agora (conectado e com o atendente ligado), ou null.
 * NORQVA-0079: só aparece número que consegue responder — Evolution só se estiver ligada; oficial só de conta
 * PRODUCTION conferida, com o envio liberado. Número de teste nunca aparece para cliente.
 */
export async function whatsappNumberForOffer(pool: Pool, offerId: string): Promise<{ id: string; phone: string } | null> {
  const evolutionOn = !!getWhatsAppProvider();
  const officialOn = cloudSendEnabled() && allowedCloudEnvironments().has('PRODUCTION');
  if (!evolutionOn && !officialOn) return null;
  const r = await pool.query(
    `WITH o AS (
       SELECT o.id, p.brand_id FROM offers o JOIN products p ON p.id = o.product_id
       WHERE o.id = $1 AND o.status = 'ATIVA' AND o.is_demo = FALSE AND o.is_deleted = FALSE AND p.is_deleted = FALSE
     )
     SELECT n.id, n.phone FROM whatsapp_numbers n
     LEFT JOIN whatsapp_cloud_accounts a ON a.id = n.cloud_account_id
     CROSS JOIN o
     WHERE n.is_deleted = FALSE AND n.status = 'CONNECTED' AND n.bot_enabled = TRUE
       AND ((COALESCE(n.provider, 'EVOLUTION') = 'EVOLUTION' AND $2::boolean)
            OR (n.provider = 'META_CLOUD' AND $3::boolean AND a.environment = 'PRODUCTION' AND a.status = 'VERIFIED' AND a.is_deleted = FALSE))
       AND n.phone IS NOT NULL AND n.phone <> ''
       AND (n.brand_id IS NULL OR n.brand_id = o.brand_id)
       -- a oferta precisa estar no catálogo que o atendente desse número enxerga (loadCatalog: 20 mais antigas)
       AND o.id IN (
         SELECT o2.id FROM offers o2 JOIN products p2 ON p2.id = o2.product_id
         WHERE o2.status = 'ATIVA' AND o2.is_demo = FALSE AND o2.is_deleted = FALSE AND p2.is_deleted = FALSE
           AND (n.brand_id IS NULL OR p2.brand_id = n.brand_id)
         ORDER BY o2.created_at ASC LIMIT 20
       )
     ORDER BY (n.brand_id IS NULL) ASC,
              (SELECT COUNT(*) FROM whatsapp_conversations c WHERE c.number_id = n.id AND c.last_message_at > NOW() - INTERVAL '1 day') ASC,
              n.created_at ASC
     LIMIT 1`,
    [offerId, evolutionOn, officialOn]
  );
  const row = r.rows[0];
  if (!row) return null;
  const phone = String(row.phone).replace(/\D/g, '');
  return phone.length >= 10 ? { id: row.id, phone } : null;
}

export class WhatsAppRefError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Cria o código de origem e devolve o link do WhatsApp com a mensagem pronta. */
export async function createWhatsAppRef(pool: Pool, body: any, meta: { ip: string | null; userAgent: string | null }) {
  const humanId = str(body?.offer_human_id, 100);
  if (!humanId) throw new WhatsAppRefError(400, 'Informe a oferta.');
  const o = await pool.query(
    `SELECT id, human_id, name FROM offers WHERE (human_id = $1 OR id::text = $1) AND is_deleted = FALSE AND status = 'ATIVA' AND is_demo = FALSE LIMIT 1`,
    [humanId]
  );
  const offer = o.rows[0];
  if (!offer) throw new WhatsAppRefError(404, 'Oferta não encontrada.');
  const number = await whatsappNumberForOffer(pool, offer.id);
  if (!number) throw new WhatsAppRefError(409, 'WhatsApp indisponível agora. Compre direto na página.');

  // só as chaves conhecidas do clique, com tamanho limitado (JSON nunca cortado no meio)
  const am = body?.attribution_metadata && typeof body.attribution_metadata === 'object' && !Array.isArray(body.attribution_metadata) ? body.attribution_metadata : null;
  const picked: Record<string, string> = {};
  for (const k of ['campaign_id', 'adset_id', 'ad_id', 'placement', 'site_source_name']) {
    const v = am ? str(am[k], 120) : null;
    if (v) picked[k] = v;
  }
  const attribution = Object.keys(picked).length ? JSON.stringify(picked) : null;
  let code = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    code = newRefCode();
    const ins = await pool.query(
      `INSERT INTO whatsapp_refs (code, offer_id, offer_human_id, number_id, visitor_id, session_id, fbclid, fbc, fbp,
                                  utm_source, utm_medium, utm_campaign, utm_content, attribution_metadata,
                                  client_ip_address, client_user_agent, event_source_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17)
       ON CONFLICT (code) DO NOTHING RETURNING id`,
      [
        code, offer.id, offer.human_id, number.id,
        str(body?.visitor_id, 100), str(body?.session_id, 100), str(body?.fbclid, 255), str(body?.fbc, 255), str(body?.fbp, 255),
        str(body?.utm_source, 255), str(body?.utm_medium, 255), str(body?.utm_campaign, 255), str(body?.utm_content, 255),
        attribution,
        meta.ip ? meta.ip.slice(0, 100) : null,
        meta.userAgent ? meta.userAgent.slice(0, 500) : null,
        str(body?.event_source_url, 1000)
      ]
    );
    if (ins.rows.length) break;
    code = '';
  }
  if (!code) throw new WhatsAppRefError(503, 'Tente de novo em instantes.');
  // limpeza: rotina diária do WhatsApp (purgeOldWhatsAppMessages) apaga códigos com mais de 30 dias
  const text = `Olá! Quero o ${offer.name}. (código ${code})`;
  return { code, phone: number.phone, url: `https://wa.me/${number.phone}?text=${encodeURIComponent(text)}`, text };
}

/** Liga a conversa ao código que veio na mensagem (o mais recente vale). */
export async function linkRefFromText(pool: Pool, conversationId: string, numberId: string, text: string): Promise<string | null> {
  const m = String(text || '').match(REF_CODE_RE);
  if (!m) return null;
  const code = m[1].toUpperCase();
  const r = await pool.query(
    `UPDATE whatsapp_refs SET conversation_id = $1, used_at = COALESCE(used_at, NOW())
     WHERE code = $2 AND number_id = $3
       AND (conversation_id IS NULL OR conversation_id = $1)
       AND created_at > NOW() - ($4::int * INTERVAL '1 day')
     RETURNING id`,
    [conversationId, code, numberId, REF_MAX_AGE_DAYS]
  );
  if (!r.rows.length) return null;
  await pool.query('UPDATE whatsapp_conversations SET ref_id = $2, updated_at = NOW() WHERE id = $1', [conversationId, r.rows[0].id]);
  return r.rows[0].id;
}

/** Origem a gravar no pedido feito pela conversa (ou null se não houver código válido). */
export async function refForConversation(pool: Pool, conversationId: string) {
  const r = await pool.query(
    `SELECT w.* FROM whatsapp_conversations c JOIN whatsapp_refs w ON w.id = c.ref_id
     WHERE c.id = $1 AND w.created_at > NOW() - ($2::int * INTERVAL '1 day')`,
    [conversationId, REF_MAX_AGE_DAYS]
  );
  return r.rows[0] || null;
}
