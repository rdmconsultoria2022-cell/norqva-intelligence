import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { CreativeMediaView } from '../features/creative-media/CreativeMediaView';

// Mock apiFetch from lib
vi.mock('../lib/api', () => ({
  apiFetch: vi.fn()
}));

describe('CreativeMediaView Component Regression', () => {
  const mockCurrentUser = { id: '1', name: 'Test User', role: 'ADMIN', email: 'test@norqva.com' };
  const mockProducts = [{ id: 'p-1', name: 'Product 1', human_id: 'PRD-001' }];
  const mockOffers = [{ id: 'o-1', name: 'Offer 1', product_id: 'p-1' }];
  const mockCreatives = [
    {
      id: 'c-1',
      human_id: 'CRT-001',
      hook: 'Best Hook',
      concept: 'Concept 1',
      copy: 'Copy text',
      cta: 'Buy now',
      format: 'VIDEO',
      file_url: 'http://test.com/video.mp4',
      product_name: 'Product 1'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders creatives table and allows opening the add creative modal', async () => {
    const refreshMock = vi.fn().mockResolvedValue(undefined);

    render(
      <CreativeMediaView
        creatives={mockCreatives}
        products={mockProducts}
        offers={mockOffers}
        isDemoView={true}
        currentUser={mockCurrentUser}
        showError={vi.fn()}
        showSuccess={vi.fn()}
        refreshCreatives={refreshMock}
      />
    );

    expect(screen.getByText(/Best Hook/i)).toBeInTheDocument();

    const addBtn = screen.getByRole('button', { name: /Cadastrar Criativo/i });
    fireEvent.click(addBtn);

    expect(screen.getByText('Cadastrar Criativo no Lab')).toBeInTheDocument();
  });

  it('submits correct payload, preserves DEMO/REAL, and calls refresh exactly 1 time', async () => {
    const refreshMock = vi.fn().mockResolvedValue(undefined);
    const successMock = vi.fn();
    const errorMock = vi.fn();

    const { apiFetch } = await import('../lib/api');
    vi.mocked(apiFetch).mockResolvedValue({ creative: {} });

    const { container } = render(
      <CreativeMediaView
        creatives={mockCreatives}
        products={mockProducts}
        offers={mockOffers}
        isDemoView={false} // Real mode
        currentUser={mockCurrentUser}
        showError={errorMock}
        showSuccess={successMock}
        refreshCreatives={refreshMock}
      />
    );

    // Open Modal
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar Criativo/i }));

    // Fill form using CSS selectors
    const productSelect = container.querySelectorAll('select')[0]!;
    const formatSelect = container.querySelectorAll('select')[2]!;
    const ctaInput = container.querySelector('input[placeholder*="Saiba Mais"]')!;
    const hookInput = container.querySelector('input[placeholder*="Primeiros 3 segundos"]')!;
    const conceptInput = container.querySelector('textarea[placeholder*="Direção de arte"]')!;
    const copyInput = container.querySelector('textarea[placeholder*="Roteiro de copy"]')!;
    const fileUrlInput = container.querySelector('input[placeholder*="bucket.supabase.co"]')!;

    fireEvent.change(productSelect, { target: { value: 'p-1' } });
    fireEvent.change(formatSelect, { target: { value: 'VIDEO' } });
    fireEvent.change(ctaInput, { target: { value: 'Click here' } });
    fireEvent.change(hookInput, { target: { value: 'Awesome Hook' } });
    fireEvent.change(conceptInput, { target: { value: 'Fun Concept' } });
    fireEvent.change(copyInput, { target: { value: 'Buy this!' } });
    fireEvent.change(fileUrlInput, { target: { value: 'https://bucket.supabase.co/video.mp4' } });
    
    // Submit using closest form from Cadastrar button
    const submitBtn = screen.getByRole('button', { name: 'Cadastrar' });
    fireEvent.submit(submitBtn.closest('form')!);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledTimes(1);
    });

    // Verify mode=real is preserved
    expect(apiFetch).toHaveBeenCalledWith(
      '/creatives?mode=real',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"hook":"Awesome Hook"')
      }),
      'real',
      mockCurrentUser
    );

    expect(successMock).toHaveBeenCalledWith('Criativo adicionado ao Creative Lab!');
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
