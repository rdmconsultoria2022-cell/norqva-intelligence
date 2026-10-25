// NORQVA-0054: página → WhatsApp. Com o WhatsApp da marca disponível, o botão principal abre a conversa
// com o código de origem; "pagar aqui mesmo" continua como opção menor. Sem WhatsApp, a página fica igual.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { KitLandingPage } from '../features/public/KitLandingPage';
import { setWhatsAppNavigatorForTests } from '../features/public/WhatsAppChoice';

vi.mock('../lib/api', () => ({
  API_BASE: 'https://norqva-staging-api.onrender.com/api',
  apiFetch: vi.fn()
}));

const kit = {
  id: 'off-kit-uuid',
  human_id: 'OFF-KIT',
  name: 'Kit Cozinha Italiana',
  description: 'Os dois livros',
  price: 34.8,
  promotional_price: 27.9,
  bonus: null,
  is_demo: false,
  bump: null,
  card: null
};

const renderKit = () =>
  render(
    <MemoryRouter initialEntries={['/kit/OFF-KIT?utm_campaign=CMP-1&utm_content=TR-AD&fbclid=IwAR1']}>
      <KitLandingPage showError={vi.fn()} showSuccess={vi.fn()} />
    </MemoryRouter>
  );

describe('NORQVA-0054 — botão do WhatsApp na página', () => {
  let assigned = '';
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    assigned = '';
    setWhatsAppNavigatorForTests(url => {
      assigned = url;
    });
  });
  afterEach(() => setWhatsAppNavigatorForTests(null));

  it('sem WhatsApp disponível, o botão de compra continua o mesmo', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({ ...kit, whatsapp: null }) })) as any;
    renderKit();
    expect(await screen.findByTestId('kit-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('whatsapp-cta')).toBeNull();
  });

  it('com WhatsApp: abre a conversa com o código e mantém "pagar aqui mesmo"', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (String(url).endsWith('/public/whatsapp/ref')) {
        return Promise.resolve({ ok: true, json: async () => ({ url: 'https://wa.me/5511922223333?text=Ol%C3%A1', code: 'K7F3A2' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ...kit, whatsapp: { available: true } }) });
    });
    global.fetch = fetchMock as any;
    renderKit();
    const wa = (await screen.findAllByTestId('whatsapp-cta'))[0];
    expect(screen.queryByTestId('kit-cta')).toBeNull();
    expect(screen.getAllByTestId('pay-here-link')[0]).toHaveTextContent('Prefere pagar aqui mesmo');
    fireEvent.click(wa);
    await waitFor(() => expect(assigned).toBe('https://wa.me/5511922223333?text=Ol%C3%A1'));
    const call = fetchMock.mock.calls.find((c: any[]) => String(c[0]).endsWith('/public/whatsapp/ref'));
    const body = JSON.parse(call[1].body);
    expect(body).toMatchObject({ offer_human_id: 'OFF-KIT' });
  });

  // NORQVA-0128: botão flutuante
  it('sem WhatsApp disponível, não há botão flutuante', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({ ...kit, whatsapp: null }) })) as any;
    renderKit();
    await screen.findByTestId('kit-cta');
    expect(screen.queryByTestId('whatsapp-fab')).toBeNull();
  });

  it('com WhatsApp: o botão flutuante abre a mesma conversa com código', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/public/whatsapp/ref')) {
        return Promise.resolve({ ok: true, json: async () => ({ url: 'https://wa.me/5511922223333?text=Oi', code: 'K7F3A3' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ...kit, whatsapp: { available: true } }) });
    });
    global.fetch = fetchMock as any;
    renderKit();
    const fab = await screen.findByTestId('whatsapp-fab');
    expect(fab).toHaveTextContent('Falar no WhatsApp');
    // no topo da página fica escondido (sem foco)
    expect(fab).toHaveAttribute('aria-hidden', 'true');
    expect(fab).toHaveAttribute('tabindex', '-1');
    fireEvent.click(fab);
    await waitFor(() => expect(assigned).toBe('https://wa.me/5511922223333?text=Oi'));
  });
});
