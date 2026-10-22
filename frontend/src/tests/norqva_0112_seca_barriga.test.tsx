// NORQVA-0112: Seca Barriga no checkout do NORQVA. Link direto (?checkout=1) com dados do quiz,
// atribuição (UTMs, fbclid, src) no pedido e visual 'fresh' só para o Seca Barriga.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { supabase } from '../supabase';
import { lookForNames, isFreshName } from '../lib/productLook';
import { normalizePrefillPhone, prefillFromSearch, wantsDirectCheckout } from '../features/checkout/checkoutPrefill';
import { isFullKit } from '../features/checkout/collectionChoice';

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

const CARD = {
  max_installments: 1, total: 37, installment_value: 37, interest_monthly: 2.99, plan: { max: 10, free: 1, rate: 2.99 }
};

const secaOffer = {
  id: 'off-seca',
  human_id: 'OFF-000120',
  name: 'Desafio Seca Barriga 21 Dias',
  description: 'Desafio de 21 dias',
  price: 37,
  promotional_price: null,
  bonus: null,
  is_demo: false,
  book: null,
  bump: null,
  card: CARD,
  whatsapp: null,
  exit_offer: null,
  delivery_files: 10
};

const trattoriaOffer = {
  ...secaOffer,
  id: 'off-trat',
  human_id: 'OFF-000001',
  name: 'Trattoria em Casa',
  card: { ...CARD, total: 19.9, installment_value: 19.9 },
  price: 19.9,
  delivery_files: 1
};

describe('NORQVA-0112 — regras', () => {
  it('visual: Seca Barriga = fresh; livros continuam light; Bolso continua dark', () => {
    expect(lookForNames('Desafio Seca Barriga 21 Dias')).toBe('fresh');
    expect(lookForNames('SECA BARRIGA')).toBe('fresh');
    expect(lookForNames('Trattoria em Casa')).toBe('light');
    expect(lookForNames('Kit Cozinha Italiana em Casa')).toBe('light');
    expect(lookForNames('Método Bolso Blindado')).toBe('dark');
    expect(lookForNames('')).toBe('light');
    expect(isFreshName(null, 'Desafio Seca Barriga 21 Dias')).toBe(true);
  });

  it('telefone do quiz (55 + DDD + número) vira DDD + número; o que não é telefone é ignorado', () => {
    expect(normalizePrefillPhone('5531999998888')).toBe('31999998888');
    expect(normalizePrefillPhone('553132221111')).toBe('3132221111');
    expect(normalizePrefillPhone('31999998888')).toBe('31999998888');
    expect(normalizePrefillPhone('+55 (31) 99999-8888')).toBe('31999998888');
    expect(normalizePrefillPhone('123')).toBe('');
    expect(normalizePrefillPhone(null)).toBe('');
  });

  it('dados do link: só o que é válido; ?checkout=1 abre direto', () => {
    expect(prefillFromSearch('?name=%20Ana%20%20Souza&email=ANA@Example.com&phone=5531999998888')).toEqual({
      name: 'Ana Souza', email: 'ana@example.com', phone: '31999998888'
    });
    expect(prefillFromSearch('?email=nao-e-email')).toBeNull();
    expect(prefillFromSearch('?utm_source=quiz')).toBeNull();
    expect(wantsDirectCheckout('?checkout=1&utm_source=quiz')).toBe(true);
    expect(wantsDirectCheckout('?checkout=0')).toBe(false);
    expect(wantsDirectCheckout('')).toBe(false);
  });

  it('o Seca Barriga entrega 10 PDFs mas não é o kit de 5 livros', () => {
    expect(isFullKit({ delivery_files: 10, name: 'Desafio Seca Barriga 21 Dias' })).toBe(false);
    expect(isFullKit({ delivery_files: 5, name: 'Kit Cozinha Italiana em Casa' })).toBe(true);
  });
});

