// NORQVA-0138: Coleção Trattoria Completa. Entrega com o cartão do bônus (capa e texto próprios) e página /p/ simples,
// com o WhatsApp como caminho principal, sem o material do livro Trattoria.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { supabase } from '../supabase';
import { DigitalDelivery, isCardapioTitle, CARDAPIO_COVER } from '../features/delivery/DigitalDelivery';

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

const BOOKS = ['Trattoria em Casa', 'Dolci della Nonna', 'Pães & Fermentação Natural', 'Antipasti & Aperitivo', 'Risotos & Polentas'];
const BONUS = 'Cardápio italiano de 4 semanas com lista de compras';

describe('NORQVA-0138 — entrega da coleção', () => {
  it('só o cardápio italiano é reconhecido como bônus (o cardápio do Seca Barriga não)', () => {
    expect(isCardapioTitle(BONUS)).toBe(true);
    expect(isCardapioTitle('CARDAPIO ITALIANO 4 SEMANAS')).toBe(true);
    expect(isCardapioTitle('03 · Cardápio Acumulador — Padrão')).toBe(false);
    expect(isCardapioTitle('Trattoria em Casa')).toBe(false);
  });

  it('título da coleção, 5 livros e o bônus com capa e texto próprios', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/delivery-tokens')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            deliveries: [...BOOKS, BONUS].map((t, i) => ({ assetId: `a${i}`, assetTitle: t, rawToken: `tok${i}`, status: 'ACTIVE' })),
            accessEmailSent: true
          })
        });
      }
      if (url.includes('/orders/')) {
        return Promise.resolve({ ok: true, json: async () => ({ id: 'o1', status: 'PAID', total_amount: 47, offer_human_id: 'OFF-000020', offer_name_snapshot: 'Coleção Trattoria Completa' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }) as any;
    render(<DigitalDelivery orderId="o1" checkoutToken="t" isDemo={false} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByText('Sua Coleção Trattoria Completa está pronta!')).toBeInTheDocument();
    expect(screen.getByText(BONUS)).toBeInTheDocument();
    expect(screen.getByText('Bônus: 28 jantares com lista de compras')).toBeInTheDocument();
    const cover = screen.getByAltText(`Capa do livro ${BONUS}`);
    expect(cover.getAttribute('src')).toBe(CARDAPIO_COVER);
    expect(document.body.textContent).toContain('5 livros e o bônus');
    // o Trattoria continua com a capa e o texto dele (uma vez só)
    expect(screen.getAllByText('28 receitas • Massas, molhos e pizzas italianas (PDF)')).toHaveLength(1);
  });
});

describe('NORQVA-0138 — página /p/ da coleção', () => {
  const offer = {
    id: 'off-col', human_id: 'OFF-000020', name: 'Coleção Trattoria Completa', description: 'Os 5 livros da coleção em PDF.',
    price: 94.5, promotional_price: 47, bonus: 'Cardápio italiano de 4 semanas com lista de compras (PDF)', is_demo: false,
    book: null, card: null, bump: null, exit_offer: null, delivery_files: 6, whatsapp_first: true
  };
  beforeEach(() => {
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: null }, error: null });
    (supabase.auth.onAuthStateChange as any).mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });
  function renderAt(data: Record<string, unknown>) {
    window.history.replaceState(null, '', '/p/OFF-000020');
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/public/offers/')) return { ok: true, status: 200, json: async () => data };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    render(
      <MemoryRouter initialEntries={['/p/OFF-000020']}>
        <App />
      </MemoryRouter>
    );
  }

  it('com WhatsApp: página simples, nome, R$ 47,00, bônus e o botão do WhatsApp; nada do livro Trattoria', async () => {
    renderAt({ ...offer, whatsapp: { available: true } });
    expect(await screen.findByTestId('direct-checkout-page')).toBeTruthy();
    expect(screen.getByTestId('direct-checkout-name').textContent).toBe('Coleção Trattoria Completa');
    expect(screen.getByTestId('direct-checkout-price').textContent).toContain('47,00');
    expect(screen.getByTestId('direct-checkout-about').textContent).toContain('Bônus: Cardápio italiano de 4 semanas');
    expect(screen.getByTestId('whatsapp-cta')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/28 receitas|Massas & Molhos/);
  });

  it('sem WhatsApp disponível: a mesma página com o botão de pagamento', async () => {
    renderAt({ ...offer, whatsapp: null });
    expect(await screen.findByTestId('direct-checkout-page')).toBeTruthy();
    expect(screen.queryByTestId('whatsapp-cta')).toBeNull();
    expect(screen.getByTestId('direct-checkout-open')).toBeTruthy();
  });
});
