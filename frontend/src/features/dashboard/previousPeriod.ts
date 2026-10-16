import { GlobalPeriod, OPERATION_START_LABEL } from '../../lib/globalPeriod';

// NORQVA-0082: período anterior de mesmo tamanho, para comparar na Visão Geral.
// Usa a MESMA regra de datas do servidor (commercialTimezone.ts): "7 dias" = hoje e os 6 dias antes,
// dias inteiros no fuso de São Paulo. O anterior é pedido como período personalizado, então
// o servidor aplica as mesmas fórmulas; nada é calculado aqui além das datas.
// Também respeita o início da operação (D-0073, 25/09/2026): antes disso não há números.

// mesma data de lib/globalPeriod (OPERATION_START_LABEL, D-0073), em AAAA-MM-DD
export const OPERATION_START = OPERATION_START_LABEL.split('/').reverse().join('-');
const TZ = 'America/Sao_Paulo';

export interface PreviousPeriod {
  /** Período a pedir ao servidor (sempre personalizado) */
  query: GlobalPeriod | null;
  /** Texto curto para a tela */
  label: string;
  /** Por que não há comparação (quando query = null) */
  unavailableReason?: string;
  /** O anterior começa antes do início da operação: só parte dele tem números */
  partial?: boolean;
}

export function todayInSaoPaulo(now: Date = new Date()): string {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

const fmt = (ymd: string) => ymd.split('-').reverse().slice(0, 2).join('/');

const SPAN: Record<string, number> = { yesterday: 1, '7d': 7, '30d': 30, '90d': 90 };

export function previousPeriodOf(gp: GlobalPeriod, now: Date = new Date(), operationStart: string = OPERATION_START): PreviousPeriod {
  const today = todayInSaoPaulo(now);

  if (gp.period === 'today') {
    // "Hoje" ainda não terminou: comparar com o dia inteiro de ontem enganaria.
    return { query: null, label: '', unavailableReason: 'Hoje ainda está em andamento. A comparação aparece em "Ontem" ou "7 dias".' };
  }
  if (gp.period === 'all') {
    return { query: null, label: '', unavailableReason: 'Sem período anterior: "Tudo" começa no início das vendas.' };
  }

  let start: string;
  let end: string;
  if (gp.period === 'custom') {
    if (!gp.startDate || !gp.endDate) return { query: null, label: '', unavailableReason: 'Escolha as datas para comparar.' };
    const [y1, m1, d1] = gp.startDate.split('-').map(Number);
    const [y2, m2, d2] = gp.endDate.split('-').map(Number);
    const span = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000) + 1;
    end = addDays(gp.startDate, -1);
    start = addDays(end, -(span - 1));
  } else {
    const span = SPAN[gp.period];
    if (!span) return { query: null, label: '', unavailableReason: 'Período sem comparação.' };
    const currentEnd = gp.period === 'yesterday' ? addDays(today, -1) : today;
    const currentStart = addDays(currentEnd, -(span - 1));
    end = addDays(currentStart, -1);
    start = addDays(end, -(span - 1));
  }

  if (end < operationStart) {
    return {
      query: null,
      label: '',
      unavailableReason: `Sem período anterior para comparar: as vendas começaram em ${fmt(operationStart)}.`
    };
  }
  if (start < operationStart) {
    // o servidor cortaria o anterior no início das vendas: períodos de tamanhos diferentes não se comparam
    return {
      query: null,
      label: '',
      partial: true,
      unavailableReason: `Ainda não há um período anterior completo: as vendas começaram em ${fmt(operationStart)}.`
    };
  }
  return {
    query: { period: 'custom', startDate: start, endDate: end },
    label: start === end ? `vs ${fmt(start)}` : `vs ${fmt(start)} a ${fmt(end)}`
  };
}

/** Variação percentual; null quando não há base (anterior zero ou ausente). */
export function changePct(current: number | null | undefined, previous: number | null | undefined): number | null {
  const c = Number(current);
  const p = Number(previous);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
  return ((c - p) / Math.abs(p)) * 100;
}
