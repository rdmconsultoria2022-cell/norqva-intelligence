// NORQVA-0032: caixinha do adicional no checkout, configuração do adicional e promessas por produto.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const apiCalls: any[] = [];
vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(async (url: string, opts?: any) => {
    apiCalls.push([url, opts]);
    if (url === '/customers') return { id: 'c1' };
    if (url === '/checkout') return { id: 'o1', total_amount: 34.8, checkout_token: 't', status: 'PENDING', items: [] };
    return {};
  })
}));
vi.mock('../supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }), onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }) } }
}));

import { CheckoutView } from '../features/checkout/CheckoutView';
import { OfferBumpConfig, ProductClaims, suggestedClaims } from '../features/products/ProductExtras';

const offer = {
  id: 'off-1',
  human_id: 'OFF-000001',
  name: 'Trattoria em Casa',
  price: 19.9,
  promotional_price: null,
  is_demo: false,
  bump: { offer_human_id: 'OFF-000009', name: 'Molhos da Nonna', headline: '10 molhos para as receitas', price: 14.9 }
};

const fillForm = () => {
  fireEvent.change(screen.getByPlaceholderText(/ex: joão da silva/i), { target: { value: 'Maria da Silva' } });
  fireEvent.change(screen.getByPlaceholderText(/seuemail@empresa\.com/i), { target: { value: 'maria.silva@exemplo.com' } });
  fireEvent.change(screen.getByPlaceholderText('000.000.000-00'), { target: { value: '52998224725' } });
};

describe('NORQVA-0032 — adicional no checkout', () => {
  beforeEach(() => {
    apiCalls.length = 0;
  });

  it('vem desmarcado; marcar atualiza o total e envia só "quero o adicional"', async () => {
    const onOrderCreated = vi.fn();
    render(<CheckoutView offer={offer as any} isDemo={false} onOrderCreated={onOrderCreated} onCancel={vi.fn()} showError={vi.fn()} showSuccess={vi.fn()} />);
    const box = screen.getByTestId('checkout-bump');
    const check = within(box).getByRole('checkbox') as HTMLInputElement;
    expect(check.checked).toBe(false);
    expect(box).toHaveTextContent('Molhos da Nonna');
    expect(box).toHaveTextContent('+ R$ 14,90 no mesmo Pix');
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('R$ 19,90');
    fireEvent.click(check);
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('R$ 34,80');
    expect(screen.getByRole('button', { name: /Pagar R\$ 34,80 com Pix/ })).toBeInTheDocument();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /com pix/i }));
    await waitFor(() => expect(onOrderCreated).toHaveBeenCalled());
    const call = apiCalls.find(c => c[0] === '/checkout');
    const body = JSON.parse(call[1].body);
    expect(body.with_bump).toBe(true);
    expect(body).not.toHaveProperty('bump_price');
    expect(body).not.toHaveProperty('total_amount');
  });

  it('sem marcar, o pedido não pede o adicional', async () => {
    render(<CheckoutView offer={offer as any} isDemo={false} onOrderCreated={vi.fn()} onCancel={vi.fn()} showError={vi.fn()} showSuccess={vi.fn()} />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /com pix/i }));
    await waitFor(() => expect(apiCalls.some(c => c[0] === '/checkout')).toBe(true));
    const body = JSON.parse(apiCalls.find(c => c[0] === '/checkout')[1].body);
    expect(body).not.toHaveProperty('with_bump');
  });

  it('oferta sem adicional não mostra a caixinha', () => {
    render(<CheckoutView offer={{ ...offer, bump: null } as any} isDemo={false} onOrderCreated={vi.fn()} onCancel={vi.fn()} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(screen.queryByTestId('checkout-bump')).not.toBeInTheDocument();
  });
});

