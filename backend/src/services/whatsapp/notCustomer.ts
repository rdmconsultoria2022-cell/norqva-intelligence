import { Pool } from 'pg';

// NORQVA-0158: mensagens que não são de cliente (robô de atendimento de outra empresa, propaganda,
// gente oferecendo produto ou serviço). O atendente automático para na conversa, sem chamar ninguém;
// a conversa aparece como "Não é cliente" e pode voltar ao atendente com um toque.

const fold = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Sinais fortes: um só já basta (frases que um comprador de livro de receitas não escreve). */
const STRONG: Array<[RegExp, string]> = [
  [/\b(este|esse) e o whatsapp oficial d[aoe]\b/, 'robô de atendimento de outra empresa'],
  [/\bmensagem automatica\b|\bresposta automatica\b|\bnao responda (a )?esta mensagem\b/, 'mensagem automática de outra empresa'],
  [/\bresponda\s*\*?\s*\d\s*\*?\s*(para|pra)?\s*\w+/, 'menu de robô de outra empresa'],
  [/\bdigite\s*\*?\s*\d\s*\*?\s*(para|pra)\b/, 'menu de robô de outra empresa'],
  [/\b(baixe|baixar) (o|nosso) (app|aplicativo)\b/, 'propaganda de outra empresa'],
  [/\b(gostaria de|quero|venho|vim) (te |lhe )?(apresentar|oferecer) (nossos?|nossas?|meus?|minhas?|um|uma|o|a)\b/, 'oferta de produto ou serviço'],
  [/\b(trafego pago|gestor de trafego|gestao de trafego|marketing digital|agencia de marketing|aumentar (suas|as) vendas|aumente (suas|as) vendas|mais clientes para (o seu|seu) negocio)\b/, 'oferta de serviço de marketing'],
  [/\b(proposta comercial|parceria comercial|representante comercial|seja (nosso|nossa) (parceiro|parceira|revendedor|revendedora))\b/, 'proposta comercial'],
  [/\b(emprestimo|credito consignado|cartao consignado|limpa nome|renegocie (sua|suas) divida)/, 'oferta de crédito'],
  [/\b(ganhe|ganhar) (dinheiro|renda extra)\b|\brenda extra\b.*\b(whatsapp|link|grupo)\b/, 'propaganda de renda extra']
];

/** Sinais fracos: precisam de dois juntos. */
const WEAK: RegExp[] = [
  /\bnossa empresa\b|\bsomos (uma|a) empresa\b/,
  /\b(cupom|cupons|promocoes|ofertas e descontos)\b/,
  /https?:\/\/(?!(?:[\w-]+\.)*(?:norqva|trattoria)[\w.-]*)/,
  /\b(cnpj|orcamento sem compromisso|solicite (um|seu) orcamento)\b/,
  /\b(servicos?|solucoes) (para|pra) (empresas|o seu negocio|seu negocio)\b/,
  /\bagradecemos (o seu|seu) contato\b/
];

/** Devolve o motivo quando as mensagens recebidas parecem de quem não é cliente; senão null. */
export function detectNotCustomer(inbound: string[]): string | null {
  const t = fold(inbound.filter(Boolean).join('\n'));
  if (!t.trim()) return null;
  for (const [re, why] of STRONG) if (re.test(t)) return why;
  const weak = WEAK.filter(re => re.test(t)).length;
  return weak >= 2 ? 'propaganda ou oferta de outra empresa' : null;
}

/** Para o atendente na conversa (sem chamar ninguém) e guarda o motivo. */
export async function markNotCustomer(pool: Pool, convId: string, reason: string): Promise<void> {
  await pool.query(
    `UPDATE whatsapp_conversations
        SET mode = 'HUMAN', needs_human = FALSE, not_customer_at = NOW(), not_customer_reason = $2, updated_at = NOW()
      WHERE id = $1 AND mode = 'BOT'`,
    [convId, String(reason || 'não é cliente').slice(0, 200)]
  );
}
