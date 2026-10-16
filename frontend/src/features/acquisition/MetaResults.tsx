import React from 'react';
import { BellRing, Pause, Check } from 'lucide-react';

// NORQVA-0009: Meta-like results inside NORQVA — metrics per campaign / ad set / ad for the
// global period (Meta spend + NORQVA funnel: visits, checkout, sales), plus open ad alerts.

export interface PerfItem {
  ad_id: string;
  adset_id: string;
  campaign_id: string;
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  offer_views: number;
  checkout_started: number;
  paid_orders: number;
  gross_revenue: number;
}

export interface Metrics {
  spend: number;
  impressions: number;
  linkClicks: number;
  visits: number;
  checkouts: number;
  sales: number;
  revenue: number;
  ctr: number | null;
  cpc: number | null;
  cpa: number | null;
  roas: number | null;
}

export function aggregateMetrics(items: PerfItem[]): Metrics {
  const sum = (f: (i: PerfItem) => number) => items.reduce((a, i) => a + (Number(f(i)) || 0), 0);
  const spend = sum((i) => i.spend);
  const impressions = sum((i) => i.impressions);
  const linkClicks = sum((i) => i.link_clicks || i.clicks);
  const sales = sum((i) => i.paid_orders);
  const revenue = sum((i) => i.gross_revenue);
  return {
    spend,
    impressions,
    linkClicks,
    visits: sum((i) => i.offer_views),
    checkouts: sum((i) => i.checkout_started),
    sales,
    revenue,
    ctr: impressions > 0 ? (linkClicks / impressions) * 100 : null,
    cpc: linkClicks > 0 ? spend / linkClicks : null,
    cpa: sales > 0 ? spend / sales : null,
    roas: spend > 0 ? revenue / spend : null
  };
}

const money = (n: number | null) =>
  n === null ? '—' : `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const int = (n: number) => n.toLocaleString('pt-BR');

export const METRIC_HEADERS = ['Investido', 'Impressões', 'Cliques no link', 'CTR', 'CPC', 'Visitas', 'Checkout', 'Vendas', 'CPA', 'ROAS'];

export const MetricHeaderCells: React.FC = () => (
  <>
    {METRIC_HEADERS.map((h) => (
      <th key={h} className="p-3 text-right whitespace-nowrap">
        {h}
      </th>
    ))}
  </>
);

export const MetricCells: React.FC<{ m: Metrics; breakevenCpa?: number | null }> = ({ m }) => (
  <>
    <td className="p-3 text-right text-nq-text whitespace-nowrap">{money(m.spend)}</td>
    <td className="p-3 text-right text-nq-muted">{int(m.impressions)}</td>
    <td className="p-3 text-right text-nq-muted">{int(m.linkClicks)}</td>
    <td className="p-3 text-right text-nq-text">{m.ctr === null ? '—' : `${m.ctr.toFixed(2).replace('.', ',')}%`}</td>
    <td className="p-3 text-right text-nq-text whitespace-nowrap">{money(m.cpc)}</td>
    <td className="p-3 text-right text-nq-text">{int(m.visits)}</td>
    <td className="p-3 text-right text-nq-text">{int(m.checkouts)}</td>
    <td className={`p-3 text-right font-bold ${m.sales > 0 ? 'text-nq-positive-text' : 'text-nq-subtle'}`}>{int(m.sales)}</td>
    <td className="p-3 text-right text-nq-text whitespace-nowrap">{money(m.cpa)}</td>
    <td className="p-3 text-right text-nq-text">{m.roas === null ? '—' : `${m.roas.toFixed(2).replace('.', ',')}x`}</td>
  </>
);

export const ResultsSummary: React.FC<{ m: Metrics }> = ({ m }) => {
  const cards = [
    { label: 'Investido', value: money(m.spend) },
    { label: 'Vendas', value: int(m.sales), strong: m.sales > 0 },
    { label: 'Receita', value: money(m.revenue) },
    { label: 'CPA', value: money(m.cpa) },
    { label: 'ROAS', value: m.roas === null ? '—' : `${m.roas.toFixed(2).replace('.', ',')}x` },
    { label: 'Visitas → Checkout', value: `${int(m.visits)} → ${int(m.checkouts)}` }
  ];
  return (
    <div className="rounded-2xl bg-nq-surface p-4 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-5" data-testid="results-summary">
      {cards.map((c) => (
        <div key={c.label} className="min-w-0">
          <div className="text-[13px] text-nq-muted">{c.label}</div>
          <div className={`mt-1 text-[20px] leading-7 font-semibold tabular-nums truncate ${c.strong ? 'text-nq-positive-text' : 'text-nq-text'}`}>{c.value}</div>
        </div>
      ))}
    </div>
  );
};

export interface AdAlert {
  id: string;
  meta_ad_id: string;
  ad_name: string;
  campaign_name: string | null;
  message: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  created_at: string;
}

export const AlertsPanel: React.FC<{
  alerts: AdAlert[];
  canPause: (alert: AdAlert) => boolean;
  onPause: (alert: AdAlert) => void;
  onAck: (alert: AdAlert) => void;
}> = ({ alerts, canPause, onPause, onAck }) => {
  if (alerts.length === 0) return null;
  return (
    <div className="p-4 rounded-2xl bg-nq-critical/10 space-y-3" data-testid="alerts-panel">
      <div className="flex items-center gap-2 text-nq-critical-text text-[15px] font-semibold">
        <BellRing className="h-4 w-4" /> Alertas ({alerts.length})
      </div>
      {alerts.map((a) => (
        <div key={a.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-[13px] border-t border-nq-critical/20 pt-3">
          <div className="text-nq-text">
            {a.message}
            <span className="block text-[12px] text-nq-subtle mt-0.5">
              {a.campaign_name || ''} · {new Date(a.created_at).toLocaleString('pt-BR')}
              {a.status === 'ACKNOWLEDGED' ? ' · visto' : ''}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {canPause(a) && (
              <button
                onClick={() => onPause(a)}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full bg-nq-attention text-nq-on-positive font-semibold"
              >
                <Pause className="h-3 w-3" /> Pausar anúncio
              </button>
            )}
            {a.status === 'OPEN' && (
              <button onClick={() => onAck(a)} className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full bg-nq-raised text-nq-text">
                <Check className="h-3 w-3" /> Marcar como visto
              </button>
            )}
          </div>
        </div>
      ))}
      <p className="text-[12px] text-nq-subtle">Nada é pausado automaticamente. O alerta some sozinho se o anúncio vender ou for pausado.</p>
    </div>
  );
};
