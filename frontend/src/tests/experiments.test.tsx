import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ExperimentsView } from '../features/experiments/ExperimentsView';

// Mock apiFetch from lib
vi.mock('../lib/api', () => ({
  apiFetch: vi.fn()
}));

describe('ExperimentsView Component Regression', () => {
  const mockCurrentUser = { id: '1', name: 'Test User', role: 'ADMIN', email: 'test@norqva.com' };
  const mockProducts = [{ id: 'p-1', name: 'Product A', human_id: 'PRD-001' }];
  const mockOffers = [{ id: 'o-1', name: 'Offer X', product_id: 'p-1', human_id: 'OFF-001' }];
  const mockCreatives = [{ id: 'c-1', hook: 'Hook 1', human_id: 'CRT-001' }];
  const mockExperiments = [
    {
      id: 'exp-1',
      human_id: 'EXP-001',
      name: 'Experiment 1',
      product_name: 'Product A',
      offer_name: 'Offer X',
      capital_approved: '1000',
      capital_used: '200',
      status: 'ATIVO'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders list of experiments and triggers callback actions', () => {
    const onSelectMock = vi.fn();
    const onPerfMock = vi.fn();
    const onCapMock = vi.fn();

    render(
      <ExperimentsView
        experiments={mockExperiments}
        products={mockProducts}
        offers={mockOffers}
        creatives={mockCreatives}
        currentUser={mockCurrentUser}
        isDemoView={true}
        onSelectExperiment={onSelectMock}
        onRegisterPerformance={onPerfMock}
        onAuthorizeCapital={onCapMock}
        showError={vi.fn()}
        showSuccess={vi.fn()}
        refreshExperiments={vi.fn()}
      />
    );

    expect(screen.getByText('Experiment 1')).toBeInTheDocument();

    // Click the experiment header wrapper to select/details
    fireEvent.click(screen.getByText('Experiment 1'));
    expect(onSelectMock).toHaveBeenCalledWith(mockExperiments[0]);

    // Click Performance
    fireEvent.click(screen.getByRole('button', { name: 'Lançar Performance' }));
    expect(onPerfMock).toHaveBeenCalledWith(mockExperiments[0].id);

    // Click Orçamento
    fireEvent.click(screen.getByRole('button', { name: 'Autorizar Orçamento' }));
    expect(onCapMock).toHaveBeenCalledWith(mockExperiments[0]);
  });

  it('submits a new experiment with validated payload fields', async () => {
    const refreshMock = vi.fn().mockResolvedValue(undefined);
    const successMock = vi.fn();
    const { apiFetch } = await import('../lib/api');
    vi.mocked(apiFetch).mockResolvedValue({ experiment: {} });

    const { container } = render(
      <ExperimentsView
        experiments={mockExperiments}
        products={mockProducts}
        offers={mockOffers}
        creatives={mockCreatives}
        currentUser={mockCurrentUser}
        isDemoView={true}
        onSelectExperiment={vi.fn()}
        onRegisterPerformance={vi.fn()}
        onAuthorizeCapital={vi.fn()}
        showError={vi.fn()}
        showSuccess={successMock}
        refreshExperiments={refreshMock}
      />
    );

    // Open Add Modal
    fireEvent.click(screen.getByRole('button', { name: 'Lançar Experimento' }));

    // Fill form using CSS selectors
    const nameInput = container.querySelector('input[placeholder*="Target Segment"]')!;
    const hypothesisInput = container.querySelector('textarea[placeholder*="testarmos X"]')!;
    const productSelect = container.querySelectorAll('select')[0]!;
    const offerSelect = container.querySelectorAll('select')[1]!;
    const startDateInput = container.querySelectorAll('input[type="date"]')[0]!;
    const endDateInput = container.querySelectorAll('input[type="date"]')[1]!;
    const capitalInput = container.querySelector('input[type="number"]')!;

    fireEvent.change(nameInput, { target: { value: 'New Test Campaign' } });
    fireEvent.change(hypothesisInput, { target: { value: 'Testing higher prices' } });
    fireEvent.change(productSelect, { target: { value: 'p-1' } });
    fireEvent.change(offerSelect, { target: { value: 'o-1' } });
    fireEvent.change(startDateInput, { target: { value: '2026-09-01' } });
    fireEvent.change(endDateInput, { target: { value: '2026-09-10' } });
    fireEvent.change(capitalInput, { target: { value: '500' } });

    // Submit using closest form
    fireEvent.submit(nameInput.closest('form')!);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledTimes(1);
    });

    expect(apiFetch).toHaveBeenCalledWith(
      '/experiments?mode=demo',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"name":"New Test Campaign"')
      }),
      'demo',
      mockCurrentUser
    );

    expect(successMock).toHaveBeenCalledWith('Experimento operacional lançado com sucesso!');
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
