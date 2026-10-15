// NORQVA-0070: página do kit com livros em 3D, números animados e barra de compra. Sem IntersectionObserver (jsdom) tudo aparece parado e completo.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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

const renderKit = (offer: any) => {
  global.fetch = vi.fn().mockImplementation((url: string) =>
    Promise.resolve({ ok: true, json: async () => (String(url).endsWith('/public/collection') ? { books: [] } : offer) })
  ) as any;
  return render(
    <MemoryRouter initialEntries={['/kit/OFF-KIT5']}>
      <KitLandingPage showError={vi.fn()} showSuccess={vi.fn()} />
    </MemoryRouter>
  );
};

describe('NORQVA-0070 — página do kit: 3D e movimento', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('o leque do topo e o da oferta têm os cinco livros em 3D (capa, lombada e páginas)', async () => {
    const { container } = renderKit(kit);
    await waitFor(() => expect(screen.getByLabelText('Os cinco livros do kit em leque')).toBeInTheDocument());
    expect(screen.getByLabelText('Os cinco livros do kit em leque').querySelectorAll('.b3')).toHaveLength(5);
    expect(screen.getByTestId('kit-five-covers').querySelectorAll('.b3 .sp')).toHaveLength(5);
    expect(screen.getByTestId('kit-five-covers').querySelectorAll('.b3 .pg')).toHaveLength(5);
    // a coleção também usa livros em 3D
    expect(container.querySelectorAll('.carousel .b3')).toHaveLength(5);
  });

  it('os números mostram o valor final (sem animação disponível); sem a frase de reembolso (NORQVA-0076)', async () => {
    const { container } = renderKit(kit);
    await waitFor(() => expect(container.querySelector('.stats4')).not.toBeNull());
    const stats = within(container.querySelector('.stats4') as HTMLElement);
    expect(stats.getByText('Receitas').parentElement).toHaveTextContent('74');
    expect(stats.getByText('Livros digitais').parentElement).toHaveTextContent('5');
    expect(stats.getByText('Páginas ilustradas').parentElement).toHaveTextContent('187');
    expect(stats.getByText('Pagamento único').parentElement).toHaveTextContent('1');
    expect(stats.queryByText('Dias de garantia')).toBeNull();
    expect(screen.queryByText('7 dias para pedir reembolso')).toBeNull();
  });

  it('a barra de compra do celular traz o parcelamento do servidor e abre o pagamento', async () => {
    renderKit(kit);
    const bar = await screen.findByTestId('kit-sticky-bar');
    expect(bar).toHaveTextContent('4x R$ 19,98');
    expect(bar).toHaveTextContent('Kit com 5 livros');
    fireEvent.click(screen.getByTestId('kit-sticky-cta'));
    await waitFor(() => expect(screen.getByText('Voltar')).toBeInTheDocument());
  });

  it('kit de dois livros continua com os dois livros em 3D e números de 2 livros', async () => {
    const { container } = renderKit({ ...kit, delivery_files: 2, promotional_price: 27.9, price: 34.8, card: null });
    await waitFor(() => expect(screen.getAllByLabelText(/Os dois livros do kit/).length).toBe(2));
    expect(container.querySelectorAll('.stk .b3')).toHaveLength(4);
    expect(within(container.querySelector('.stats4') as HTMLElement).getByText('Livros digitais').parentElement).toHaveTextContent('2');
    expect(screen.getByTestId('kit-sticky-bar')).toHaveTextContent('Kit com 2 livros');
  });
});
