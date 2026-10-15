// NORQVA-0061: página de venda de cada livro da coleção e livros à venda separadamente na página do kit.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicOfferPage } from '../features/public/PublicOfferPage';
import { KitLandingPage } from '../features/public/KitLandingPage';
import { bookPageFor } from '../features/public/bookPages';

vi.mock('../lib/api', () => ({
  API_BASE: 'https://norqva-staging-api.onrender.com/api',
  apiFetch: vi.fn()
}));

const offer = (over: any = {}) => ({
  id: 'off-paes', human_id: 'OFF-000020', name: 'Pães & Fermentação Natural', description: 'x',
  price: 19.9, promotional_price: null, bonus: null, is_demo: false, ...over
});

const renderOffer = (data: any) => {
  global.fetch = vi.fn().mockImplementation((url: string) =>
    Promise.resolve({ ok: true, json: async () => (String(url).includes('/public/offers/') ? data : {}) })
  ) as any;
  render(
    <MemoryRouter initialEntries={[`/p/${data.human_id}`]}>
      <Routes>
        <Route path="/p/:humanId" element={<PublicOfferPage showError={vi.fn()} showSuccess={vi.fn()} />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('NORQVA-0061 — páginas dos livros da coleção', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('a página do Pães mostra o livro certo, sem textos do Trattoria', async () => {
    renderOffer(offer({ book: 'paes' }));
    await waitFor(() => expect(screen.getAllByText('PÃES & FERMENTAÇÃO NATURAL').length).toBeGreaterThan(0));
    expect(screen.getByText('02. Pão rústico de fermentação natural')).toBeInTheDocument();
    expect(screen.queryByText(/TRATTORIA EM CASA/)).toBeNull();
    expect(screen.queryByText(/28 Preparações/)).toBeNull();
    expect((screen.getByAltText('Capa do livro Pães & Fermentação Natural') as HTMLImageElement).src).toContain('/images/livros/paes/capa.jpg');
  });

  it('sem livro, a página continua a do Trattoria', async () => {
    renderOffer(offer({ human_id: 'OFF-000001', name: 'Trattoria em Casa', book: null }));
    await waitFor(() => expect(screen.getAllByText('TRATTORIA EM CASA').length).toBeGreaterThan(0));
    expect(screen.getByText('O Conteúdo Detalhado dos 5 Módulos')).toBeInTheDocument();
  });

  it('cada livro tem 12 receitas listadas e textos sem preço', () => {
    for (const key of ['paes', 'antipasti', 'risotos']) {
      const p = bookPageFor(key);
      expect(p.modules.flatMap(m => m.items)).toHaveLength(12);
      const text = JSON.stringify(p);
      expect(text).not.toMatch(/R\$\s*\d/);
    }
    expect(bookPageFor('outro').brand).toBe('TRATTORIA EM CASA');
  });

  it('página do kit: livro ativo vira "Disponível separadamente" com link; os outros seguem "Em breve"', async () => {
    const kit = { id: 'k', human_id: 'OFF-KIT', name: 'Kit Cozinha Italiana', description: 'x', price: 34.8, promotional_price: 27.9, bonus: null, is_demo: false };
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/public/collection')) return Promise.resolve({ ok: true, json: async () => ({ books: [{ book: 'paes', human_id: 'OFF-000020', price: 19.9 }] }) });
      return Promise.resolve({ ok: true, json: async () => kit });
    }) as any;
    render(
      <MemoryRouter initialEntries={['/kit/OFF-KIT']}>
        <KitLandingPage showError={vi.fn()} showSuccess={vi.fn()} />
      </MemoryRouter>
    );
    const link = await screen.findByTestId('collection-paes');
    expect(link).toHaveAttribute('href', '/p/OFF-000020');
    expect(link).toHaveTextContent('Disponível separadamente · R$ 19,90');
    expect(screen.queryByTestId('collection-antipasti')).toBeNull();
    expect(screen.getAllByText('Em breve · não incluído no kit')).toHaveLength(2);
  });
});
