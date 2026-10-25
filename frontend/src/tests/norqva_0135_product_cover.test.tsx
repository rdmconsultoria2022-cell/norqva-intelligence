// NORQVA-0135: capa do Kit de Bordado na tela Produtos (não a do kit de livros).
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { productCover } from '../features/products/ProductsView';
import { CheckoutView } from '../features/checkout/CheckoutView';
import { DigitalDelivery } from '../features/delivery/DigitalDelivery';
import { isBordadoName } from '../lib/productLook';

describe('NORQVA-0135 — capa na tela Produtos', () => {
  it('bordado usa a capa do bordado; kit de livros continua com a dele', () => {
    expect(productCover({ name: 'Kit de Bordado NORQVA' })).toMatch(/\/images\/bordado\/capa\.jpg$/);
    expect(productCover({ name: 'Bordado' })).toMatch(/\/images\/bordado\/capa\.jpg$/);
    expect(productCover({ name: 'Kit Cozinha Italiana' })).toMatch(/\/images\/kit\/capa_kit\.jpg$/);
    expect(productCover({ name: 'Desafio Seca Barriga' })).toBeNull();
  });
});

// pagamento e entrega do bordado sem nada dos livros de cozinha

describe('NORQVA-0135 — pagamento e entrega do bordado', () => {
  it('nome do bordado é reconhecido', () => {
    expect(isBordadoName('Kit de Bordado NORQVA')).toBe(true);
    expect(isBordadoName('Bordado')).toBe(true);
    expect(isBordadoName('Kit Cozinha Italiana', null)).toBe(false);
  });

  for (const name of ['Kit de Bordado NORQVA', 'Bordado']) {
    it(`pagamento de "${name}": capa e textos do bordado`, () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any;
      render(
        <CheckoutView
          offer={{ id: 'b1', human_id: 'OFF-000015', name, price: 19.9, delivery_files: 1 }}
          isDemo={false}
          onOrderCreated={vi.fn()}
          onCancel={vi.fn()}
          showError={vi.fn()}
        />
      );
      const imgs = Array.from(screen.getByTestId('checkout-covers').querySelectorAll('img')).map(i => i.getAttribute('src'));
      expect(imgs).toEqual(['/images/bordado/capa.jpg']);
      expect(screen.getByText('Kit digital em PDF')).toBeInTheDocument();
      expect(screen.getByText('50 riscos para iniciantes • PDF para imprimir')).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/Trattoria|Dolci|receitas|Kit de livros/);
    });
  }

  it('entrega do bordado: título e cartão do kit, sem Trattoria', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/delivery-tokens')) {
        return Promise.resolve({ ok: true, json: async () => ({ deliveries: [{ assetId: 'a1', assetTitle: 'KIT_DE_BORDADO_NORQVA', rawToken: 'tok', status: 'ACTIVE' }], accessEmailSent: true }) });
      }
      if (url.includes('/orders/')) {
        return Promise.resolve({ ok: true, json: async () => ({ id: 'o1', status: 'PAID', total_amount: 19.9, offer_human_id: 'OFF-000015', offer_name_snapshot: 'Bordado' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }) as any;
    render(<DigitalDelivery orderId="o1" checkoutToken="t" isDemo={false} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByText('Seu Kit de Bordado está pronto!')).toBeInTheDocument();
    expect(screen.getByText('Kit de Bordado NORQVA')).toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/capa_trat|Trattoria em Casa|28 receitas/);
  });
});
