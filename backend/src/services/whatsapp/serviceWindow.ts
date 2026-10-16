// NORQVA-0079: janela de atendimento de 24 horas da Cloud API da Meta.
// Texto livre só pode ser enviado até 24h depois da última mensagem RECEBIDA do cliente.
// Depois disso, só template aprovado. Margem de 5 minutos para a mensagem não chegar com a janela já fechada.
import { Pool } from 'pg';

export const SERVICE_WINDOW_HOURS = 24;
const SAFETY_MARGIN_MS = 5 * 60 * 1000;

export async function lastInboundAt(pool: Pool, conversationId: string): Promise<Date | null> {
  const r = await pool.query(
    `SELECT MAX(created_at) AS at FROM whatsapp_messages WHERE conversation_id = $1 AND direction = 'IN' AND author = 'CUSTOMER'`,
    [conversationId]
  );
  const at = r.rows[0]?.at;
  return at ? new Date(at) : null;
}

export function windowOpenAt(lastInbound: Date | null, now: Date = new Date()): boolean {
  if (!lastInbound) return false;
  return now.getTime() - lastInbound.getTime() < SERVICE_WINDOW_HOURS * 60 * 60 * 1000 - SAFETY_MARGIN_MS;
}

export async function isServiceWindowOpen(pool: Pool, conversationId: string, now: Date = new Date()): Promise<boolean> {
  return windowOpenAt(await lastInboundAt(pool, conversationId), now);
}
