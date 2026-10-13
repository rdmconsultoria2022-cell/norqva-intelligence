// NORQVA-0057 (parte 2): excluir para a lixeira e restaurar, sempre com o código digitado.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TrashAction, CatalogTrash } from '../features/products/CatalogTrash';

describe('NORQVA-0057 — lixeira', () => {
  it('excluir pede o código e chama a rota da lixeira', async () => {
    const apiFetch = vi.fn(async () => ({ item: {} }));
    const onDone = vi.fn();
    render(<TrashAction kind="offer" action="delete" item={{ id: 'o1', human_id: 'OFF-000012' }} apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} onDone={onDone} />);
    fireEvent.click(screen.getByTestId('delete-offer-OFF-000012'));
    expect(screen.getByTestId('delete-offer-OFF-000012-confirm')).toHaveTextContent('Quem já comprou continua baixando');
    expect(screen.getByTestId('delete-offer-OFF-000012-go')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Código para excluir oferta OFF-000012'), { target: { value: 'off-000012' } });
    fireEvent.click(screen.getByTestId('delete-offer-OFF-000012-go'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [url, opts] = (apiFetch.mock.calls[0] as any[]);
    expect(url).toBe('/offers/o1/delete?mode=real');
    expect(JSON.parse(opts.body)).toEqual({ confirm_code: 'off-000012' });
  });

  it('lixeira lista os itens e restaura', async () => {
    const apiFetch = vi.fn(async (url: string) => {
      if (url === '/catalog/trash') {
        return {
          products: [{ id: 'p1', human_id: 'PRD-000009', name: 'Pães', deleted_at: '2026-10-13T20:00:00Z' }],
          offers: [
            { id: 'o2', human_id: 'OFF-000020', name: 'Pães oferta', product_name: 'Pães', product_deleted: true, deleted_at: '2026-10-13T20:00:00Z' },
            { id: 'o3', human_id: 'OFF-000021', name: 'Outra', product_name: 'Trattoria', product_deleted: false, deleted_at: '2026-10-13T20:00:00Z' }
          ]
        };
      }
      return { item: {} };
    });
    render(<CatalogTrash apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('toggle-trash'));
    expect(screen.getByTestId('toggle-trash')).toHaveTextContent('Lixeira (3)');
    expect(screen.getByText('Restaure antes o produto.')).toBeInTheDocument();
    expect(screen.queryByTestId('restore-offer-OFF-000020')).toBeNull();
    fireEvent.click(screen.getByTestId('restore-offer-OFF-000021'));
    fireEvent.change(screen.getByLabelText('Código para restaurar OFF-000021'), { target: { value: 'OFF-000021' } });
    fireEvent.click(screen.getByTestId('restore-offer-OFF-000021-go'));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/offers/o3/restore?mode=real', expect.objectContaining({ method: 'POST' })));
  });

  it('lixeira vazia não aparece', async () => {
    const apiFetch = vi.fn(async () => ({ products: [], offers: [] }));
    const { container } = render(<CatalogTrash apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="catalog-trash"]')).toBeNull();
  });
});
