// NORQVA-0034: produtos criados pela tela que ficaram fora da lista; sem modo demonstração fora dos testes.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HiddenProducts } from '../features/products/HiddenProducts';

describe('NORQVA-0034 — produtos fora da lista', () => {
  it('lista e traz para a lista, avisando a tela para recarregar', async () => {
    let hidden = [{ id: 'p9', human_id: 'PRD-000009', name: 'Dolci della Nonna', offers_count: 0, created_at: '2026-10-09T21:20:00Z' }];
    const apiFetch = vi.fn(async (url: string, opts?: any) => {
      if (url === '/products/p9/bring-to-list' && opts?.method === 'POST') {
        hidden = [];
        return { product_id: 'p9', human_id: 'PRD-000009', offers: [] };
      }
      return { products: hidden };
    });
    const onChanged = vi.fn();
    const showSuccess = vi.fn();
    render(<HiddenProducts apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={showSuccess} onChanged={onChanged} />);
    expect(await screen.findByTestId('hidden-product')).toHaveTextContent('Dolci della Nonna');
    fireEvent.click(screen.getByTestId('bring-to-list'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(showSuccess).toHaveBeenCalledWith('Dolci della Nonna agora aparece na lista.');
    await waitFor(() => expect(screen.queryByTestId('hidden-products')).not.toBeInTheDocument());
  });

  it('sem nada escondido, não mostra o quadro', async () => {
    const apiFetch = vi.fn(async () => ({ products: [] }));
    render(<HiddenProducts apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(screen.queryByTestId('hidden-products')).not.toBeInTheDocument();
  });

});