describe('NORQVA-0112 — link direto do pagamento', () => {
  let calls: Array<{ url: string; init?: any }>;

  beforeEach(() => {
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: null }, error: null });
    (supabase.auth.onAuthStateChange as any).mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    window.localStorage.clear();
    window.sessionStorage.clear();
    calls = [];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  function renderAt(path: string, offer: Record<string, unknown>) {
    window.history.replaceState(null, '', path);
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      calls.push({ url, init });
      if (url.includes('/public/offers/')) return { ok: true, status: 200, json: async () => offer };
      if (url.endsWith('/customers')) return { ok: true, status: 201, json: async () => ({ id: 'cus-1' }) };
      if (url.endsWith('/checkout')) {
        return { ok: true, status: 201, json: async () => ({ id: 'ord-12345678', checkout_token: 'tok', total_amount: 37, status: 'PENDING', is_demo: false }) };
      }
      if (url.includes('/checkout/orders/') && url.endsWith('/pix')) {
        return { ok: true, status: 200, json: async () => ({ id: 'pay-1', status: 'PENDING', amount: 37, pix_copy_paste: '000201PIX', payment_method: 'PIX' }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    );
  }

  it('abre o pagamento já preenchido, no visual fresh, sem material dos livros, e tira os dados pessoais do endereço', async () => {
    renderAt(
      '/p/OFF-000120?checkout=1&name=Ana%20Souza&email=ana%40example.com&phone=5531999998888&utm_source=quiz&utm_medium=funil&utm_campaign=sb21&utm_content=final&utm_term=barriga&fbclid=FBX1&src=quiz_final',
      secaOffer
    );
    const panel = await screen.findByTestId('checkout-panel');
    expect(panel.getAttribute('data-look')).toBe('fresh');
    expect(screen.getByTestId('direct-checkout-page').getAttribute('data-look')).toBe('fresh');
    expect((screen.getByPlaceholderText('Ex: João da Silva') as HTMLInputElement).value).toBe('Ana Souza');
    expect((screen.getByPlaceholderText('seuemail@empresa.com') as HTMLInputElement).value).toBe('ana@example.com');
    expect((screen.getByPlaceholderText('(11) 99999-9999') as HTMLInputElement).value).toBe('(31) 99999-8888');
    // sem capa de livro, sem escolha de livros, sem textos de cozinha
    expect(screen.queryByTestId('checkout-covers')).toBeNull();
    expect(screen.queryByTestId('checkout-choice')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Trattoria|receitas italianas|livro/i);
    expect(within(panel).getByText('10 materiais em PDF • Acesso após a confirmação')).toBeTruthy();
    // nome, e-mail e telefone saem do endereço; o resto fica
    expect(window.location.search).not.toMatch(/name=|email=|phone=/);
    expect(window.location.search).toContain('utm_source=quiz');
    expect(window.location.search).toContain('checkout=1');
  });

  it('leva UTMs, fbclid e src para o pedido, como numa visita normal, e a tela do Pix fica no visual fresh', async () => {
    renderAt(
      '/p/OFF-000120?checkout=1&name=Ana%20Souza&email=ana%40example.com&phone=5531999998888&utm_source=quiz&utm_medium=funil&utm_campaign=sb21&utm_content=final&utm_term=barriga&fbclid=FBX1&src=quiz_final',
      secaOffer
    );
    await screen.findByTestId('checkout-panel');
    fireEvent.change(screen.getByPlaceholderText('000.000.000-00'), { target: { value: '52998224725' } });
    fireEvent.click(screen.getByTestId('checkout-submit'));

    await waitFor(() => expect(calls.some(c => c.url.endsWith('/checkout'))).toBe(true));
    const customer = JSON.parse(calls.find(c => c.url.endsWith('/customers'))!.init.body);
    expect(customer).toMatchObject({ name: 'Ana Souza', email: 'ana@example.com', phone: '31999998888', cpf_cnpj: '52998224725' });
    const order = JSON.parse(calls.find(c => c.url.endsWith('/checkout'))!.init.body);
    expect(order).toMatchObject({
      offer_id: 'off-seca',
      utm_source: 'quiz',
      utm_medium: 'funil',
      utm_campaign: 'sb21',
      utm_content: 'final',
      fbclid: 'FBX1'
    });
    expect(order.fbc).toMatch(/^fb\.1\.\d+\.FBX1$/);
    expect(order.attribution_metadata).toMatchObject({ utm_term: 'barriga', src: 'quiz_final' });
    expect(order.event_source_url).not.toMatch(/email|name=|phone/);
    expect(await screen.findByTestId('payment-look-fresh')).toBeTruthy();
  });

  it('fechar o pagamento deixa o fundo neutro com "Continuar para o pagamento", que reabre', async () => {
    renderAt('/p/OFF-000120?checkout=1', secaOffer);
    await screen.findByTestId('checkout-panel');
    fireEvent.click(screen.getByText('Voltar'));
    await waitFor(() => expect(screen.queryByTestId('checkout-panel')).toBeNull());
    expect(screen.getByTestId('direct-checkout-name').textContent).toBe('Desafio Seca Barriga 21 Dias');
    expect(screen.getByTestId('direct-checkout-price').textContent).toContain('37,00');
    fireEvent.click(screen.getByTestId('direct-checkout-open'));
    expect(await screen.findByTestId('checkout-panel')).toBeTruthy();
  });

  it('Trattoria com ?checkout=1 abre o pagamento no visual de sempre (light)', async () => {
    renderAt('/p/OFF-000001?checkout=1', trattoriaOffer);
    const panel = await screen.findByTestId('checkout-panel');
    expect(panel.getAttribute('data-look')).toBe('light');
    expect(screen.getByTestId('direct-checkout-page').getAttribute('data-look')).toBe('light');
    expect(screen.getByTestId('checkout-covers')).toBeTruthy();
  });

  it('Trattoria sem ?checkout=1 continua com a página do livro, sem abrir o pagamento', async () => {
    renderAt('/p/OFF-000001', trattoriaOffer);
    await screen.findAllByText(/Trattoria em Casa/);
    expect(screen.queryByTestId('direct-checkout-page')).toBeNull();
    expect(screen.queryByTestId('checkout-panel')).toBeNull();
  });
});
