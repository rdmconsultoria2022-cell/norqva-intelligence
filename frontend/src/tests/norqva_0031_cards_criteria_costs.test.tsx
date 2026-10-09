// NORQVA-0031: cartões de receita lendo o lugar certo, recomendação de critérios e custos por oferta.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { DashboardView } from '../features/dashboard/DashboardView';
import { CriteriaPanel } from '../features/research/CriteriaPanel';
import { RECOMMENDED_CRITERIA } from '../features/research/recommendation';
import { OfferCosts } from '../features/products/ProductsView';

const admin = { id: 'u1', name: 'Ricardo', role: 'ADMIN', email: 'a@x.test' } as any;

const financial = (rollup: any, gross: number) => ({
  mode: 'real',
  period: '7d',
  dateFilter: null,
  summary: {
    totalSpend: 400.54, grossRevenue: gross, paidOrdersCount: 8, pendingOrdersCount: 1, gatewayFees: 39.08, otherCosts: 0, totalCosts: 39.08,
    isCostKnown: false, resultAfterMedia: -231.34, netProfit: -270.42, netMargin: -159.8, aov: 21.15, roas: 0.42
  },
  byProduct: [],
  byCampaign: [],
  byCreative: [],
  unattributed: { revenue: 0, ordersCount: 0 },
  reconciliation: { isReconciled: true, productTotalRevenue: gross, campaignPlusUnattributedRevenue: gross, totalSpendSum: 400.54, revenueDiff: 0 },
  performanceAttribution: {
    globalCommercialTruth: { grossRevenue: gross, paidOrdersCount: 8 },
    attributedMediaTruth: { commercialRollup: rollup },
    byCampaign: [],
    byAdSet: [],
    byAd: []
  }
});

const renderFinancial = (data: any) =>
  render(
    <DashboardView
      section="financial"
      currentUser={admin}
      isDemoView={false}
      experiments={[]}
      apiFetch={vi.fn(async (url: string) => (url.includes('/financial/dashboard') ? data : {})) as any}
      onSelectExperiment={vi.fn()}
      onRegisterPerformance={vi.fn()}
      onAuthorizeCapital={vi.fn()}
      refreshTrigger={0}
      showError={vi.fn()}
      showSuccess={vi.fn()}
    />
  );

describe('NORQVA-0031 — cartões de receita', () => {
  it('mostram atribuída, orgânica e não atribuída (com as ambíguas) a partir do resumo comercial', async () => {
    renderFinancial(
      financial(
        { attributedPaidOrders: 7, attributedRevenue: 139.3, organicOrdersCount: 0, organicRevenue: 0, unattributedOrdersCount: 0, unattributedRevenue: 0, ambiguousOrdersCount: 1, ambiguousRevenue: 29.9 },
        169.2
      )
    );
    const cards = await screen.findByTestId('revenue-cards');
    expect(within(cards).getByTestId('card-attributed')).toHaveTextContent('139,30');
    expect(within(cards).getByTestId('card-attributed')).toHaveTextContent('7 pedidos');
    expect(within(cards).getByTestId('card-organic')).toHaveTextContent('0,00');
    expect(within(cards).getByTestId('card-unattributed')).toHaveTextContent('29,90');
    expect(within(cards).getByTestId('card-unattributed')).toHaveTextContent('1 batem com mais de uma campanha');
    expect(screen.queryByTestId('revenue-cards-mismatch')).not.toBeInTheDocument();
  });

  it('avisam quando os três não somam o faturamento', async () => {
    renderFinancial(
      financial(
        { attributedPaidOrders: 7, attributedRevenue: 139.3, organicOrdersCount: 0, organicRevenue: 0, unattributedOrdersCount: 0, unattributedRevenue: 0, ambiguousOrdersCount: 0, ambiguousRevenue: 0 },
        169.2
      )
    );
    expect(await screen.findByTestId('revenue-cards-mismatch')).toHaveTextContent('169,20');
  });
});

