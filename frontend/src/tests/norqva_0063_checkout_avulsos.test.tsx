// NORQVA-0063: checkout do kit com escolha entre kit completo e livros avulsos. Valores sempre do servidor.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { CheckoutView } from '../features/checkout/CheckoutView';
import { KitLandingPage } from '../features/public/KitLandingPage';
import { apiFetch } from '../lib/api';

vi.mock('../lib/api', () => ({
  API_BASE: 'https://norqva-staging-api.onrender.com/api',
  apiFetch: vi.fn()
}));

const kit = {
  id: 'off-kit-uuid',
  human_id: 'OFF-KIT5',
  name: 'Kit Cozinha Italiana em Casa',
  description: 'Os cinco livros',
  price: 89.5,
  promotional_price: 39.9,
  bonus: null,
  is_demo: false,
  bump: null,
  card: null,
  delivery_files: 5
};

const books = [
  { book: 'dolci', human_id: 'OFF-000005', offer_id: 'uuid-dolci', price: 14.9, card: null },
  { book: 'paes', human_id: 'OFF-000020', offer_id: 'uuid-paes', price: 19.9, card: null },
  { book: 'trattoria', human_id: 'OFF-000001', offer_id: 'uuid-trat', price: 14.9, card: null },
  { book: 'antipasti', human_id: 'OFF-000021', offer_id: 'uuid-anti', price: 19.9, card: null },
  { book: 'risotos', human_id: 'OFF-000022', offer_id: 'uuid-ris', price: 19.9, card: null }
];

const fill = () => {
  fireEvent.change(screen.getByPlaceholderText('Ex: João da Silva'), { target: { value: 'Maria Souza' } });
  fireEvent.change(screen.getByPlaceholderText('seuemail@empresa.com'), { target: { value: 'maria@example.com' } });
  fireEvent.change(screen.getByPlaceholderText('000.000.000-00'), { target: { value: '52998224725' } });
};

