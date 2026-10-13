// NORQVA-0062: tela Produtos com filtros por situação, arquivados, nome, marca e modos de exibição.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ProductsView, productSituation } from '../features/products/ProductsView';

const admin = { id: 'u1', name: 'Admin', role: 'ADMIN', email: 'a@x.test' } as any;

const products = [
  { id: 'p1', human_id: 'PRD-1', name: 'Trattoria em Casa', category: 'Receitas', description: 'd', status: 'ATIVO', brand_id: 'b1' },
  { id: 'p2', human_id: 'PRD-2', name: 'Pães & Fermentação Natural', category: 'Receitas', description: 'd', status: 'PLANEJADO', brand_id: 'b1', collection_key: 'paes' },
  { id: 'p3', human_id: 'PRD-3', name: 'Bolso Blindado', category: 'Finanças', description: 'd', status: 'PLANEJADO', brand_id: null },
  { id: 'p4', human_id: 'PRD-4', name: 'Produto antigo', category: 'X', description: 'd', status: 'ARQUIVADO', brand_id: null }
];
const offers = [
  { id: 'o1', human_id: 'OFF-1', name: 'Trattoria', price: '19.90', product_id: 'p1', status: 'ATIVA', is_demo: false },
  { id: 'o2', human_id: 'OFF-2', name: 'Pães', price: '19.90', product_id: 'p2', status: 'TESTE', is_demo: false },
  { id: 'o3', human_id: 'OFF-3', name: 'Bolso', price: '29.90', product_id: 'p3', status: 'PAUSADA', is_demo: false }
];

const setup = async () => {
  const apiFetch = vi.fn(async (url: string) => (url === '/brands' ? { brands: [{ id: 'b1', name: 'Cozinha Nonna' }] } : {}));
  render(
    <ProductsView
      products={products}
      offers={offers}
      currentUser={admin}
      apiFetch={apiFetch as any}
      showError={vi.fn()}
      showSuccess={vi.fn()}
      onAddProduct={vi.fn()}
      onEditProduct={vi.fn()}
      onAddOffer={vi.fn()}
      onUpdateOfferStatus={vi.fn()}
      onCheckout={vi.fn()}
    />
  );
  // espera as marcas carregarem
  await screen.findByTestId('brand-filter');
};

const names = () => screen.queryAllByTestId('product-card').map(c => within(c).getByRole('heading', { level: 3 }).textContent);

describe('NORQVA-0062 — opções de exibição em Produtos', () => {
  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it('situação de venda vem das ofertas', () => {
    expect(productSituation([{ status: 'TESTE' }, { status: 'ATIVA' }])).toBe('SELLING');
    expect(productSituation([{ status: 'TESTE' }])).toBe('TESTING');
    expect(productSituation([{ status: 'RASCUNHO' }])).toBe('OFF');
    expect(productSituation([])).toBe('OFF');
  });

  it('filtra por situação e esconde arquivados até marcar a opção', async () => {
    await setup();
    expect(names()).toEqual(['Trattoria em Casa', 'Pães & Fermentação Natural', 'Bolso Blindado']);
    expect(screen.getByTestId('situation-SELLING')).toHaveTextContent('À venda (1)');
    expect(screen.getByTestId('situation-OFF')).toHaveTextContent('Fora do ar (1)');
    fireEvent.click(screen.getByTestId('situation-TESTING'));
    expect(names()).toEqual(['Pães & Fermentação Natural']);
    fireEvent.click(screen.getByTestId('situation-ALL'));
    fireEvent.click(screen.getByTestId('show-archived'));
    expect(names()).toContain('Produto antigo');
  });

  it('procura pelo nome e pela marca', async () => {
    await setup();
    fireEvent.change(screen.getByTestId('product-name-filter'), { target: { value: 'p3' } });
    expect(names()).toEqual(['Bolso Blindado']);
    fireEvent.change(screen.getByTestId('product-name-filter'), { target: { value: 'ALL' } });
    fireEvent.change(screen.getByTestId('brand-filter'), { target: { value: 'b1' } });
    expect(names()).toEqual(['Trattoria em Casa', 'Pães & Fermentação Natural']);
    fireEvent.change(screen.getByTestId('brand-filter'), { target: { value: 'NONE' } });
    expect(names()).toEqual(['Bolso Blindado']);
  });

  it('modo ícones mostra a capa; clicar volta para a lista com o produto aberto', async () => {
    await setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Ícones grandes' }));
    const tiles = screen.getAllByTestId('icon-tile');
    expect(tiles).toHaveLength(3);
    expect(screen.getByAltText('Pães & Fermentação Natural').getAttribute('src')).toContain('/images/livros/paes/capa.jpg');
    fireEvent.click(tiles[1]);
    expect(screen.getAllByTestId('product-card')).toHaveLength(3);
    const paes = screen.getAllByTestId('product-card')[1];
    expect(within(paes).getByTestId('product-offers')).toBeInTheDocument();
  });
});
