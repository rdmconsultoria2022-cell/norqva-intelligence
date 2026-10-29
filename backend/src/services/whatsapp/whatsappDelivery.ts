// NORQVA-0046 etapa 2: entrega pelo WhatsApp quando o Asaas confirma o pagamento.
// Regras: só pedido PAID com entrega ACTIVE (a confirmação vem do Asaas); só pedido feito pela conversa;
// respeita o "parar" do cliente (o e-mail de acesso continua indo); um envio por pedido, até 3 tentativas;
// nunca lança exceção para quem chama (falha no WhatsApp não afeta o pagamento).
import { Pool } from 'pg';
import { WhatsAppProvider, getWhatsAppProvider } from './provider';
import { providerForNumber } from './cloudAccounts';
import { isCloudProvider, SendBlockedError, CloudApiError } from './metaCloudProvider';
import { isServiceWindowOpen } from './serviceWindow';
import { accessUrlBase, issueAccessToken } from '../purchaseAccessService';
import { recordOutgoing } from './whatsappService';
import { generateStorageSignedUrl } from '../../controllers/api';

export const WHATSAPP_DELIVERY_MAX_ATTEMPTS = 3;
/** NORQVA-0146: envios dos arquivos por pedido (o primeiro depois do PAID e os reenvios), arquivo máximo e validade do link. */
export const WHATSAPP_PDF_MAX_SENDS = 3;
export const WHATSAPP_PDF_MAX_BYTES = 60 * 1024 * 1024;
const PDF_LINK_TTL_SECONDS = 15 * 60;

export type PdfSendOutcome = { ok: true; sent: number; skipped: number } | { ok: false; reason: string };

/** Nome do arquivo para o WhatsApp: o do upload, ou o nome do arquivo no catálogo, sempre terminando em .pdf. */
export function pdfFileName(a: { file_original_name?: string | null; name?: string | null; storage_path?: string | null }): string {
  const raw = String(a.file_original_name || a.name || String(a.storage_path || '').split('/').pop() || 'arquivo').trim();
  const clean = raw.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'arquivo';
  return /\.pdf$/i.test(clean) ? clean : `${clean.replace(/\.[a-z0-9]{1,5}$/i, '')}.pdf`;
}

/** Arquivos das entregas ACTIVE do pedido, sem repetir o mesmo arquivo (ex.: o Dolci no kit e no adicional). */
export async function activeOrderFiles(pool: Pool, orderId: string): Promise<any[]> {
  const r = await pool.query(
    `SELECT DISTINCT ON (a.id) a.id, a.name, a.storage_bucket, a.storage_path, a.file_original_name, a.file_size_bytes, d.created_at AS d_created
     FROM order_deliveries d JOIN digital_assets a ON a.id = d.asset_id
     WHERE d.order_id = $1 AND d.status = 'ACTIVE' AND a.storage_bucket IS NOT NULL AND a.storage_path IS NOT NULL
     ORDER BY a.id, d.created_at ASC`,
    [orderId]
  );
  return r.rows.sort((x: any, y: any) => new Date(x.d_created).getTime() - new Date(y.d_created).getTime());
}

/** Só PDF e até 60 MB (tamanho desconhecido vai). */
export function isSendablePdf(a: any): boolean {
  const pdf = /\.pdf$/i.test(String(a.storage_path || '')) || /\.pdf$/i.test(String(a.file_original_name || ''));
  const big = a.file_size_bytes !== null && a.file_size_bytes !== undefined && Number(a.file_size_bytes) > WHATSAPP_PDF_MAX_BYTES;
  return pdf && !big;
}

/** Quantos PDFs ainda podem ir para o pedido agora (0 quando não pago, sem arquivo elegível ou no limite). */
export async function sendablePdfCount(pool: Pool, orderId: string): Promise<number> {
  const paid = await pool.query(
    `SELECT 1 FROM orders o WHERE o.id = $1 AND o.status = 'PAID'
       AND EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status = 'CONFIRMED')`,
    [orderId]
  );
  if (!paid.rows.length) return 0;
  const used = await pool.query('SELECT COUNT(*)::int AS n FROM whatsapp_pdf_sends WHERE order_id = $1 AND files_sent > 0', [orderId]);
  if (Number(used.rows[0]?.n || 0) >= WHATSAPP_PDF_MAX_SENDS) return 0;
  return (await activeOrderFiles(pool, orderId)).filter(isSendablePdf).length;
}

let lastPdfSend: Promise<unknown> = Promise.resolve();
/** Só para testes: espera o envio dos PDFs que foi disparado em segundo plano depois do PAID. */
export function lastPdfSendForTests(): Promise<unknown> {
  return lastPdfSend;
}

