// NORQVA-0108: primeira tela do kit completo mostra as capas, o kit, o preço do kit (do servidor) e o botão de compra.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { KitLandingPage } from '../features/public/KitLandingPage';

vi.mock('../lib/api', () => ({
  API_BASE: 'https://norqva-staging-api.onrender.com/api',
  apiFetch: vi.fn()
}));

const trackViewContent = vi.fn();
vi.mock('../services/metaPixel', async orig => ({
  ...((await orig()) as any),
  trackViewContent: (...a: any[]) => trackViewContent(...a)
}));

const kit = {
  id: 'off-kit-uuid', human_id: 'OFF-KIT5', name: 'KIT TRATTORIA COMPLETO — 5 LIVROS', description: 'Os cinco livros',
  price: 94.5, promotional_price: 29.9, bonus: null, is_demo: false, bump: null, delivery_files: 5,
  card: { max_installments: 1, total: 29.9, installment_value: 29.9, interest_monthly: 2.99 }
};

const books = [
  { book: 'trattoria', human_id: 'OFF-000001', offer_id: 'o1', price: 19.9, card: null },
  { book: 'dolci', human_id: 'OFF-000005', offer_id: 'o5', price: 14.9, card: null }
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

describe('NORQVA-0108 — primeira tela do kit completo', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    trackViewContent.mockClear();
  });

  it('mostra, nesta ordem, capas, título, resumo, preço do kit com "de" riscado e o botão do kit', async () => {
    renderKit(kit);
    const hero = await screen.findByTestId('kit-hero');
    await screen.findByTestId('kit-hero-books-link');
    const covers = within(hero).getByLabelText('Os cinco livros do kit em leque');
    const h1 = within(hero).getByRole('heading', { level: 1 });
    const summary = within(hero).getByTestId('kit-hero-summary');
    const price = within(hero).getByTestId('kit-hero-price');
    const cta = within(hero).getByTestId('kit-cta-top');
    const link = within(hero).getByTestId('kit-hero-books-link');
    const order = [covers, h1, summary, price, cta, link];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(h1).toHaveTextContent('A cozinha da nonna em 5 livros');
    expect(summary).toHaveTextContent('5 livros digitais · 74 receitas com foto e passo a passo');
    expect(price).toHaveTextContent('de R$ 94,50 por');
    expect(price).toHaveTextContent('R$ 29,90');
    expect(cta).toHaveTextContent('Quero o kit completo');
    expect(link).toHaveTextContent('ou veja os livros separados, a partir de R$ 14,90');
    expect(link).toHaveAttribute('href', '#oferta');
    expect(hero).toHaveTextContent('Pagamento seguro via Pix ou cartão');
    expect(hero).toHaveTextContent('Entrega imediata no e-mail');
    expect(screen.queryByTestId('kit-from-hero')).toBeNull();
  });

  it('o botão do topo abre o mesmo pagamento do kit (sem livro avulso marcado)', async () => {
    renderKit(kit);
    fireEvent.click(await screen.findByTestId('kit-cta-top'));
    await waitFor(() => expect(screen.getByTestId('checkout-total')).toHaveTextContent('R$ 29,90'));
  });

  it('capas do topo carregam na hora com tamanho; fotos mais abaixo carregam só ao chegar nelas', async () => {
    const { container } = renderKit(kit);
    const hero = await screen.findByTestId('kit-hero');
    const imgs = within(hero).getByLabelText('Os cinco livros do kit em leque').querySelectorAll('img');
    expect(imgs).toHaveLength(5);
    imgs.forEach(img => {
      expect(img).toHaveAttribute('loading', 'eager');
      expect(img).toHaveAttribute('width');
      expect(img).toHaveAttribute('height');
    });
    const below = Array.from(container.querySelectorAll('img')).filter(i => !hero.contains(i));
    expect(below.length).toBeGreaterThan(5);
    below.forEach(img => expect(img).toHaveAttribute('loading', 'lazy'));
  });

  it('continua enviando o ViewContent com o valor do kit', async () => {
    renderKit(kit);
    await screen.findByTestId('kit-hero');
    expect(trackViewContent).toHaveBeenCalledWith(expect.objectContaining({ contentIds: ['OFF-KIT5'], value: 29.9, currency: 'BRL' }));
  });

  it('kit de dois livros mantém o topo antigo', async () => {
    renderKit({ ...kit, delivery_files: 2, promotional_price: 27.9, price: 34.8, card: null }, []);
    await screen.findByTestId('kit-offer-card');
    expect(screen.queryByTestId('kit-hero')).toBeNull();
    expect(screen.getByText(/explicada receita por receita/)).toBeInTheDocument();
    expect(screen.getByTestId('kit-cta-top')).toHaveTextContent('Ver as ofertas');
  });
});
