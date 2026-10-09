// NORQVA-0030: Produtos com as ofertas dentro, tela Resultados, Visão Geral como entrada do dia e menu final.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ProductsView } from '../features/products/ProductsView';
import { ResultsView } from '../features/results/ResultsView';
import { DashboardView } from '../features/dashboard/DashboardView';
import { CreditSummary } from '../features/dashboard/CreditSummary';
import { navigationItems, navigationGroups } from '../components/layout/Sidebar';

const user = (role: string) => ({ id: `u-${role}`, name: role, role, email: `${role}@x.test` }) as any;

const products = [
  { id: 'p1', human_id: 'PRD-1', name: 'Trattoria em Casa', category: 'Receitas', description: 'd', status: 'ATIVO', brand_id: null, origin_provenance: 'PESQUISA', origin_evidence: 'e' },
  { id: 'p2', human_id: 'PRD-2', name: 'Bolso Blindado', category: 'Finanças', description: 'd', status: 'PLANEJADO', brand_id: 'b1' }
];
const offers = [
  { id: 'o1', human_id: 'OFF-000001', name: 'Trattoria 19,90', price: '19.90', promotional_price: null, product_id: 'p1', status: 'ATIVA', is_demo: false },
  { id: 'o2', human_id: 'OFF-000002', name: 'Trattoria rascunho', price: '29.90', promotional_price: '24.90', product_id: 'p1', status: 'RASCUNHO', is_demo: false },
  { id: 'o3', human_id: 'OFF-000003', name: 'Bolso', price: '47.00', promotional_price: null, product_id: 'p2', status: 'TESTE', is_demo: false }
];

function setupProducts(role: string, over: any = {}) {
  const apiFetch = vi.fn(async (url: string) => (url === '/brands' ? { brands: [{ id: 'b1', name: 'Finanças Já' }, { id: 'b2', name: 'Cozinha Nonna' }] } : {}));
  const props = {
    onAddOffer: vi.fn(),
    onUpdateOfferStatus: vi.fn(),
    onCheckout: vi.fn(),
    onProductsChanged: vi.fn(),
    ...over
  };
  render(
    <ProductsView
      products={products}
      offers={offers}
      currentUser={user(role)}
      apiFetch={apiFetch as any}
      showError={vi.fn()}
      showSuccess={vi.fn()}
      onAddProduct={vi.fn()}
      onEditProduct={vi.fn()}
      {...props}
    />
  );
  return { apiFetch, ...props };
}

const cardOf = (name: string) => screen.getAllByTestId('product-card').find(c => within(c).queryByText(name))!;

describe('NORQVA-0030 — Produtos com as ofertas dentro', () => {
  it('cada produto mostra só as ofertas dele; nova oferta nasce ligada ao produto', () => {
    const { onAddOffer, onUpdateOfferStatus } = setupProducts('ADMIN');
    const card = cardOf('Trattoria em Casa');
    expect(within(card).getByTestId('toggle-offers')).toHaveTextContent('Ofertas (2)');
    fireEvent.click(within(card).getByTestId('toggle-offers'));
    const list = within(card).getByTestId('product-offers');
    expect(within(list).getAllByTestId('offer-card')).toHaveLength(2);
    expect(within(list).queryByText('Bolso')).not.toBeInTheDocument();
    expect(within(list).getByText('R$24,90')).toBeInTheDocument();
    expect(within(list).getByText('R$29,90')).toHaveClass('line-through');
    fireEvent.click(within(list).getByRole('button', { name: /Ativar para teste/ }));
    expect(onUpdateOfferStatus).toHaveBeenCalledWith('o2', 'TESTE');
    fireEvent.click(within(card).getByTestId('add-offer'));
    expect(onAddOffer).toHaveBeenCalledWith('p1');
  });

  it('endereço antigo de Ofertas abre os produtos já expandidos', () => {
    setupProducts('ADMIN', { initialOpen: 'all' });
    expect(screen.getAllByTestId('product-offers')).toHaveLength(2);
  });

  it('perfil de análise vê tudo sem botões de alterar', () => {
    setupProducts('PERFORMANCE', { initialOpen: 'all' });
    expect(screen.queryByRole('button', { name: /Novo produto/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-offer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('offer-status-actions')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Arquivos de entrega/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Marca de/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Checkout da oferta/ }).length).toBe(2);
  });

  it('PRODUCT altera o catálogo, mas arquivos de entrega e marca ficam com o ADMIN', () => {
    setupProducts('PRODUCT', { initialOpen: 'all' });
    expect(screen.getAllByTestId('add-offer')).toHaveLength(2);
    expect(screen.getAllByTestId('offer-status-actions').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Arquivos de entrega/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Marca de/)).not.toBeInTheDocument();
  });

  it('ADMIN escolhe a marca do produto com confirmação', async () => {
    const { apiFetch, onProductsChanged } = setupProducts('ADMIN');
    const select = (await screen.findByLabelText('Marca de Trattoria em Casa')) as HTMLSelectElement;
    await waitFor(() => expect(within(select).getAllByRole('option').length).toBe(3));
    fireEvent.change(select, { target: { value: 'b2' } });
    expect(screen.getByTestId('confirm-brand')).toHaveTextContent('pixel');
    expect(apiFetch.mock.calls.some(c => String(c[0]).includes('/products/p1'))).toBe(false);
    fireEvent.click(within(screen.getByTestId('confirm-brand')).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/brands/b2/products/p1', expect.objectContaining({ method: 'PUT' })));
    await waitFor(() => expect(onProductsChanged).toHaveBeenCalled());
  });
});

