import { Pool } from 'pg';

// NORQVA-0158: mensagens que não são de cliente (robô de atendimento de outra empresa, propaganda,
// gente oferecendo produto ou serviço). O atendente automático para na conversa, sem chamar ninguém;
// a conversa aparece como "Não é cliente" e pode voltar ao atendente com um toque.

const fold = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Sinais fortes: um só já basta (frases que um comprador de livro de receitas não escreve). */
const STRONG: Array<[RegExp, string]> = [
  [/\b(este|esse) e o whatsapp oficial d[aoe]\b/, 'robô de atendimento de outra empresa'],
  [/^\s*(esta e uma )?(mensagem|resposta) automatica\b|\bnao responda (a )?esta mensagem\b/, 'mensagem automática de outra empresa'],
  [/\bresponda\s*\*?\s*\d\s*\*?\s*(para|pra)?\s*\w+/, 'menu de robô de outra empresa'],
  [/\bdigite\s*\*?\s*\d\s*\*?\s*(para|pra)\b|\bopcao invalida\b|\bdigite (uma|a) opcao\b/, 'menu de robô de outra empresa'],
  [/\bsou (a|o) (sua |seu )?assistente virtual\b|\bseu (numero de )?protocolo (de atendimento )?e\b/, 'robô de atendimento de outra empresa'],
  [/\bestamos fora do horario de atendimento\b/, 'mensagem automática de outra empresa'],
  [/\bbaixe (o )?nosso (app|aplicativo)\b/, 'propaganda de outra empresa'],
  [/\b(gostaria de|quero|venho|vim) (te |lhe )?(apresentar|oferecer) (nossos?|nossas?|meus?|minhas?) (servicos?|produtos?|solucoes|solucao|trabalho|parceria|plataforma|sistema)\b/, 'oferta de produto ou serviço'],
  [/\b(trafego pago|gestor de trafego|gestao de trafego|agencia de marketing|aumente (as )?suas vendas|aumentar (as )?suas vendas|mais clientes para (o )?seu negocio)\b/, 'oferta de serviço de marketing'],
  [/\b(proposta comercial|parceria comercial|seja (nosso|nossa) (parceiro|parceira|revendedor|revendedora))\b/, 'proposta comercial'],
  [/\b(credito consignado|cartao consignado|limpa nome|renegocie (sua|suas) divida)/, 'oferta de crédito']
];

/** Sinais fracos: precisam de dois juntos (vocabulário que um comprador quase nunca usa). */
const WEAK: RegExp[] = [
  /\bnossa empresa\b|\bsomos (uma|a) empresa\b/,
  /\b(promocoes|ofertas e descontos|confira nossas ofertas)\b/,
  /https?:\/\/(?!(?:[\w-]+\.)*(?:norqva|trattoria|asaas|instagram|facebook|fb|wa|whatsapp)\.)/,
  /\b(orcamento sem compromisso|solicite (um|seu) orcamento)\b/,
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