describe('NORQVA-0032 — configuração do adicional', () => {
  it('salva e liga com o preço digitado', async () => {
    const apiFetch = vi.fn(async (url: string, opts?: any) =>
      opts?.method === 'PUT'
        ? { offer_id: 'off-1', bump: { bump_offer_id: 'off-9', bump_price: 14.9, headline: 'x', is_active: true }, sellable: true, blocker: null }
        : { offer_id: 'off-1', bump: null, sellable: false, blocker: null }
    );
    const offers = [
      { id: 'off-1', human_id: 'OFF-000001', name: 'Trattoria', status: 'ATIVA', is_demo: false },
      { id: 'off-9', human_id: 'OFF-000009', name: 'Molhos', status: 'TESTE', is_demo: false }
    ];
    render(<OfferBumpConfig off={offers[0]} offers={offers} apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} />);
    const select = (await screen.findByLabelText('Oferta do adicional')) as HTMLSelectElement;
    expect(within(select).queryByText(/OFF-000001/)).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'off-9' } });
    fireEvent.click(screen.getByTestId('bump-save-on'));
    await waitFor(() => expect(screen.getByTestId('bump-status')).toHaveTextContent('ligado no checkout'));
    const put = apiFetch.mock.calls.find((c: any[]) => c[1]?.method === 'PUT') as any;
    expect(put[0]).toBe('/offers/off-1/bump?mode=real');
    expect(JSON.parse(put[1].body)).toEqual({ bump_offer_id: 'off-9', bump_price: 14.9, headline: null, is_active: true });
  });
});

describe('NORQVA-0032 — promessas por produto', () => {
  const product = { id: 'p1', name: 'Trattoria em Casa', is_demo: false };
  const offers = [{ id: 'off-1', product_id: 'p1', status: 'ATIVA', price: '19.90', promotional_price: null }];

  it('sugere preço, Pix, acesso e receitas para a Trattoria', () => {
    expect(suggestedClaims(product, offers).map(s => s.claim_text)).toEqual([
      'Trattoria em Casa por R$ 19,90',
      'Pagamento por Pix',
      'Acesso ao conteúdo logo após a confirmação do pagamento',
      'Receitas de trattoria italiana para fazer em casa'
    ]);
  });

  it('ADMIN adiciona as sugestões e verifica', async () => {
    let claims: any[] = [];
    const apiFetch = vi.fn(async (url: string, opts?: any) => {
      if (url.startsWith('/products/p1/claims') && opts?.method === 'POST') {
        const b = JSON.parse(opts.body);
        claims.push({ id: `c${claims.length + 1}`, claim_text: b.claim_text, status: 'UNVERIFIED' });
        return claims[claims.length - 1];
      }
      if (url.startsWith('/products/p1/claims')) return { claims };
      if (url.startsWith('/creative-factory/claims/')) {
        claims = claims.map(c => (url.includes(c.id) ? { ...c, status: 'VERIFIED' } : c));
        return {};
      }
      return {};
    });
    render(<ProductClaims product={product} offers={offers} currentUser={{ role: 'ADMIN' }} apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('add-suggestions'));
    await waitFor(() => expect(screen.getAllByTestId('product-claim')).toHaveLength(4));
    expect(screen.queryByTestId('claim-suggestions')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByTestId('verify-claim')[0]);
    await waitFor(() => expect(screen.getAllByTestId('product-claim')[0]).toHaveTextContent('verificada'));
    const patch = apiFetch.mock.calls.find((c: any[]) => c[1]?.method === 'PATCH') as any;
    expect(JSON.parse(patch[1].body).status).toBe('VERIFIED');
  });

  it('perfil de análise só lê', async () => {
    const apiFetch = vi.fn(async () => ({ claims: [{ id: 'c1', claim_text: 'Pagamento por Pix', status: 'UNVERIFIED' }] }));
    render(<ProductClaims product={product} offers={offers} currentUser={{ role: 'PERFORMANCE' }} apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByTestId('product-claim')).toHaveTextContent('a verificar');
    expect(screen.queryByTestId('verify-claim')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-suggestions')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nova promessa')).not.toBeInTheDocument();
  });
});
