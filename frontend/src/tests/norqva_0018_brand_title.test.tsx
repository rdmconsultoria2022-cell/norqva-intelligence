import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicOfferPage } from '../features/public/PublicOfferPage';
import vercelConfig from '../../vercel.json';

vi.mock('../../lib/api', () => ({
  API_BASE: 'https://norqva-staging-api.onrender.com/api',
  apiFetch: vi.fn()
}));

const trattoriaOffer = {
  id: 'off-trattoria-uuid',
  human_id: 'OFF-000001',
  name: 'Trattoria em Casa',
  description: 'Guia prático de massas e molhos',
  price: 19.9,
  promotional_price: null,
  bonus: null,
  is_demo: false
};

describe('NORQVA-0018 — marca na landing', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.title = 'NORQVA Intelligence & Performance';
  });

  it('aba do navegador mostra o nome da oferta e restaura ao sair', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () => (url.includes('/public/offers/OFF-000001') ? trattoriaOffer : {})
      })
    ) as any;

    const { unmount } = render(
      <MemoryRouter initialEntries={['/p/OFF-000001']}>
        <Routes>
          <Route path="/p/:humanId" element={<PublicOfferPage showError={vi.fn()} showSuccess={vi.fn()} />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(document.title).toBe('Trattoria em Casa'));
    unmount();
    expect(document.title).toBe('NORQVA Intelligence & Performance');
  });

  it('trattoria.norqva.com.br redireciona a raiz para a oferta, sem redirecionamento permanente', () => {
    const rule = (vercelConfig as any).redirects.find((r: any) =>
      r.has?.some((h: any) => h.type === 'host' && h.value === 'trattoria.norqva.com.br')
    );
    expect(rule).toBeDefined();
    expect(rule.source).toBe('/');
    expect(rule.destination).toBe('/p/OFF-000001');
    expect(rule.permanent).toBe(false);
    // A regra de SPA continua existindo.
    expect((vercelConfig as any).rewrites[0].destination).toBe('/index.html');
  });
});
