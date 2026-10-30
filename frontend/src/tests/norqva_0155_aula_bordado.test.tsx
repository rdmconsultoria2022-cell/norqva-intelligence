// NORQVA-0155: aula em vídeo do Kit de Bordado (bônus na entrega) e prévia de 30 s na página de venda.
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GeneratedPage } from '../features/public/GeneratedPage';
import { DigitalDelivery } from '../features/delivery/DigitalDelivery';
import { BORDADO_INFO } from '../lib/productLook';

const GALLERY = ['/images/bordado/capa.jpg', '/images/bordado/riscos.jpg', '/images/bordado/bichinhos.jpg', '/images/bordado/pontos.jpg'];

// como a API devolve a página do Bordado (texto real, imagens do produto na hora)
const bordado = (over: any = {}) => ({
  slug: 'bordado-b4d48e',
  theme: 'light',
  title: 'Bordado',
  offer: { human_id: 'OFF-000015', value: 29.9 },
  meta_pixel_id: null,
  gallery: GALLERY,
  delivery_pdf: true,
  sections: [
    { order: 1, role: 'HERO_HOOK', headline: 'Transforme sua criatividade com nosso kit de bordado!', body: 'Descubra a arte do bordado.\n\nNosso kit digital traz diversos modelos.', bullets: [], cta_label: '', image_url: '/images/bordado/capa.jpg', note: null, price: null },
    { order: 2, role: 'MECHANISM', headline: 'Como o Bordado ajuda', body: 'Um guia prático.', bullets: [], cta_label: '', image_url: '/images/bordado/riscos.jpg', note: null, price: null },
    { order: 3, role: 'PRODUCT_REVEAL', headline: '', body: 'No kit você encontrará:\n- Vários modelos;\n- Acesso ao material após a compra;', bullets: [], cta_label: '', image_url: '/images/bordado/pontos.jpg', note: null, price: null },
    { order: 4, role: 'OFFER_PRICE', headline: '', body: 'Acesso digital ao Bordado.', bullets: [], cta_label: '', image_url: null, note: null, price: { price_text: 'R$ 29,90', installments_text: 'ou 4x de R$ 7,47 sem juros no cartão' } },
    { order: 5, role: 'GUARANTEE', headline: '', body: 'Fale com a gente.', bullets: [], cta_label: '', image_url: null, note: 'Pela lei (Código de Defesa do Consumidor, art. 49), você pode desistir da compra feita pela internet em até 7 dias.', price: null },
    { order: 6, role: 'CTA', headline: '', body: 'Pronto para começar?', bullets: [], cta_label: 'Comece agora!', image_url: null, note: null, price: null },
    { order: 7, role: 'FAQ', headline: '', body: 'Dúvidas comuns.\n- É para iniciantes? Sim, os modelos servem para todos.\n- Como recebo o kit? Por e-mail, depois do pagamento confirmado.', bullets: [], cta_label: '', image_url: null, note: null, price: null }
  ],
  ...over
});

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});
const mockFetch = (body: any) => {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
  global.fetch = fn as any;
  return fn;
};
// o fetch padrão de cada teste devolve a página do Bordado
beforeEach(() => {
  mockFetch(bordado());
});
const open = (url = '/v/bordado-b4d48e?utm_source=meta&utm_campaign=bordado&fbclid=xyz&email=a%40b.com&name=Ana&phone=31999') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <GeneratedPage />
    </MemoryRouter>
  );


describe('NORQVA-0155 — prévia na página de venda', () => {
  it('com preview_video: seção "Veja como é fácil" com o vídeo', async () => {
    mockFetch(bordado({ preview_video: { src: '/videos/bordado/previa_aula.mp4', poster: '/videos/bordado/previa_aula.jpg' } }));
    open();
    const sec = await screen.findByTestId('generated-preview-video');
    const v = sec.querySelector('video')!;
    expect(v.getAttribute('src')).toBe('/videos/bordado/previa_aula.mp4');
    expect(v.getAttribute('poster')).toBe('/videos/bordado/previa_aula.jpg');
    expect(sec.textContent).toMatch(/criadas com IA/);
    expect(sec.textContent).not.toMatch(/R\$/);
  });
  it('sem preview_video: nenhuma seção de vídeo', async () => {
    open();
    await screen.findByTestId('generated-gallery');
    expect(screen.queryByTestId('generated-preview-video')).toBeNull();
  });
});

const deliveryFetch = (deliveries: any[], orderName = 'Bordado') =>
  (global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/delivery-tokens')) return Promise.resolve({ ok: true, json: async () => ({ deliveries, accessEmailSent: true }) });
    if (url.includes('/orders/')) return Promise.resolve({ ok: true, json: async () => ({ id: 'o1', status: 'PAID', total_amount: 19.9, offer_human_id: 'OFF-000015', offer_name_snapshot: orderName }) });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }) as any);
const openDelivery = () => render(<DigitalDelivery orderId="o1" checkoutToken="t" isDemo={false} showError={vi.fn()} showSuccess={vi.fn()} />);

describe('NORQVA-0155 — aula como bônus na entrega', () => {
  it('kit de bordado com acesso ativo: cartão Bônus com a aula', async () => {
    deliveryFetch([{ assetId: 'a1', assetTitle: 'KIT_DE_BORDADO_NORQVA', rawToken: 'tok', status: 'ACTIVE' }]);
    openDelivery();
    const box = await screen.findByTestId('bordado-lesson');
    expect(box.querySelector('video')!.getAttribute('src')).toBe(BORDADO_INFO.lesson.src);
    expect(BORDADO_INFO.lesson.src).toMatch(/^\/videos\/bordado\/aula_gatinho_[0-9a-f]{12}\.mp4$/);
  });
  it('acesso desativado (estorno): sem a aula', async () => {
    deliveryFetch([{ assetId: 'a1', assetTitle: 'KIT_DE_BORDADO_NORQVA', rawToken: 'tok', status: 'INACTIVE' }]);
    openDelivery();
    await screen.findByText('Seu Kit de Bordado está pronto!');
    expect(screen.queryByTestId('bordado-lesson')).toBeNull();
  });
  it('livros de cozinha: sem a aula', async () => {
    deliveryFetch([{ assetId: 'a1', assetTitle: 'TRATTORIA_EM_CASA', rawToken: 'tok', status: 'ACTIVE' }], 'Trattoria em Casa');
    openDelivery();
    await screen.findByText('Seu Trattoria em Casa está pronto!');
    expect(screen.queryByTestId('bordado-lesson')).toBeNull();
  });
});
