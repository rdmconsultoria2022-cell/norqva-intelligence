// NORQVA-0028: campanha completa numa tela — lista única, abas, escopo do controle e menu.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { CampaignsView } from '../features/campaigns/CampaignsView';
import { MethodView } from '../features/method/MethodView';
import { MetaControlDialog } from '../features/acquisition/MetaControl';
import { navigationItems } from '../components/layout/Sidebar';

const admin = { id: 'u1', name: 'Admin', email: 'a@norqva.test', role: 'ADMIN' } as any;
const viewer = { id: 'u2', name: 'Perf', email: 'p@norqva.test', role: 'PERFORMANCE' } as any;

const plan = (over: any = {}) => ({
  id: 'p1',
  code: 'TR-EXP03',
  status: 'AWAITING_OPERATOR',
  offer_human_id: 'OFF-000001',
  daily_budget_brl: 20,
  max_spend_brl: 140,
  editable: false,
  experiment_id: 'e-plan',
  answer: null,
  meta_ids: { campaign: { NORQVA_TR_EXP03: '111' }, adsets: {}, videos: {}, creatives: {}, ads: {} },
  manual_fields: {},
  ad_creatives: {},
  spec: { campaign: { name: 'NORQVA_TR_EXP03' }, adsets: [], ads: [] },
  ...over
});

const metaCampaigns = [
  { id: 'db-111', meta_campaign_id: '111', name: 'NORQVA_TR_EXP03', status: 'PAUSED', effective_status: 'PAUSED' },
  { id: 'db-222', meta_campaign_id: '222', name: 'NORQVA_TRATTORIA_REVENUE_V1', status: 'ACTIVE', effective_status: 'ACTIVE' }
];
const perf = [
  { campaign_id: '222', adset_id: 's2', ad_id: 'ad-2', spend: 50, paid_orders: 2, gross_revenue: 39.8, impressions: 1000, clicks: 30, link_clicks: 30, offer_views: 20, checkout_started: 3 },
  { campaign_id: '111', adset_id: 's1', ad_id: 'ad-1', spend: 0, paid_orders: 0, gross_revenue: 0, impressions: 0, clicks: 0, link_clicks: 0, offer_views: 0, checkout_started: 0 }
];

const setup = (opts: { user?: any; camp?: any } = {}) => {
  const camp = opts.camp || plan();
  const apiFetch = vi.fn().mockImplementation((url: string) => {
    if (url === '/campaigns?mode=real') return Promise.resolve({ campaigns: [camp] });
    if (url === '/campaigns/p1?mode=real') return Promise.resolve(camp);
    if (url.includes('/creative-options')) return Promise.resolve({ options: [] });
    if (url.startsWith('/meta/campaigns')) return Promise.resolve(metaCampaigns);
    if (url.startsWith('/meta/adsets')) return Promise.resolve([]);
    if (url.startsWith('/meta/ads')) return Promise.resolve([]);
    if (url.startsWith('/meta/insights')) return Promise.resolve([]);
    if (url.startsWith('/intelligence/creative-performance')) return Promise.resolve({ creatives: perf });
    if (url.startsWith('/alerts')) return Promise.resolve({ alerts: [{ id: 'al1', status: 'OPEN', meta_ad_id: 'ad-2', campaign_name: 'NORQVA_TRATTORIA_REVENUE_V1' }] });
    if (url.startsWith('/experiments')) {
      return Promise.resolve({
        experiments: [
          { id: 'e-plan', human_id: 'EXP-0010', name: 'Campanha TR-EXP03', status: 'RUNNING', capital_approved: '140', capital_used: '0' },
          { id: 'e-old', human_id: 'EXP-0001', name: 'Teste antigo', status: 'CLOSED', capital_approved: '50', capital_used: '48' }
        ]
      });
    }
    if (url.startsWith('/method/cases?')) return Promise.resolve({ cases: [{ id: 'mc2', offer_human_id: 'OFF-000009', title: 'Outra oferta' }] });
    return Promise.resolve({});
  });
  render(<CampaignsView currentUser={opts.user || admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} offers={[]} />);
  return apiFetch;
};