describe('NORQVA-0063 — checkout do kit: kit completo ou livros avulsos', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    (apiFetch as any).mockReset();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any;
  });

  it('o kit vem marcado, com o preço da oferta e a economia sobre a soma dos 5 livros', () => {
    render(<CheckoutView offer={kit as any} isDemo={false} collectionBooks={books} onOrderCreated={vi.fn()} onCancel={vi.fn()} showError={vi.fn()} />);
    expect(screen.getByTestId('choice-kit')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('choice-kit-price')).toHaveTextContent('R$ 39,90');
    // soma dos 5 = 89,50 → economia de 49,60
    expect(screen.getByTestId('choice-kit')).toHaveTextContent('Você economiza R$ 49,60');
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('R$ 39,90');
    expect(screen.queryByTestId('choice-books')).toBeNull();
  });

  it('avulsos: sem livro o botão fica desligado; com livros, total e sugestão do kit somam no navegador', () => {
    render(<CheckoutView offer={kit as any} isDemo={false} collectionBooks={books} onOrderCreated={vi.fn()} onCancel={vi.fn()} showError={vi.fn()} />);
    fireEvent.click(screen.getByTestId('choice-avulso'));
    expect(screen.getByText('Escolha pelo menos 1 livro').closest('button')).toBeDisabled();
    fireEvent.click(screen.getByTestId('choice-book-dolci'));
    fireEvent.click(screen.getByTestId('choice-book-paes'));
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('R$ 34,80');
    expect(screen.getByTestId('choice-nudge')).toHaveTextContent('Por mais R$ 5,10, você leva os 5 livros (74 receitas) em vez de 2.');
    fireEvent.click(screen.getByText('Trocar para o kit completo'));
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('R$ 39,90');
  });

  it('avulsos: o pedido sai com o primeiro livro (na ordem da coleção) e os outros só pelo código', async () => {
    (apiFetch as any).mockImplementation((url: string) =>
      Promise.resolve(url === '/customers' ? { id: 'cust-1' } : { id: 'ord-1', checkout_token: 'tok', total_amount: 34.8, status: 'PENDING', is_demo: false })
    );
    const onOrderCreated = vi.fn();
    render(<CheckoutView offer={kit as any} isDemo={false} collectionBooks={books} onOrderCreated={onOrderCreated} onCancel={vi.fn()} showError={vi.fn()} />);
    fireEvent.click(screen.getByTestId('choice-avulso'));
    fireEvent.click(screen.getByTestId('choice-book-dolci'));
    fireEvent.click(screen.getByTestId('choice-book-paes'));
    fill();
    fireEvent.click(screen.getByText('Pagar R$ 34,80 com Pix'));
    await waitFor(() => expect(onOrderCreated).toHaveBeenCalled());
    const call = (apiFetch as any).mock.calls.find((c: any[]) => c[0] === '/checkout');
    const body = JSON.parse(call[1].body);
    expect(body.offer_id).toBe('uuid-paes');
    expect(body.extra_offer_human_ids).toEqual(['OFF-000005']);
    expect(body).not.toHaveProperty('total_amount');
  });

  it('um livro só: pedido simples, sem lista de extras', async () => {
    (apiFetch as any).mockImplementation((url: string) =>
      Promise.resolve(url === '/customers' ? { id: 'cust-1' } : { id: 'ord-2', checkout_token: 'tok', total_amount: 14.9, status: 'PENDING', is_demo: false })
    );
    const onOrderCreated = vi.fn();
    render(<CheckoutView offer={kit as any} isDemo={false} collectionBooks={books} onOrderCreated={onOrderCreated} onCancel={vi.fn()} showError={vi.fn()} />);
    fireEvent.click(screen.getByTestId('choice-avulso'));
    fireEvent.click(screen.getByTestId('choice-book-trattoria'));
    fill();
    fireEvent.click(screen.getByText('Pagar R$ 14,90 com Pix'));
    await waitFor(() => expect(onOrderCreated).toHaveBeenCalled());
    const body = JSON.parse((apiFetch as any).mock.calls.find((c: any[]) => c[0] === '/checkout')[1].body);
    expect(body.offer_id).toBe('uuid-trat');
    expect(body).not.toHaveProperty('extra_offer_human_ids');
  });

  it('sem livros avulsos, o checkout continua como antes e não promete acesso permanente', () => {
    render(<CheckoutView offer={{ ...kit, delivery_files: 2 } as any} isDemo={false} onOrderCreated={vi.fn()} onCancel={vi.fn()} showError={vi.fn()} />);
    expect(screen.queryByTestId('checkout-choice')).toBeNull();
    expect(screen.getByText('Os livros em PDF chegam neste e-mail logo após o pagamento.')).toBeInTheDocument();
    expect(screen.queryByText(/acesso permanente/)).toBeNull();
  });

  it('NORQVA-0064: kit de 5 livros aberto por outra página (/p/) busca os avulsos sozinho', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({ ok: true, json: async () => (String(url).endsWith('/public/collection') ? { books } : {}) })
    ) as any;
    render(<CheckoutView offer={kit as any} isDemo={false} onOrderCreated={vi.fn()} onCancel={vi.fn()} showError={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('choice-avulso')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('choice-avulso'));
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
  });

  it('NORQVA-0064: oferta que não é o kit de 5 não busca a lista', () => {
    const f = vi.fn();
    global.fetch = f as any;
    render(<CheckoutView offer={{ ...kit, delivery_files: 1 } as any} isDemo={false} onOrderCreated={vi.fn()} onCancel={vi.fn()} showError={vi.fn()} />);
    expect(f).not.toHaveBeenCalledWith(expect.stringContaining('/public/collection'));
    expect(screen.queryByTestId('checkout-choice')).toBeNull();
  });

  it('página do kit com 5 PDFs mostra os cinco livros', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/public/collection')) return Promise.resolve({ ok: true, json: async () => ({ books }) });
      return Promise.resolve({ ok: true, json: async () => kit });
    }) as any;
    render(
      <MemoryRouter initialEntries={['/kit/OFF-KIT5']}>
        <KitLandingPage showError={vi.fn()} showSuccess={vi.fn()} />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('Os cinco livros juntos, por menos')).toBeInTheDocument());
    expect(screen.getByTestId('kit-five-covers').querySelectorAll('img')).toHaveLength(5);
    expect(screen.getAllByText('Incluído no kit')).toHaveLength(5);
    expect(screen.queryByText('Em breve · não incluído no kit')).toBeNull();
  });
});