describe('NORQVA-0031 — recomendação de critérios', () => {
  const numbers = Object.fromEntries(Object.entries(RECOMMENDED_CRITERIA).map(([k]) => [k, 0]));
  const current = {
    ...numbers,
    winner_min_sales: 3, winner_cpa_ratio: 0.66, promising_cpa_ratio: 1, loser_spend_ratio: 2, loser_ctr_min_pct: 0.6, loser_ctr_min_spend: 15,
    loser_cpa_ratio: 1.5, no_data_spend_ratio: 0.5, no_breakeven_min_spend: 5, no_breakeven_winner_roas: 1.5, shortlist_min_spend: 10,
    shortlist_min_impressions: 500, shortlist_min_days: 2, shortlist_max_cpa_ratio: 1.5, eu_min_ads: 5, eu_w_long_runners: 0.4,
    eu_w_advertisers: 0.25, eu_w_reach: 0.2, eu_w_momentum: 0.15, eu_validated_min: 70, eu_promising_min: 45
  } as Record<string, number>;
  const defs = Object.keys(current).map(k => ({ key: k, group: k.startsWith('eu_') ? 'EU' : k.startsWith('shortlist_') ? 'SHORTLIST' : 'BASE', label: `L ${k}`, unit: '', min: 0, max: 1e7 }));
  const draft = { version: 1, status: 'DRAFT', numbers: current, note: null, created_by_name: null, created_at: '2026-10-08T22:00:00Z', validated_by_name: null, validated_at: null, texts_hash: 'h' };
  const overview = { effective: { numbers: current, version: null, validated: false, texts_changed: false }, validated: null, draft, versions: [draft], defs, texts: { validator_checks: [], ai_rules: [] }, texts_hash: 'h' };

  it('cobre os 21 critérios e muda exatamente 6', () => {
    expect(Object.keys(RECOMMENDED_CRITERIA).sort()).toEqual(Object.keys(current).sort());
    const changed = Object.entries(RECOMMENDED_CRITERIA).filter(([k, r]) => r.value !== current[k]).map(([k]) => k).sort();
    expect(changed).toEqual(['loser_ctr_min_pct', 'loser_ctr_min_spend', 'no_breakeven_min_spend', 'no_breakeven_winner_roas', 'shortlist_min_spend', 'winner_min_sales']);
    const w = RECOMMENDED_CRITERIA;
    expect(w.eu_w_long_runners.value + w.eu_w_advertisers.value + w.eu_w_reach.value + w.eu_w_momentum.value).toBeCloseTo(1, 6);
  });

  it('"Usar a recomendação" preenche o formulário e o rascunho leva só as 6 mudanças', async () => {
    const apiFetch = vi.fn(async (url: string) => (url === '/research/criteria' ? overview : { version: 2 }));
    render(<CriteriaPanel currentUser={admin} apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByTestId('recommended-winner_min_sales')).toHaveTextContent('Claude recomenda 5 (muda)');
    fireEvent.click(screen.getByTestId('use-recommendation'));
    expect((screen.getByLabelText('L winner_min_sales') as HTMLInputElement).value).toBe('5');
    fireEvent.click(screen.getByTestId('save-criteria-draft'));
    await waitFor(() => {
      const call = apiFetch.mock.calls.find((c: any[]) => c[0] === '/research/criteria/drafts') as any;
      expect(call).toBeTruthy();
      const body = JSON.parse(call[1].body);
      expect(Object.keys(body.numbers).sort()).toEqual(['loser_ctr_min_pct', 'loser_ctr_min_spend', 'no_breakeven_min_spend', 'no_breakeven_winner_roas', 'shortlist_min_spend', 'winner_min_sales']);
      expect(body.note).toMatch(/Claude/);
    });
  });
});

describe('NORQVA-0031 — custos da oferta', () => {
  const off = { id: 'o1', human_id: 'OFF-000001', price: '19.90', promotional_price: null, is_demo: false };

  it('sem custos cadastrados, avisa e calcula o equilíbrio ao preencher', async () => {
    const apiFetch = vi.fn(async (url: string, opts?: any) => (opts?.method === 'PUT' ? { ok: true } : { status: 'UNCONFIGURED', unit_economics: null }));
    render(<OfferCosts off={off} apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByTestId('offer-costs')).toHaveTextContent('ainda não cadastrados');
    fireEvent.change(screen.getByLabelText('Imposto (%)'), { target: { value: '6' } });
    // 19,90 × 6% = 1,194 + 1,99 = 3,184 → equilíbrio 16,72
    expect(screen.getByTestId('offer-breakeven')).toHaveTextContent('R$ 16,72');
    fireEvent.click(screen.getByTestId('save-offer-costs'));
    await waitFor(() => {
      const put = apiFetch.mock.calls.find((c: any[]) => c[1]?.method === 'PUT') as any;
      expect(put[0]).toBe('/offers/o1/unit-economics?mode=real');
      expect(JSON.parse(put[1].body)).toEqual({ tax_rate: 0.06, gateway_fixed_fee: 1.99, gateway_pct_fee: 0, other_variable_cost: 0, target_net_margin: 0 });
    });
  });

  it('carrega os custos já cadastrados', async () => {
    const apiFetch = vi.fn(async () => ({ status: 'CONFIGURED', unit_economics: { tax_rate: 0.18, gateway_fixed_fee: 1.99, gateway_pct_fee: 0, other_variable_cost: 0, target_net_margin: 0.1 } }));
    render(<OfferCosts off={off} apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} />);
    await waitFor(() => expect((screen.getByLabelText('Imposto (%)') as HTMLInputElement).value).toBe('18'));
    expect(screen.queryByText(/ainda não cadastrados/)).not.toBeInTheDocument();
    // 19,90 × 18% = 3,582 + 1,99 = 5,572 → 14,33
    expect(screen.getByTestId('offer-breakeven')).toHaveTextContent('R$ 14,33');
  });
});