/**
 * NORQVA-0146: manda os PDFs de um pedido PAGO na conversa, como arquivos do WhatsApp.
 * Só entrega ACTIVE (estorno/contestação revogam), no máximo WHATSAPP_PDF_MAX_SENDS por pedido, arquivo até 60 MB
 * (acima disso fica só o link). Os arquivos saem por link assinado de 15 minutos. Nunca lança exceção.
 */
export async function sendOrderPdfs(
  pool: Pool,
  provider: WhatsAppProvider,
  target: { orderId: string; convId: string; jid: string; instanceName: string },
  reason: 'PAID' | 'RESEND'
): Promise<PdfSendOutcome> {
  try {
    if (typeof provider.sendDocument !== 'function') return { ok: false, reason: 'PROVIDER_NO_DOCUMENTS' };
    const paid = await pool.query(
      `SELECT 1 FROM orders o WHERE o.id = $1 AND o.status = 'PAID'
         AND EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status = 'CONFIRMED')`,
      [target.orderId]
    );
    if (!paid.rows.length) return { ok: false, reason: 'NOT_PAID' };
    const used = await pool.query('SELECT COUNT(*)::int AS n FROM whatsapp_pdf_sends WHERE order_id = $1 AND files_sent > 0', [target.orderId]);
    if (Number(used.rows[0]?.n || 0) >= WHATSAPP_PDF_MAX_SENDS) return { ok: false, reason: 'LIMIT' };
    const all = await activeOrderFiles(pool, target.orderId);
    if (!all.length) return { ok: false, reason: 'NO_ACTIVE_DELIVERY' };
    const files = all.filter(isSendablePdf);
    let sent = 0;
    let skipped = all.length - files.length;
    for (const a of files) {
      const name = pdfFileName(a);
      try {
        const url = await generateStorageSignedUrl(String(a.storage_bucket), String(a.storage_path), PDF_LINK_TTL_SECONDS);
        const r = await provider.sendDocument(target.instanceName, target.jid, url, name, '');
        await recordOutgoing(pool, target.convId, 'SYSTEM', `[arquivo] ${name}`, r.id, { kind: 'DOCUMENT' });
        sent++;
      } catch (err: any) {
        skipped++;
        console.warn('[WhatsAppDelivery] PDF não foi:', err?.message || err);
      }
    }
    await pool.query(
      'INSERT INTO whatsapp_pdf_sends (order_id, conversation_id, reason, files_sent, files_skipped) VALUES ($1, $2, $3, $4, $5)',
      [target.orderId, target.convId, reason, sent, skipped]
    );
    console.log(JSON.stringify({ event: 'WHATSAPP_PDF_SENT', order_id: target.orderId, reason, sent, skipped, timestamp: new Date().toISOString() }));
    return sent > 0 ? { ok: true, sent, skipped } : { ok: false, reason: 'SEND_FAILED' };
  } catch (err: any) {
    console.warn('[WhatsAppDelivery] envio dos PDFs falhou:', err?.message || err);
    return { ok: false, reason: 'INTERNAL_ERROR' };
  }
}

export type WhatsAppDeliveryOutcome = { status: 'SENT' } | { status: 'FAILED'; error: string } | { status: 'SKIPPED'; reason: string };

export function deliveryMessage(firstName: string | null, offerName: string, url: string, validityDays: number, withFile = false) {
  const hi = firstName ? `${firstName}, pagamento` : 'Pagamento';
  return [
    `${hi} confirmado! ✅`,
    '',
    `Aqui está o acesso a *${offerName}*:`,
    url,
    '',
    `É só abrir o link e tocar em baixar. Ele vale por ${validityDays} dias, e o mesmo acesso também foi para o seu e-mail.`,
    ...(withFile ? ['Logo abaixo eu também mando o arquivo em PDF aqui na conversa. 📎'] : []),
    'Bom proveito! Qualquer dúvida, é só responder aqui.'
  ].join('\n');
}

