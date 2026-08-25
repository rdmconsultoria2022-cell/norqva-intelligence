import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { OpportunitiesView } from '../features/opportunities/OpportunitiesView';

// Mock apiFetch from lib
vi.mock('../lib/api', () => ({
  apiFetch: vi.fn()
}));

describe('OpportunitiesView Component Regression', () => {
  const mockCurrentUser = { id: '1', name: 'Test User', role: 'ADMIN', email: 'test@norqva.com' };
  const mockUsers = [{ id: '1', name: 'Test User', role: 'ADMIN', email: 'test@norqva.com' }];
  const mockOpportunities = [
    {
      id: 'opp-1',
      human_id: 'OPP-001',
      title: 'Opportunity A',
      status: 'AGUARDANDO_DECISAO',
      score: 8.5,
      final_product_score: '8.5',
      confidence_score: '75',
      category: 'E-COMMERCE',
      subcategory: 'BEAUTY',
      source: 'TIKTOK',
      description: 'Desc',
      target_audience: 'Gen Z',
      problem_desire: 'Skin care',
      format: 'VIDEO',
      reference_url: 'http://ref.com',
      notes: 'Some notes'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders opportunities and handles selection & history fetch with abort logic', async () => {
    const { apiFetch } = await import('../lib/api');
    vi.mocked(apiFetch).mockResolvedValue({ history: [{ event_type: 'IA_SCORE_GENERATE', description: 'Score generated' }] });

    render(
      <OpportunitiesView
        opportunities={mockOpportunities}
        users={mockUsers}
        currentUser={mockCurrentUser}
        isDemoView={true}
        showError={vi.fn()}
        showSuccess={vi.fn()}
        refreshOpportunities={vi.fn()}
        refreshProducts={vi.fn()}
        refreshDecisions={vi.fn()}
      />
    );

    expect(screen.getByText('Opportunity A', { selector: 'h4' })).toBeInTheDocument();

    // Click on opportunity title in list
    fireEvent.click(screen.getByText('Opportunity A', { selector: 'h4' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/opportunities/opp-1/history'),
        expect.any(Object),
        'demo',
        mockCurrentUser
      );
    });
  });

  it('handles decision submit and calls the correct granular refreshes (opp, decisions, products)', async () => {
    const refreshOppsMock = vi.fn().mockResolvedValue(undefined);
    const refreshDecsMock = vi.fn().mockResolvedValue(undefined);
    const refreshPrdsMock = vi.fn().mockResolvedValue(undefined);
    const successMock = vi.fn();

    const { apiFetch } = await import('../lib/api');
    vi.mocked(apiFetch).mockImplementation((url) => {
      if (url.includes('/history')) {
        return Promise.resolve({ history: [] });
      }
      if (url.includes('/decide')) {
        return Promise.resolve({ decision: {} });
      }
      if (url.includes('/opportunities')) {
        return Promise.resolve({ opportunities: mockOpportunities });
      }
      return Promise.resolve({});
    });

    render(
      <OpportunitiesView
        opportunities={mockOpportunities}
        users={mockUsers}
        currentUser={mockCurrentUser}
        isDemoView={true}
        showError={vi.fn()}
        showSuccess={successMock}
        refreshOpportunities={refreshOppsMock}
        refreshProducts={refreshPrdsMock}
        refreshDecisions={refreshDecsMock}
      />
    );

    // Select the opportunity first
    fireEvent.click(screen.getByText('Opportunity A', { selector: 'h4' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tomar Decisão Estratégica/i })).toBeInTheDocument();
    });

    // Open decide form
    fireEvent.click(screen.getByRole('button', { name: /Tomar Decisão Estratégica/i }));

    // Submit decision form
    const submitBtn = screen.getByRole('button', { name: 'Gravar Decisão' });
    fireEvent.submit(submitBtn.closest('form')!);

    await waitFor(() => {
      // should hit decide endpoint
      expect(apiFetch).toHaveBeenCalledWith(
        '/opportunities/opp-1/decide?mode=demo',
        expect.objectContaining({ method: 'POST' }),
        'demo',
        mockCurrentUser
      );
    });

    expect(successMock).toHaveBeenCalledWith('Decisão de investimento gravada! Snapshot imutável gerado.');
    expect(refreshOppsMock).toHaveBeenCalledTimes(1);
    expect(refreshDecsMock).toHaveBeenCalledTimes(1);
    expect(refreshPrdsMock).toHaveBeenCalledTimes(1);
  });
});
