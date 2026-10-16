// NORQVA-0079: pedido feito na conversa de um número oficial de TESTE não é venda real.
// Ele não pode gerar evento de funil nem compra para a Meta (InitiateCheckout / Purchase).
// A regra olha a ligação do pedido com a conta TEST, e não só a classificação do pedido,
// para valer mesmo se a reclassificação falhar no meio do caminho.
import { Pool } from 'pg';

export async function isWhatsAppTestOrder(pool: Pool, orderId: string | null | undefined): Promise<boolean> {
  if (!orderId) return false;
  try {
    const r = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM orders o
         JOIN whatsapp_conversations c ON c.id = o.whatsapp_conversation_id
         JOIN whatsapp_numbers n ON n.id = c.number_id
         JOIN whatsapp_cloud_accounts a ON a.id = n.cloud_account_id
         WHERE o.id = $1 AND n.provider = 'META_CLOUD' AND a.environment = 'TEST'
       ) AS test`,
      [orderId]
    );
    return r.rows[0]?.test === true;
  } catch {
    // na dúvida (ex.: tabela ainda não migrada), segue como antes
    return false;
  }
}