export async function sendPaidOrderWhatsApp(pool: Pool, orderId: string, providerArg?: WhatsAppProvider | null): Promise<WhatsAppDeliveryOutcome> {
  let provider: WhatsAppProvider | null = providerArg === undefined ? null : providerArg;
  try {
    const r = await pool.query(
      `SELECT o.id, o.status, o.whatsapp_conversation_id AS conv_id, c.name AS customer_name,
              (SELECT string_agg(oi.offer_name_snapshot, ' + ' ORDER BY oi.is_bump ASC, oi.created_at ASC, oi.id ASC)
                 FROM order_items oi WHERE oi.order_id = o.id) AS offer_name,
              EXISTS (SELECT 1 FROM order_deliveries d WHERE d.order_id = o.id AND d.status = 'ACTIVE') AS has_active_delivery,
              EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status = 'CONFIRMED') AS confirmed,
              wc.mode AS conv_mode, wc.contact_jid, n.instance_name, n.status AS number_status, n.is_deleted AS number_deleted,
              n.id AS number_id, n.provider AS number_provider, n.cloud_account_id, n.phone_number_id
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN whatsapp_conversations wc ON wc.id = o.whatsapp_conversation_id
       LEFT JOIN whatsapp_numbers n ON n.id = wc.number_id
       WHERE o.id = $1`,
      [orderId]
    );
    const o = r.rows[0];
    if (!o) return { status: 'SKIPPED', reason: 'ORDER_NOT_FOUND' };
    if (!o.conv_id || !o.contact_jid) return { status: 'SKIPPED', reason: 'NOT_WHATSAPP_ORDER' };
    if (o.status !== 'PAID' || !o.confirmed) return { status: 'SKIPPED', reason: 'NOT_PAID' };
    // motivos permanentes ficam registrados para a varredura não insistir
    const skipForGood = async (reason: string) => {
      await pool.query(
        `INSERT INTO whatsapp_order_deliveries (order_id, conversation_id, status, error_code) VALUES ($1, $2, 'SKIPPED', $3)
         ON CONFLICT (order_id) DO NOTHING`,
        [orderId, o.conv_id, reason]
      );
      return { status: 'SKIPPED' as const, reason };
    };
    if (!o.has_active_delivery) return await skipForGood('NO_ACTIVE_DELIVERY');
    if (o.conv_mode === 'OPTED_OUT') return await skipForGood('OPTED_OUT');
    // NORQVA-0079: motor do número (oficial pela conta dele; Evolution só se estiver ligada)
    if (providerArg === undefined && o.number_id) {
      provider = await providerForNumber(pool, { id: o.number_id, provider: o.number_provider, cloud_account_id: o.cloud_account_id, phone_number_id: o.phone_number_id });
    }
    if (!provider) return { status: 'SKIPPED', reason: 'SERVER_NOT_CONFIGURED' };
    if (o.number_deleted || o.number_status !== 'CONNECTED') return { status: 'SKIPPED', reason: 'NUMBER_NOT_CONNECTED' };
    const official = isCloudProvider(provider);
    if (isCloudProvider(provider)) {
      // trava do NORQVA: o e-mail de acesso já foi; não insiste pelo WhatsApp
      const blocked = provider.blockReason(o.contact_jid);
      if (blocked) return await skipForGood(`SEND_BLOCKED:${blocked}`);
      // janela de 24h fechada: a Meta recusaria texto livre (template de entrega vem na etapa 4)
      if (!(await isServiceWindowOpen(pool, o.conv_id))) return await skipForGood('OUTSIDE_WINDOW');
    }

    const claim = await pool.query(
      `INSERT INTO whatsapp_order_deliveries (order_id, conversation_id, status, attempts)
       VALUES ($1, $2, 'SENDING', 1)
       ON CONFLICT (order_id) DO UPDATE
         SET status = 'SENDING', attempts = whatsapp_order_deliveries.attempts + 1, error_code = NULL, updated_at = NOW()
         WHERE whatsapp_order_deliveries.attempts < $3
           AND (whatsapp_order_deliveries.status = 'FAILED'
                OR (whatsapp_order_deliveries.status = 'SENDING' AND whatsapp_order_deliveries.updated_at < NOW() - INTERVAL '15 minutes'))
       RETURNING attempts`,
      [orderId, o.conv_id, WHATSAPP_DELIVERY_MAX_ATTEMPTS]
    );
    if (!claim.rows.length) return { status: 'SKIPPED', reason: 'ALREADY_HANDLED' };

    const fail = async (error: string) => {
      await pool.query(`UPDATE whatsapp_order_deliveries SET status = 'FAILED', error_code = $2, updated_at = NOW() WHERE order_id = $1`, [orderId, error.slice(0, 120)]);
      return { status: 'FAILED' as const, error };
    };

    const base = accessUrlBase();
    if (!base) return await fail('FRONTEND_URL_INVALID');
    // links de tentativas anteriores pelo WhatsApp deixam de valer
    await pool.query(
      `UPDATE order_recovery_tokens SET status = 'REVOKED', revoked_at = NOW() WHERE order_id = $1 AND purpose = 'WHATSAPP' AND status = 'ACTIVE'`,
      [orderId]
    );
    const token = await issueAccessToken(pool, orderId, 'WHATSAPP');
    const url = `${base.replace(/\/+$/, '')}/acesso/${token.rawToken}`;
    const firstName = o.customer_name ? String(o.customer_name).trim().split(/\s+/)[0] : null;
    const withFiles = typeof provider.sendDocument === 'function' && (await sendablePdfCount(pool, orderId).catch(() => 0)) > 0;
    const text = deliveryMessage(firstName, o.offer_name || 'sua compra', url, Math.max(1, Math.round(token.ttlHours / 24)), withFiles);

    let sentId: string | null = null;
    try {
      sentId = (await provider.sendText(o.instance_name, o.contact_jid, text)).id;
    } catch (err: any) {
      await pool.query(`UPDATE order_recovery_tokens SET status = 'REVOKED', revoked_at = NOW() WHERE id = $1 AND status = 'ACTIVE'`, [token.tokenId]);
      if (err instanceof SendBlockedError) {
        await pool.query(`UPDATE whatsapp_order_deliveries SET status = 'SKIPPED', error_code = $2, updated_at = NOW() WHERE order_id = $1`, [orderId, `SEND_BLOCKED:${err.code}`]);
        return { status: 'SKIPPED', reason: `SEND_BLOCKED:${err.code}` };
      }
      if (err instanceof CloudApiError && err.metaCode === 131047) {
        await pool.query(`UPDATE whatsapp_order_deliveries SET status = 'SKIPPED', error_code = 'OUTSIDE_WINDOW', updated_at = NOW() WHERE order_id = $1`, [orderId]);
        return { status: 'SKIPPED', reason: 'OUTSIDE_WINDOW' };
      }
      return await fail(String(err?.message || 'SEND_FAILED'));
    }
    // o link fica no histórico da conversa só como texto sem o código (o código do link é uma credencial)
    await recordOutgoing(pool, o.conv_id, 'SYSTEM', text.replace(token.rawToken, '••••••'), sentId, { deliveryStatus: official ? 'SENT' : null });
    await pool.query(`UPDATE whatsapp_order_deliveries SET status = 'SENT', sent_at = NOW(), error_code = NULL, updated_at = NOW() WHERE order_id = $1`, [orderId]);
    console.log(JSON.stringify({ event: 'WHATSAPP_DELIVERY_SENT', order_id: orderId, timestamp: new Date().toISOString() }));
    // NORQVA-0146: e os próprios PDFs, para quem tem dificuldade com o link (falha aqui não desfaz a entrega)
    // em segundo plano: a confirmação do pagamento (webhook do Asaas) não espera os arquivos subirem
    if (withFiles) {
      lastPdfSend = sendOrderPdfs(pool, provider, { orderId, convId: o.conv_id, jid: o.contact_jid, instanceName: o.instance_name }, 'PAID').catch(() => null);
    }
    return { status: 'SENT' };
  } catch (err: any) {
    console.warn('[WhatsAppDelivery] non-fatal error:', err?.message);
    await pool.query(
      `UPDATE whatsapp_order_deliveries SET status = 'FAILED', error_code = 'INTERNAL_ERROR', updated_at = NOW() WHERE order_id = $1 AND status = 'SENDING'`,
      [orderId]
    ).catch(() => {});
    return { status: 'FAILED', error: 'INTERNAL_ERROR' };
  }
}

