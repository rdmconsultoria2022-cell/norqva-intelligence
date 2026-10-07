import { Pool } from 'pg';
import { MetaClient, MetaAccountBilling } from './metaClient';

// Painel de créditos da conta Meta — SOMENTE LEITURA.
// Mostra limite de gastos da conta, gasto, disponível, previsão até o limite e forma de pagamento.
// Não adiciona crédito (a Meta não tem API para isso), não altera spend_cap (só depois de H2/H3)
// e não resolve o R-0019-01 (o limite da conta é global, não por experimento).

export const ACCOUNT_STATUS_LABELS: Record<number, string> = {
  1: 'Ativa',
  2: 'Desativada',
  3: 'Pagamento pendente',
  7: 'Em análise de risco',
  8: 'Liquidação pendente',
  9: 'Em período de carência',
  100: 'Encerramento pendente',
  101: 'Encerrada'
};

export const FUNDING_TYPE_LABELS: Record<number, string> = {
  1: 'Cartão de crédito',
  2: 'Carteira Facebook',
  3: 'Crédito pago Facebook',
  4: 'Crédito estendido',
  5: 'Pedido',
  6: 'Fatura',
  7: 'Token Facebook',
  8: 'Fonte externa',
  12: 'PayPal',
  13: 'PayPal (acordo)',
  15: 'Depósito externo',
  17: 'Débito direto',
  19: 'Pagamento alternativo',
  20: 'Saldo pré-pago'
};

export interface CreditAlert {
  level: 'CRITICAL' | 'WARNING' | 'INFO';
  message: string;
}

