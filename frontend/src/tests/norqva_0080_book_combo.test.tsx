// NORQVA-0080: oferta "livro + Dolci" na página de cada livro.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { supabase } from '../supabase';
import { comboMath } from '../features/public/BookComboOffer';

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }),
      refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null })
    }
  }
}));

const CARD = { max_installments: 1, total: 19.9, installment_value: 19.9, interest_monthly: 2.99, plan: { max: 10, free: 1, rate: 2.99 } };
const BUMP = { offer_human_id: 'OFF-000005', name: 'DOLCI DELLA NONNA', headline: 'Leve mais um livro de sobremesa por apenas R$ 5,00 comprando os dois.', price: 5, regular_price: 14.9 };

const bookOffer = (over: Record<string, unknown> = {}) => ({
  id: 'off-paes',
  human_id: 'OFF-000007',
  name: 'Pães & Fermentação Natural',
  description: 'Livro digital',
  price: 19.9,
  promotional_price: null,
  bonus: null,
  is_demo: false,
  book: 'paes',
  bump: BUMP,
  card: CARD,
  whatsapp: null,
  exit_offer: null,
  delivery_files: 1,
  ...over
});

describe('NORQVA-0080 — contas da oferta dos dois livros', () => {
  it('de R$ 34,80 por R$ 24,90, com o maior parcelamento real no cartão (5x de R$ 5,44)', () => {
    const m = comboMath(bookOffer() as any)!;
    expect(m.bookCents).toBe(1990);
    expect(m.comboCents).toBe(2490);
    expect(m.fullCents).toBe(3480);
    expect(m.extraCents).toBe(500);
    expect(m.maxCard).toEqual({ n: 5, valueCents: 544, totalCents: 2720, interest: true });
  });

  it('sem adicional, sem preço do Dolci sozinho ou sem economia, não mostra a oferta', () => {
    expect(comboMath(bookOffer({ bump: null }) as any)).toBeNull();
    expect(comboMath(bookOffer({ bump: { ...BUMP, regular_price: null } }) as any)).toBeNull();
    expect(comboMath(bookOffer({ bump: { ...BUMP, regular_price: 5 } }) as any)).toBeNull();
  });

  it('só aparece quando o adicional é o Dolci (a página do Dolci oferece o Trattoria e fica sem a seção)', () => {
    expect(comboMath(bookOffer({ bump: { ...BUMP, offer_human_id: 'OFF-000001', name: 'TRATTORIA EM CASA', price: 14.9, regular_price: 19.9 } }) as any)).toBeNull();
  });

  it('sem cartão, a oferta fica só no Pix', () => {
    expect(comboMath(bookOffer({ card: null }) as any)!.maxCard).toBeNull();
  });
});

describe('NORQVA-0080 — página do livro', () => {
  beforeEach(() => {
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: null }, error: null });
    (supabase.auth.onAuthStateChange as any).mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderPage(offer: Record<string, unknown>) {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/public/offers/')) return { ok: true, status: 200, json: async () => offer };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    render(
      <MemoryRouter initialEntries={[`/p/${offer.human_id}`]}>
        <App />
      </MemoryRouter>
    );
  }

  it('mostra a oferta com a soma real, a frase do Dolci e nenhum "10x"', async () => {
    renderPage(bookOffer());
    const sec = await screen.findByTestId('book-combo-offer');
    expect(within(sec).getByTestId('combo-full').textContent).toBe('R$ 34,80');
    expect(within(sec).getByTestId('combo-price').textContent).toBe('R$ 24,90');
    expect(within(sec).getByTestId('combo-phrase').textContent).toContain('R$ 5,00');
    expect(within(sec).getByTestId('combo-card').textContent).toContain('5x de R$ 5,44');
    expect(within(sec).getByTestId('combo-card').textContent).toContain('total R$ 27,20');
    expect(within(sec).getByText(/Dolci della Nonna/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/10x/);
    expect(screen.getByTestId('hero-combo-link').getAttribute('href')).toBe('#oferta');
  });

  it('"Quero os dois" abre o pagamento com o Dolci já marcado; "Só o livro" abre sem', async () => {
    renderPage(bookOffer());
    fireEvent.click(await screen.findByTestId('combo-buy-both'));
    const box = (await screen.findByTestId('checkout-bump')).querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(box.checked).toBe(true);
  });

  it('"Só o livro" abre o pagamento sem o Dolci', async () => {
    renderPage(bookOffer());
    fireEvent.click(await screen.findByTestId('combo-buy-book'));
    const box = (await screen.findByTestId('checkout-bump')).querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(box.checked).toBe(false);
  });

  it('sem adicional, a página do livro fica como antes', async () => {
    renderPage(bookOffer({ bump: null, card: null }));
    await screen.findAllByText('Pães & Fermentação Natural');
    expect(screen.queryByTestId('book-combo-offer')).toBeNull();
    expect(screen.queryByTestId('hero-combo-link')).toBeNull();
    expect(screen.getByText('Comprar com Pix')).toBeInTheDocument();
  });
});