/** Varredura: pedidos pagos pela conversa nos últimos 7 dias que ainda não receberam o acesso no WhatsApp. */
export async function sweepWhatsAppDeliveries(pool: Pool): Promise<number> {
  // NORQVA-0079: roda com a Evolution ligada ou com alguma conta Meta oficial ativa
  if (!getWhatsAppProvider()) {
    const cloud = await pool.query(`SELECT 1 FROM whatsapp_cloud_accounts WHERE is_deleted = FALSE AND status <> 'DISABLED' LIMIT 1`).catch(() => ({ rows: [] as any[] }));
    if (!cloud.rows.length) return 0;
  }
  const r = await pool.query(
    `SELECT o.id FROM orders o
     JOIN payments p ON p.order_id = o.id AND p.status = 'CONFIRMED'
     LEFT JOIN whatsapp_order_deliveries w ON w.order_id = o.id
     WHERE o.status = 'PAID' AND o.is_demo = FALSE AND o.whatsapp_conversation_id IS NOT NULL
       AND p.confirmed_at > NOW() - INTERVAL '7 days'
       AND (w.order_id IS NULL
            OR (w.status = 'FAILED' AND w.attempts < $1)
            OR (w.status = 'SENDING' AND w.updated_at < NOW() - INTERVAL '15 minutes' AND w.attempts < $1))
     GROUP BY o.id
     ORDER BY MAX(p.confirmed_at) DESC
     LIMIT 25`,
    [WHATSAPP_DELIVERY_MAX_ATTEMPTS]
  );
  let n = 0;
  for (const row of r.rows) {
    await sendPaidOrderWhatsApp(pool, row.id);
    n++;
  }
  return n;
}