describe('NORQVA-0030 — tela Resultados', () => {
  const decisions = [{ id: 'd1', human_id: 'DEC-0001', decision_text: 'Aprovar teste', type: 'APROVAR_PRODUTO', created_at: '2026-10-01T12:00:00Z', responsible_name: 'Ricardo', justification: 'ok' }];
  const renderResults = (role: string, initialTab: any) =>
    render(
      <ResultsView currentUser={user(role)} isDemoView={false} apiFetch={vi.fn(() => new Promise(() => {})) as any} showError={vi.fn()} showSuccess={vi.fn()} decisions={decisions} refreshTrigger={0} initialTab={initialTab} />
    );

  it('ADMIN vê as cinco abas e as decisões', () => {
    renderResults('ADMIN', 'decisions');
    expect(within(screen.getByTestId('results-tabs')).getAllByRole('tab').map(t => t.textContent)).toEqual(['Financeiro', 'Criativos', 'Público', 'Crédito Meta', 'Decisões']);
    expect(screen.getByText('Aprovar teste')).toBeInTheDocument();
  });

  it('sem ADMIN, a aba Crédito Meta não aparece e o endereço antigo cai no Financeiro', () => {
    const first = renderResults('PERFORMANCE', 'decisions');
    expect(within(screen.getByTestId('results-tabs')).queryByText('Crédito Meta')).not.toBeInTheDocument();
    first.unmount();
    renderResults('PERFORMANCE', 'credit');
    expect(within(screen.getByTestId('results-tabs')).getByText('Financeiro')).toHaveAttribute('aria-selected', 'true');
  });
});

describe('NORQVA-0030 — Visão Geral', () => {
  it('mostra só a visão executiva, sem a aba de experimentos, e não carrega o financeiro', async () => {
    const apiFetch = vi.fn(async (url: string) =>
      url.includes('/executive/dashboard')
        ? {
            meta: { spend: 0, impressions: 0, reach: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, campaigns: [] },
            commerce: { totalOrders: 0, pendingOrders: 0, paidOrders: 0, cancelledOrders: 0, grossRevenue: 0, aov: 0 },
            finance: { totalPixCreated: 0, totalPixConfirmed: 0, approvalRate: 0, confirmedRevenue: 0, reconciledTransactions: 0 },
            delivery: { totalEntitlements: 0, totalDownloads: 0, completedDownloads: 0, pendingDownloads: 0 },
            recentOrders: []
          }
        : {}
    );
    render(
      <DashboardView
        section="overview"
        currentUser={user('ADMIN')}
        isDemoView={true}
        experiments={[{ id: 'e1' }]}
        apiFetch={apiFetch as any}
        onSelectExperiment={vi.fn()}
        onRegisterPerformance={vi.fn()}
        onAuthorizeCapital={vi.fn()}
        refreshTrigger={0}
        showError={vi.fn()}
        showSuccess={vi.fn()}
      />
    );
    expect(await screen.findByTestId('dashboard-section-title')).toBeInTheDocument();
    expect(screen.queryByText(/Experimentos \(/)).not.toBeInTheDocument();
    expect(screen.queryByText('Inteligência Financeira V1')).not.toBeInTheDocument();
    expect(apiFetch.mock.calls.some(c => String(c[0]).includes('/financial/dashboard'))).toBe(false);
  });

  it('resumo do crédito só para ADMIN, com atalho para o detalhe', async () => {
    const apiFetch = vi.fn(async () => ({ limit: 1000, available: 350, forecast: { days_at_budgets: 7, days_at_avg: 9 }, alerts: [{ level: 'WARNING', message: 'Crédito acaba em 7 dias' }] }));
    const onOpen = vi.fn();
    const { unmount } = render(<CreditSummary currentUser={user('ADMIN')} isDemoView={false} apiFetch={apiFetch as any} onOpenDetails={onOpen} />);
    const box = await screen.findByTestId('credit-summary');
    expect(box).toHaveTextContent('R$');
    expect(box).toHaveTextContent('7 dias');
    fireEvent.click(within(box).getByText('ver detalhes'));
    expect(onOpen).toHaveBeenCalled();
    unmount();
    const other = vi.fn();
    render(<CreditSummary currentUser={user('PERFORMANCE')} isDemoView={false} apiFetch={other as any} />);
    expect(screen.queryByTestId('credit-summary')).not.toBeInTheDocument();
    expect(other).not.toHaveBeenCalled();
  });
});

describe('NORQVA-0030 — menu final', () => {
  it('fica com 10 itens nas cinco áreas', () => {
    expect(navigationItems).toHaveLength(10);
    expect(navigationGroups.map(g => g.items.map(i => i.label))).toEqual([
      ['Visão Geral'],
      ['Pesquisa', 'Resultados'],
      ['Produtos', 'Criativos', 'Campanhas'],
      ['Vendas'],
      ['Marcas', 'Equipe', 'Configurações']
    ]);
  });
});
