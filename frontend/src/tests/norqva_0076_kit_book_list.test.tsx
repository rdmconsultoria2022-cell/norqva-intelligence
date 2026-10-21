// NORQVA-0076: página do kit com a lista dos livros (preço de cada um vindo do servidor), contagem de 5 minutos e botão do kit animado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { KitLandingPage } from '../features/public/KitLandingPage';

vi.mock('../lib/api', () => ({
  API_BASE: 'https://norqva-staging-api.onrender.com/api',
  apiFetch: vi.fn()
}));

const kit = {
  id: 'off-kit-uuid', human_id: 'OFF-KIT5', name: 'Kit Cozinha Italiana em Casa', description: 'Os cinco livros',
  price: 94.5, promotional_price: 79.92, bonus: null, is_demo: false, bump: null, delivery_files: 5,
  card: { max_installments: 4, total: 79.92, installment_value: 19.98, interest_monthly: 2.99 }
};

// fora de ordem de propósito: a página ordena pela coleção (Dolci por último)
const books = [
  { book: 'dolci', human_id: 'OFF-000005', offer_id: 'o5', price: 14.9, card: null },
  { book: 'trattoria', human_id: 'OFF-000001', offer_id: 'o1', price: 19.9, card: null },
  { book: 'risotos', human_id: 'OFF-000009', offer_id: 'o9', price: 19.9, card: null },
  { book: 'antipasti', human_id: 'OFF-000008', offer_id: 'o8', price: 19.9, card: null },
  { book: 'paes', human_id: 'OFF-000007', offer_id: 'o7', price: 19.9, card: null }
];

const renderKit = (offer: any, list: any[] = books) => {
  global.fetch = vi.fn().mockImplementation((url: string) =>
    Promise.resolve({ ok: true, json: async () => (String(url).endsWith('/public/collection') ? { books: list } : offer) })
  ) as any;
  return render(
    <MemoryRouter initialEntries={['/kit/OFF-KIT5']}>
      <KitLandingPage showError={vi.fn()} showSuccess={vi.fn()} />
    </MemoryRouter>
  );
};

describe('NORQVA-0076 — lista de livros, contagem e botão do kit', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lista os 5 livros do mais barato ao mais caro (Dolci primeiro), com o preço do servidor', async () => {
    renderKit(kit);
    const list = await screen.findByTestId('kit-book-list');
    const rows = list.querySelectorAll('.bk-row');
    expect(Array.from(rows).map(r => r.getAttribute('data-testid'))).toEqual([
      'kit-book-dolci', 'kit-book-trattoria', 'kit-book-risotos', 'kit-book-antipasti', 'kit-book-paes'
    ]);
    expect(screen.getByTestId('kit-book-price-dolci')).toHaveTextContent('R$ 14,90');
    expect(screen.getByTestId('kit-book-price-paes')).toHaveTextContent('R$ 19,90');
    expect(rows[0].querySelector('img')).toHaveAttribute('alt', 'Capa do livro Dolci della Nonna');
    expect(screen.getAllByText('Quero comprar somente esse exemplar')).toHaveLength(5);
  });

  it('antes das ofertas: o topo mostra o preço do kit (NORQVA-0108) e o "a partir de" dos avulsos só no link; sem parcelas', async () => {
    const { container } = renderKit(kit);
    await screen.findByTestId('kit-book-list');
    expect(screen.getByTestId('kit-hero-banner')).toHaveTextContent('Kit completo · 5 livros por R$ 79,92');
    expect(screen.getByTestId('kit-hero-books-link')).toHaveTextContent('ou veja os livros separados, a partir de R$ 14,90');
    expect(screen.queryByTestId('kit-from-hero')).toBeNull();
    expect(screen.getByTestId('kit-sticky-bar')).toHaveTextContent('R$ 14,90');
    expect(screen.getByTestId('kit-sticky-bar')).not.toHaveTextContent('19,98');
    // antes da seção de ofertas: faixa (kit), "de/por" do kit, preço do kit e o link dos avulsos; nenhuma parcela
    const html = container.innerHTML;
    const before = html.slice(0, html.indexOf('id="oferta"'));
    expect(before.match(/R\$/g)).toHaveLength(4);
    expect(before).not.toMatch(/\d+x/);
    // a seção de ofertas vem depois das dúvidas
    expect(html.indexOf('id="perguntas"')).toBeLessThan(html.indexOf('id="oferta"'));
    expect(html.indexOf('id="pratos"')).toBeLessThan(html.indexOf('id="receitas"'));
  });

  it('o kit mostra o preço cheio riscado (soma dos livros) e o preço promocional', async () => {
    renderKit(kit);
    await screen.findByTestId('kit-book-list');
    expect(screen.getByTestId('kit-from')).toHaveTextContent('de R$ 94,50 por');
    expect(screen.getByTestId('kit-from')).toHaveTextContent('soma dos 5 livros comprados separadamente');
    expect(screen.getByTestId('kit-pix')).toHaveTextContent('R$ 79,92');
    expect(screen.getByTestId('kit-cta')).toHaveClass('beat');
  });

  it('"somente esse exemplar" abre o pagamento já nos avulsos com o livro marcado', async () => {
    renderKit(kit);
    fireEvent.click(await screen.findByTestId('kit-book-buy-dolci'));
    await waitFor(() => expect(screen.getByTestId('choice-book-dolci')).toBeChecked());
    expect(screen.getByTestId('choice-book-paes')).not.toBeChecked();
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('R$ 14,90');
  });

  it('a contagem começa em 05:00, desce a cada segundo e para em 00:00', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderKit(kit);
    const timer = await screen.findByTestId('kit-timer-list');
    expect(timer).toHaveTextContent(/0[45]:[0-5]\d/);
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000 + 2000);
    });
    expect(screen.getByTestId('kit-timer-list')).toHaveTextContent('00:00');
    expect(screen.getByTestId('kit-timer-card')).toHaveTextContent('Tempo de reserva encerrado');
  });

  it('kit de dois livros: a coleção não mostra o preço do livro avulso antes das ofertas', async () => {
    const { container } = renderKit({ ...kit, delivery_files: 2, promotional_price: 27.9, price: 34.8, card: null }, [
      { book: 'paes', human_id: 'OFF-000007', offer_id: 'o7', price: 19.9, card: null }
    ]);
    await waitFor(() => expect(screen.getByTestId('collection-paes')).toBeInTheDocument());
    expect(screen.getByTestId('collection-paes')).toHaveTextContent('Disponível separadamente');
    expect(screen.getByTestId('collection-paes')).not.toHaveTextContent('R$');
    const html = container.innerHTML;
    expect(html.slice(0, html.indexOf('id="oferta"'))).not.toMatch(/R\$\s?19,90/);
  });

  it('kit de dois livros não mostra a lista nem a contagem', async () => {
    renderKit({ ...kit, delivery_files: 2, promotional_price: 27.9, price: 34.8, card: null });
    await screen.findByTestId('kit-offer-card');
    expect(screen.queryByTestId('kit-book-list')).toBeNull();
    expect(screen.queryByTestId('kit-timer-card')).toBeNull();
  });
});
