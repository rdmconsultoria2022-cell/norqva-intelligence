// NORQVA-0145: Mestre Tito (personagem virtual) na página do kit, sempre com o aviso de personagem.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { KitLandingPage } from '../features/public/KitLandingPage';

vi.mock('../lib/api', () => ({
  API_BASE: 'https://norqva-staging-api.onrender.com/api',
  apiFetch: vi.fn()
}));

const kit = {
  id: 'off-kit-uuid', human_id: 'OFF-KIT5', name: 'Kit Cozinha Italiana em Casa', description: 'Os cinco livros',
  price: 89.5, promotional_price: 39.9, bonus: null, is_demo: false, bump: null, card: null, delivery_files: 5
};

describe('NORQVA-0145 — Mestre Tito na página do kit', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    global.fetch = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({ ok: true, json: async () => (String(url).endsWith('/public/collection') ? { books: [] } : kit) })
    ) as any;
  });

  it('mostra o chef com foto e o aviso de personagem virtual', async () => {
    render(
      <MemoryRouter initialEntries={['/kit/OFF-KIT5']}>
        <KitLandingPage showError={vi.fn()} showSuccess={vi.fn()} />
      </MemoryRouter>
    );
    const section = await screen.findByTestId('kit-chef');
    expect(section).toHaveTextContent('Mestre Tito');
    expect(section.querySelector('img')?.getAttribute('src')).toBe('/images/chefs/tito.jpg');
    expect(screen.getByTestId('kit-chef-disclaimer')).toHaveTextContent('personagem virtual criado pela NORQVA');
  });
});
