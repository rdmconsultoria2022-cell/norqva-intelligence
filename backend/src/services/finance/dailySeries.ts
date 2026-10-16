import { getLocalComponentsInTimezone, COMMERCIAL_TIMEZONE } from '../../utils/commercialTimezone';

// NORQVA-0082 (D-0082): números por dia para o gráfico da Visão Geral. Só leitura.
// As MESMAS regras do resumo financeiro (/financial/dashboard), separadas por dia:
// - receita = pedidos PAID (total_amount), dia do created_at no fuso comercial (São Paulo);
// - investimento = linhas diárias da Meta (date_start = date_stop), nível ACCOUNT quando existe,
//   senão CAMPAIGN (nunca os dois, nunca ADSET/AD).
// Assim a soma dos dias bate com o total do período.

export interface DailyPoint {
  date: string; // AAAA-MM-DD (fuso comercial)
  revenue: number;
  paidOrders: number;
  spend: number;
}

// limite de segurança: um período maior que isso mostra só os últimos MAX_DAYS dias e a resposta
// avisa com truncated = true (a soma dos dias deixa de bater com o total nesse caso)
export const MAX_DAYS = 400;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** O SQL devolve o dia já como texto (to_char), sem conversão de fuso no Node. */
function ymdOf(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/** Dia (fuso comercial) de um instante: o mesmo critério do filtro de período do servidor. */
export function commercialDayOf(instant: string | Date, timeZone: string = COMMERCIAL_TIMEZONE): string {
  const d = instant instanceof Date ? instant : new Date(instant);
  return getLocalComponentsInTimezone(d, timeZone).dateStr;
}

/**
 * Junta pedidos pagos e gasto diário numa série contínua (dias sem movimento = zero).
 * `start`/`end` em AAAA-MM-DD; sem `start`, começa no primeiro dia com dado.
 */
export function buildDailySeries(input: {
  start: string | null;
  end: string;
  paidOrders: Array<{ created_at: string | Date; total_amount: string | number }>;
  spendRows: Array<{ day: string | Date; spend: string | number }>;
  timeZone?: string;
}): DailyPoint[] {
  const byDay = new Map<string, DailyPoint>();
  const get = (date: string) => {
    let p = byDay.get(date);
    if (!p) {
      p = { date, revenue: 0, paidOrders: 0, spend: 0 };
      byDay.set(date, p);
    }
    return p;
  };

  for (const o of input.paidOrders) {
    const p = get(commercialDayOf(o.created_at, input.timeZone));
    p.revenue = round2(p.revenue + (Number(o.total_amount) || 0));
    p.paidOrders += 1;
  }
  for (const r of input.spendRows) {
    const p = get(ymdOf(r.day));
    p.spend = round2(p.spend + (Number(r.spend) || 0));
  }

  const known = [...byDay.keys()].sort();
  let start = input.start || known[0] || input.end;
  const end = input.end;
  if (start > end) return [];
  // série longa demais (ex.: "Tudo" sem data de início): mantém só os últimos MAX_DAYS dias
  const earliest = addDaysYmd(end, -(MAX_DAYS - 1));
  if (start < earliest) start = earliest;

  const out: DailyPoint[] = [];
  for (let d = start; d <= end; d = addDaysYmd(d, 1)) {
    out.push(byDay.get(d) || { date: d, revenue: 0, paidOrders: 0, spend: 0 });
  }
  return out;
}
