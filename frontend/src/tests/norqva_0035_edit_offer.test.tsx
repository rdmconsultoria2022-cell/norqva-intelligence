// NORQVA-0035: editar oferta pela tela (nome, preço, promocional, descrição, bônus).
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OfferEditor } from '../features/products/OfferEditor';
import { OfferCard } from '../features/products/ProductsView';

const off = { id: 'off-9', human_id: 'OFF-000012', name: 'Dormi Della Nonna', price: '14.90', promotional_price: null, description: '10 sobremesas', bonus: null, status: 'TESTE', is_demo: false };

describe('NORQVA-0035 — editar oferta', () => {
  it('corrige o nome e salva só os campos editáveis', async () => {
    const apiFetch = vi.fn(async () => ({ offer: {} }));
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<OfferEditor off={off} apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} onSaved={onSaved} onClose={onClose} />);
    const name = screen.getByLabelText('Nome da oferta') as HTMLInputElement;
    expect(name.value).toBe('Dormi Della Nonna');
    expect((screen.getByLabelText('Preço da oferta') as HTMLInputElement).value).toBe('14,90');
    fireEvent.change(name, { target: { value: '  Dolci della Nonna ' } });
    expect(screen.queryByTestId('offer-price-warning')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('offer-editor-save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    const [url, opts] = (apiFetch.mock.calls[0] as any[]);
    expect(url).toBe('/offers/off-9?mode=real');
    expect(opts.method).toBe('PUT');
    expect(JSON.parse(opts.body)).toEqual({ name: 'Dolci della Nonna', price: 14.9, promotional_price: null, description: '10 sobremesas', bonus: null });
  });

  it('avisa ao mudar o preço de oferta em venda e bloqueia valores inválidos', () => {
    render(<OfferEditor off={off} apiFetch={vi.fn() as any} showError={vi.fn()} showSuccess={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Preço da oferta'), { target: { value: '16,90' } });
    expect(screen.getByTestId('offer-price-warning')).toHaveTextContent('próximos pedidos');
    fireEvent.change(screen.getByLabelText('Preço da oferta'), { target: { value: '0' } });
    expect(screen.getByTestId('offer-editor-save')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Preço da oferta'), { target: { value: '14,90' } });
    fireEvent.change(screen.getByLabelText('Nome da oferta'), { target: { value: '   ' } });
    expect(screen.getByTestId('offer-editor-save')).toBeDisabled();
  });

  it('botão Editar oferta só para quem pode editar', () => {
    const base = { off, isAdmin: false, onCheckout: vi.fn(), onUpdateOfferStatus: vi.fn(), onManageAssets: vi.fn(), editor: (close: () => void) => <button onClick={close}>fechar editor</button> };
    const { rerender } = render(<OfferCard {...base} canEdit={false} />);
    expect(screen.queryByTestId('edit-offer')).not.toBeInTheDocument();
    rerender(<OfferCard {...base} canEdit={true} />);
    fireEvent.click(screen.getByTestId('edit-offer'));
    fireEvent.click(screen.getByText('fechar editor'));
    expect(screen.getByTestId('edit-offer')).toBeInTheDocument();
  });
});
