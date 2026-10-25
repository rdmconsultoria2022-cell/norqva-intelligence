// NORQVA-0129: visual da página gerada (/v/:slug): abertura com imagem, selos, galeria, cartão da oferta e dúvidas em sanfona.
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GeneratedPage, splitBody, splitQa } from '../features/public/GeneratedPage';

const GALLERY = ['/images/bordado/capa.jpg', '/images/bordado/riscos.jpg', '/images/bordado/bichinhos.jpg', '/images/bordado/pontos.jpg'];

// como a API devolve a página do Bordado (texto real, imagens do produto na hora)
const bordado = (over: any = {}) => ({
  slug: 'bordado-b4d48e',
  theme: 'light',
  title: 'Bordado',
  offer: { human_id: 'OFF-000015', value: 29.9 },
  meta_pixel_id: null,
  gallery: GALLERY,
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

describe('NORQVA-0129 — texto da seção em parágrafos e itens', () => {
  it('linhas com "-" viram itens; o resto, parágrafos', () => {
    expect(splitBody('Você encontrará:\n- Modelos;\n- Acesso por e-mail\n\nFim.')).toEqual({ paragraphs: ['Você encontrará:', 'Fim.'], items: ['Modelos', 'Acesso por e-mail'] });
    expect(splitBody('Só texto.\n\nOutro.')).toEqual({ paragraphs: ['Só texto.', 'Outro.'], items: [] });
  });
  it('pergunta e resposta', () => {
    expect(splitQa('É para iniciantes? Sim.')).toEqual({ q: 'É para iniciantes?', a: 'Sim.' });
    expect(splitQa('Sem pergunta')).toEqual({ q: 'Sem pergunta', a: '' });
  });
});

describe('NORQVA-0129 — página de venda gerada', () => {
  it('abertura com imagem, título, botão e selos de fatos reais; botões com o mesmo link e sem dados pessoais', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Transforme sua criatividade com nosso kit de bordado!' })).toBeInTheDocument();
    const heroImg = screen.getByTestId('generated-hero-image');
    expect(heroImg).toHaveAttribute('src', '/images/bordado/capa.jpg');
    expect(heroImg).toHaveAttribute('alt', 'Transforme sua criatividade com nosso kit de bordado!');
    const trust = screen.getByTestId('generated-trust');
    expect(within(trust).getByText('PDF para imprimir')).toBeInTheDocument();
    expect(within(trust).getByText('Acesso por e-mail')).toBeInTheDocument();
    expect(within(trust).getByText('Pix ou cartão')).toBeInTheDocument();
    const want = '/p/OFF-000015?checkout=1&utm_source=meta&utm_campaign=bordado&fbclid=xyz';
    const ctas = [...screen.getAllByTestId('generated-cta'), screen.getByTestId('generated-cta-sticky')];
    expect(ctas.length).toBeGreaterThanOrEqual(4);
    for (const c of ctas) {
      expect(c).toHaveAttribute('href', want);
      expect(c.getAttribute('href')).not.toMatch(/email|name|phone|Ana/);
    }
    expect(screen.getByTestId('generated-cta-sticky')).toHaveTextContent('Comece agora!');
    // nada de depoimento, contador ou nota inventada
    expect(document.body.textContent).not.toMatch(/estrelas|avalia|vendid|restam|termina em/i);
    expect(screen.getAllByTestId('generated-section')).toHaveLength(7);
  });

  it('seções com imagem própria (texto alternativo do título) e lista do texto em cartões', async () => {
    open();
    expect(await screen.findByAltText('Como o Bordado ajuda')).toHaveAttribute('src', '/images/bordado/riscos.jpg');
    // seção sem título: nome do papel como título e itens tirados do texto
    expect(screen.getByRole('heading', { level: 2, name: 'Conheça o material' })).toBeInTheDocument();
    expect(screen.getByText('Vários modelos')).toBeInTheDocument();
    expect(screen.getByText('Acesso ao material após a compra')).toBeInTheDocument();
  });

  it('"Veja por dentro" com todas as imagens e ampliação simples', async () => {
    open();
    const gal = await screen.findByTestId('generated-gallery');
    expect(within(gal).getByRole('heading', { name: 'Veja por dentro' })).toBeInTheDocument();
    const imgs = within(gal).getAllByRole('img');
    expect(imgs.map(i => i.getAttribute('src'))).toEqual(GALLERY);
    fireEvent.click(within(gal).getByRole('button', { name: /imagem 2 de 4/ }));
    const lb = screen.getByTestId('generated-lightbox');
    expect(within(lb).getByRole('img')).toHaveAttribute('src', '/images/bordado/riscos.jpg');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('generated-lightbox')).toBeNull();
  });

  it('cartão da oferta com preço ao vivo, parcelas e botão; garantia como selo; dúvidas em sanfona', async () => {
    open();
    const offer = await screen.findByTestId('generated-offer');
    expect(within(offer).getByTestId('generated-price')).toHaveTextContent('R$ 29,90');
    expect(within(offer).getByTestId('generated-price')).toHaveTextContent('ou 4x de R$ 7,47 sem juros no cartão');
    expect(within(offer).getByTestId('generated-cta')).toHaveAttribute('href', '/p/OFF-000015?checkout=1&utm_source=meta&utm_campaign=bordado&fbclid=xyz');
    expect(within(screen.getByTestId('generated-guarantee')).getByText(/desistir da compra feita pela internet em até 7 dias/)).toBeInTheDocument();
    const faq = screen.getByTestId('generated-faq');
    const items = faq.querySelectorAll('details');
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('summary')).toHaveTextContent('É para iniciantes?');
    expect(items[0]).toHaveTextContent('Sim, os modelos servem para todos.');
    expect(items[0].open).toBe(false);
  });

  it('oferta sem cartão: selos e aviso falam só de Pix; sem galeria quando o produto não tem imagens', async () => {
    const page = bordado({ gallery: [] });
    page.sections = page.sections.map((s: any) =>
      s.role === 'OFFER_PRICE' ? { ...s, price: { price_text: 'R$ 19,90', installments_text: null } } : { ...s, image_url: null }
    );
    mockFetch(page);
    open('/v/bordado-b4d48e');
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(within(screen.getByTestId('generated-trust')).getByText('Pix')).toBeInTheDocument();
    expect(screen.queryByText('Pix ou cartão')).toBeNull();
    expect(screen.queryByText(/Pix ou cartão/)).toBeNull();
    expect(screen.queryByTestId('generated-gallery')).toBeNull();
    expect(screen.queryByTestId('generated-hero-image')).toBeNull();
  });
});
