// NORQVA-0132: botão do WhatsApp na página gerada (/v/:slug), só com WhatsApp disponível para a oferta.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GeneratedPage } from '../features/public/GeneratedPage';
import { setWhatsAppNavigatorForTests } from '../features/public/WhatsAppChoice';

vi.mock('../lib/api', () => ({ API_BASE: 'https://norqva-staging-api.onrender.com/api', apiFetch: vi.fn() }));

const page = (whatsapp: any) => ({
  slug: 'bordado-abc123',
  theme: 'light',
  title: 'Bordado',
  offer: { human_id: 'OFF-000015' },
  meta_pixel_id: null,
  whatsapp,
  sections: [
    { order: 1, role: 'HERO_HOOK', headline: 'Bordar é para você', body: 'Riscos para começar.', bullets: [], cta_label: 'Quero o kit', image_url: null },
    {
      order: 2, role: 'OFFER_PRICE', headline: 'Leve hoje', body: '', bullets: [], cta_label: '', image_url: null,
      price: { price_text: 'R$ 19,90', installments_text: null }, note: null
    }
  ]
});

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  setWhatsAppNavigatorForTests(null);
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/v/bordado-abc123?utm_source=meta']}>
      <Routes>
        <Route path="/v/:slug" element={<GeneratedPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('NORQVA-0132 — WhatsApp na página gerada', () => {
  it('sem WhatsApp disponível: nenhum botão verde', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => page(null) }) as any;
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Bordar é para você' });
    expect(screen.queryByTestId('generated-whatsapp-hero')).toBeNull();
    expect(screen.queryByTestId('whatsapp-fab')).toBeNull();
  });

  it('com WhatsApp: botão na abertura e na oferta, mais o flutuante; abre a conversa com o código', async () => {
    let went = '';
    setWhatsAppNavigatorForTests(url => { went = url; });
    const f = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/public/whatsapp/ref')) return Promise.resolve({ ok: true, status: 201, json: async () => ({ url: 'https://wa.me/5531985855642?text=Oi', code: 'B0132X' }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => page({ available: true }) });
    });
    global.fetch = f as any;
    renderPage();
    const hero = await screen.findByTestId('generated-whatsapp-hero');
    expect(screen.getByTestId('generated-whatsapp-offer')).toBeInTheDocument();
    expect(screen.getByTestId('whatsapp-fab')).toBeInTheDocument();
    // o botão de pagamento continua
    expect(screen.getAllByTestId('generated-cta').length).toBeGreaterThan(0);
    fireEvent.click(hero);
    await waitFor(() => expect(went).toBe('https://wa.me/5531985855642?text=Oi'));
    const call = f.mock.calls.find((c: any[]) => String(c[0]).endsWith('/public/whatsapp/ref'));
    expect(JSON.parse(call[1].body)).toMatchObject({ offer_human_id: 'OFF-000015' });
  });

  it('se o WhatsApp falhar, segue para o pagamento', async () => {
    let went = '';
    setWhatsAppNavigatorForTests(url => { went = url; });
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/public/whatsapp/ref')) return Promise.resolve({ ok: false, status: 409, json: async () => ({ error: 'indisponível' }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => page({ available: true }) });
    }) as any;
    renderPage();
    fireEvent.click(await screen.findByTestId('generated-whatsapp-hero'));
    await waitFor(() => expect(went).toContain('/p/OFF-000015?checkout=1'));
  });
});