describe('NORQVA-0028 — campanha completa na tela Campanhas', () => {
  it('lista os planos e as campanhas criadas fora do NORQVA, com gasto, vendas e alertas', async () => {
    setup();
    const ext = await screen.findByTestId('external-campaign');
    expect(ext).toHaveTextContent('NORQVA_TRATTORIA_REVENUE_V1');
    expect(ext).toHaveTextContent('criada fora do NORQVA');
    expect(ext).toHaveTextContent('2 venda(s)');
    expect(ext).toHaveTextContent('1 alerta(s)');
    // a campanha do plano não aparece repetida como "de fora"
    expect(screen.getAllByTestId('external-campaign')).toHaveLength(1);
    expect(within(screen.getByTestId('campaign-list')).getByText('NORQVA_TR_EXP03')).toBeInTheDocument();
  });

  it('campanha de fora abre só resultado e controle, filtrados por ela', async () => {
    setup();
    fireEvent.click(await screen.findByTestId('external-campaign'));
    const detail = await screen.findByTestId('external-detail');
    expect(screen.queryByTestId('campaign-tabs')).not.toBeInTheDocument();
    await waitFor(() => expect(within(detail).getAllByText('222').length).toBeGreaterThan(0));
    expect(within(detail).queryByText('111')).not.toBeInTheDocument();
  });

  it('campanha do sistema abre com as cinco abas', async () => {
    const apiFetch = setup();
    fireEvent.click(await screen.findByText('NORQVA_TR_EXP03', { selector: 'div' }));
    const tabs = await screen.findByTestId('campaign-tabs');
    expect(within(tabs).getAllByRole('tab').map(t => t.textContent)).toEqual([
      'Configuração', 'Resultado e controle', 'Teto e vigia', 'Método', 'Experimento'
    ]);
    expect(screen.getByTestId('campaign-detail')).toBeInTheDocument();

    fireEvent.click(within(tabs).getByText('Experimento'));
    expect(screen.getByTestId('experiment-tab')).toHaveTextContent('EXP-0010');
    expect(screen.getByTestId('experiment-tab')).toHaveTextContent('R$');

    fireEvent.click(within(tabs).getByText('Teto e vigia'));
    expect(screen.getByTestId('cap-tab')).toHaveTextContent('teto');

    fireEvent.click(within(tabs).getByText('Método'));
    expect(await screen.findByTestId('method-no-case')).toHaveTextContent('OFF-000001');

    fireEvent.click(within(tabs).getByText('Resultado e controle'));
    await waitFor(() => expect(apiFetch.mock.calls.some(c => String(c[0]).startsWith('/meta/adsets'))).toBe(true));
  });

  it('plano ainda sem objetos na Meta mostra o aviso no resultado', async () => {
    setup({ camp: plan({ status: 'DRAFT', editable: true, experiment_id: null, meta_ids: { campaign: {}, adsets: {}, videos: {}, creatives: {}, ads: {} } }) });
    fireEvent.click(await screen.findByText('NORQVA_TR_EXP03', { selector: 'div' }));
    fireEvent.click(within(await screen.findByTestId('campaign-tabs')).getByText('Resultado e controle'));
    expect(screen.getByTestId('results-empty')).toBeInTheDocument();
  });

  it('experimentos antigos, sem campanha, ficam no histórico só para consulta', async () => {
    setup({ user: viewer });
    const hist = await screen.findByTestId('experiment-history');
    expect(hist).toHaveTextContent('EXP-0001');
    expect(hist).not.toHaveTextContent('EXP-0010');
    expect(within(hist).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('NORQVA-0028 — Método filtrado pela oferta', () => {
  it('embutido, mostra só o caso da oferta e esconde o cabeçalho', async () => {
    const apiFetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/method/cases?')) {
        return Promise.resolve({ cases: [{ id: 'mc1', offer_human_id: 'OFF-000001', title: 'Trattoria' }, { id: 'mc2', offer_human_id: 'OFF-000009', title: 'Outra' }] });
      }
      return Promise.resolve({ case: { id: 'mc1', human_id: 'MC-0001', title: 'Trattoria' }, stages: [], hypotheses: [], creatives: [], decisions: [], learnings: [], principles: [], signals: {} });
    });
    render(<MethodView currentUser={admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} offerHumanId="OFF-000001" />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/method/cases/mc1?mode=real'));
    expect(apiFetch.mock.calls.some(c => String(c[0]).startsWith('/method/cases/mc2'))).toBe(false);
    expect(screen.queryByTestId('method-no-case')).not.toBeInTheDocument();
  });
});

describe('NORQVA-0028 — controle só da campanha aberta', () => {
  it('o diálogo envia a campanha de escopo junto com pausar e orçamento', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true });
    const target = { entityType: 'adset' as const, id: 's9', name: 'TR_AS01', status: 'ACTIVE', dailyBudget: 20 };
    const props = { status: null, isDemoView: false, currentUser: admin, apiFetch, onClose: vi.fn(), onDone: vi.fn(), onError: vi.fn(), scopeCampaign: '111' };
    const { rerender } = render(<MetaControlDialog {...props} action={{ kind: 'status', target, next: 'PAUSED' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(apiFetch.mock.calls[0][0]).toBe('/meta-control/adset/s9/status?mode=real');
    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({ status: 'PAUSED', scope_campaign: '111' });

    rerender(<MetaControlDialog {...props} action={{ kind: 'budget', target }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(apiFetch.mock.calls[1][1].body)).toEqual({ daily_budget: 20, scope_campaign: '111' });
  });
});

describe('NORQVA-0028 — menu', () => {
  it('Meta Ads, Método NORQVA e Experimentos saem do menu; Campanhas fica para todos os perfis', () => {
    const ids = navigationItems.map(i => i.id);
    expect(ids).not.toContain('meta-ads');
    expect(ids).not.toContain('method');
    expect(ids).not.toContain('experiments');
    expect(navigationItems.find(i => i.id === 'campaigns')?.roles).toBeUndefined();
  });
});
