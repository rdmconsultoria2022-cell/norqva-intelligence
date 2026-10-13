// NORQVA-0057 (parte 1): upsell e cross-sell editáveis na oferta.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OfferEditor } from '../features/products/OfferEditor';

const off = { id: 'off-7', human_id: 'OFF-000007', name: 'Trattoria', price: '19.90', promotional_price: null, description: 'Livro', bonus: null, upsell: 'Kit', cross_sell: null, status: 'ATIVA', is_demo: false };

describe('NORQVA-0057 — upsell e cross-sell', () => {
  it('mostra os valores atuais e salva os novos', async () => {
    const apiFetch = vi.fn(async () => ({ offer: {} }));
    render(<OfferEditor off={off} apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} onClose={vi.fn()} />);
    expect((screen.getByLabelText('Upsell da oferta') as HTMLInputElement).value).toBe('Kit');
    fireEvent.change(screen.getByLabelText('Upsell da oferta'), { target: { value: '  ' } });
    fireEvent.change(screen.getByLabelText('Cross-sell da oferta'), { target: { value: 'Dolci della Nonna' } });
    fireEvent.click(screen.getByTestId('offer-editor-save'));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse((apiFetch.mock.calls[0] as any[])[1].body);
    expect(body.upsell).toBeNull();
    expect(body.cross_sell).toBe('Dolci della Nonna');
  });
});