export interface AccountCreditPanel {
  fetched_at: string;
  account: { id: string; name: string; currency: string; status: number | null; status_label: string; is_prepay: boolean | null };
  funding: { type: number | null; type_label: string; display: string | null; prepaid_balance: number | null } | null;
  limit: number | null;
  spent: number;
  available: number | null;
  used_pct: number | null;
  balance_due: number | null;
  spend_7d: number;
  avg_daily_7d: number | null;
  active_daily_budgets: number;
  forecast: {
    days_at_avg: number | null;
    date_at_avg: string | null;
    days_at_budgets: number | null;
    date_at_budgets: string | null;
  };
  alerts: CreditAlert[];
  billing_url: string;
  notes: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Reads an amount like "R$ 120,00" or "R$1.234,56" from Meta's display string (prepaid accounts). */
export function parseDisplayAmount(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function addDays(base: Date, days: number): string {
  const d = new Date(base.getTime() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Pure calculation from the Meta snapshot + the sum of active daily budgets. */
export function buildPanel(b: MetaAccountBilling, activeDailyBudgets: number, now = new Date()): AccountCreditPanel {
  const limit = b.spend_cap && b.spend_cap > 0 ? r2(b.spend_cap) : null;
  const spent = r2(b.amount_spent || 0);
  const available = limit !== null ? r2(Math.max(0, limit - spent)) : null;
  const spend7 = r2(b.daily_spend.reduce((s, d) => s + d.spend, 0));
  const avg = b.daily_spend.length ? r2(spend7 / 7) : null;
  const budgets = r2(activeDailyBudgets);

  const daysAtAvg = available !== null && avg && avg > 0 ? r1(available / avg) : null;
  const daysAtBudgets = available !== null && budgets > 0 ? r1(available / budgets) : null;

  const fundType = b.funding_source?.type ?? null;
  const prepaid = fundType === 20 ? parseDisplayAmount(b.funding_source?.display_string) : null;

  const alerts: CreditAlert[] = [];
  if (b.account_status !== null && b.account_status !== 1) {
    alerts.push({ level: 'CRITICAL', message: `Conta com status "${ACCOUNT_STATUS_LABELS[b.account_status] || b.account_status}": anúncios podem não estar veiculando.` });
  }
  if (limit !== null && available !== null) {
    if (available <= 0) alerts.push({ level: 'CRITICAL', message: 'Limite de gastos da conta atingido: a Meta para todos os anúncios até o limite ser aumentado ou zerado.' });
    else if (daysAtBudgets !== null && daysAtBudgets < 1) alerts.push({ level: 'CRITICAL', message: `O disponível (R$ ${available.toFixed(2)}) cobre menos de 1 dia dos orçamentos ativos.` });
    else if ((daysAtBudgets !== null && daysAtBudgets < 3) || (daysAtAvg !== null && daysAtAvg < 3)) {
      alerts.push({ level: 'WARNING', message: 'O limite de gastos da conta acaba em menos de 3 dias no ritmo atual.' });
    }
  } else {
    alerts.push({ level: 'INFO', message: 'Sem limite de gastos na conta: a Meta não para por limite global.' });
  }
  if (prepaid !== null && budgets > 0 && prepaid < budgets) {
    alerts.push({ level: 'WARNING', message: `Saldo pré-pago (R$ ${prepaid.toFixed(2)}) menor que 1 dia dos orçamentos ativos (R$ ${budgets.toFixed(2)}).` });
  }
  if (b.balance !== null && b.balance > 0 && b.is_prepay_account === false) {
    alerts.push({ level: 'INFO', message: `Valor a cobrar acumulado na Meta: R$ ${b.balance.toFixed(2)}.` });
  }

  const numericId = b.id.replace(/^act_/, '');
  return {
    fetched_at: now.toISOString(),
    account: { id: b.id, name: b.name, currency: b.currency, status: b.account_status, status_label: b.account_status === null ? '—' : ACCOUNT_STATUS_LABELS[b.account_status] || String(b.account_status), is_prepay: b.is_prepay_account },
    funding: b.funding_source
      ? { type: fundType, type_label: fundType === null ? '—' : FUNDING_TYPE_LABELS[fundType] || `Tipo ${fundType}`, display: b.funding_source.display_string, prepaid_balance: prepaid }
      : null,
    limit,
    spent,
    available,
    used_pct: limit ? r1((spent / limit) * 100) : null,
    balance_due: b.balance,
    spend_7d: spend7,
    avg_daily_7d: avg,
    active_daily_budgets: budgets,
    forecast: {
      days_at_avg: daysAtAvg,
      date_at_avg: daysAtAvg !== null ? addDays(now, daysAtAvg) : null,
      days_at_budgets: daysAtBudgets,
      date_at_budgets: daysAtBudgets !== null ? addDays(now, daysAtBudgets) : null
    },
    alerts,
    billing_url: `https://business.facebook.com/billing_hub/accounts/details/?asset_id=${encodeURIComponent(numericId)}`,
    notes: [
      'Adicionar crédito ou pagar é feito na central de cobrança da Meta (não há API para isso).',
      'O limite de gastos da conta é global: não substitui o teto por experimento (R-0019-01 continua aberto).',
      'Ajustar o limite pelo NORQVA só depois da confirmação forte (H2/H3).'
    ]
  };
}

export class AccountCreditService {
  private cache: { at: number; isDemo: boolean; panel: AccountCreditPanel } | null = null;
  constructor(private clientFactory: () => Pick<MetaClient, 'getAccountBilling'> = () => new MetaClient(), private ttlMs = 60_000) {}

  /** Sum of daily budgets currently running: active CBO campaigns + active ad sets of campaigns without a campaign budget. */
  async activeDailyBudgets(pool: Pool, isDemo: boolean): Promise<number> {
    const camp = await pool.query(
      `SELECT COALESCE(SUM(daily_budget), 0) AS total FROM meta_campaigns
       WHERE is_demo = $1 AND effective_status = 'ACTIVE' AND daily_budget IS NOT NULL AND daily_budget > 0`,
      [isDemo]
    );
    const sets = await pool.query(
      `SELECT COALESCE(SUM(mas.daily_budget), 0) AS total FROM meta_ad_sets mas
       JOIN meta_campaigns mc ON mc.id = mas.campaign_id
       WHERE mas.is_demo = $1 AND mas.effective_status = 'ACTIVE' AND mc.effective_status = 'ACTIVE'
         AND (mc.daily_budget IS NULL OR mc.daily_budget = 0) AND mas.daily_budget IS NOT NULL AND mas.daily_budget > 0`,
      [isDemo]
    );
    return (parseFloat(camp.rows[0]?.total) || 0) + (parseFloat(sets.rows[0]?.total) || 0);
  }

  async getPanel(pool: Pool, isDemo: boolean, force = false): Promise<AccountCreditPanel & { cached: boolean }> {
    if (!force && this.cache && this.cache.isDemo === isDemo && Date.now() - this.cache.at < this.ttlMs) {
      return { ...this.cache.panel, cached: true };
    }
    const [billing, budgets] = await Promise.all([this.clientFactory().getAccountBilling(isDemo), this.activeDailyBudgets(pool, isDemo)]);
    const panel = buildPanel(billing, budgets);
    this.cache = { at: Date.now(), isDemo, panel };
    return { ...panel, cached: false };
  }
}
