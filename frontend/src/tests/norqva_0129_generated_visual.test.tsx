// NORQVA-0129: visual da página gerada (/v/:slug): abertura com imagem, selos, galeria, cartão da oferta e dúvidas em sanfona.
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GenerationView } from '../features/creative-factory/GenerationView';
import { GeneratedPage, bodyBlocks, splitQa, paragraphQa, faqEntries, REVEAL_SAFETY_MS } from '../features/public/GeneratedPage';

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

describe('NORQVA-0129 — texto da seção em blocos, na ordem', () => {
  it('parágrafos e listas na ordem do texto; linha comum depois de um item continua o item', () => {
    expect(bodyBlocks('Você encontrará:\n- Modelos;\n- Acesso por\ne-mail\n\nFim.\n- Último')).toEqual([
      { kind: 'p', text: 'Você encontrará:' },
      { kind: 'list', items: ['Modelos', 'Acesso por e-mail'] },
      { kind: 'p', text: 'Fim.' },
      { kind: 'list', items: ['Último'] }
    ]);
    expect(bodyBlocks('Só texto.\n\nOutro.')).toEqual([{ kind: 'p', text: 'Só texto.' }, { kind: 'p', text: 'Outro.' }]);
  });
  it('dúvidas: "- pergunta? resposta" e parágrafo que começa com pergunta', () => {
    expect(splitQa('É para iniciantes? Sim.')).toEqual({ q: 'É para iniciantes?', a: 'Sim.' });
    expect(splitQa('Sem pergunta')).toEqual({ q: 'Sem pergunta', a: '' });
    expect(paragraphQa('Preciso de impressora?\nSim, ou numa papelaria.')).toEqual({ q: 'Preciso de impressora?', a: 'Sim, ou numa papelaria.' });
    expect(paragraphQa('Texto comum.')).toBeNull();
    const entries = faqEntries(bodyBlocks('Dúvidas comuns.\n\n- Como recebo? Por e-mail.\n\nPreciso de impressora?\nSim.'));
    expect(entries).toEqual([
      { kind: 'text', text: 'Dúvidas comuns.' },
      { kind: 'qa', q: 'Como recebo?', a: 'Por e-mail.' },
      { kind: 'qa', q: 'Preciso de impressora?', a: 'Sim.' }
    ]);
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

  it('"Veja por dentro" sem repetir a capa da abertura; ampliação com foco no X, Tab preso, rolagem travada e foco de volta', async () => {
    open();
    const gal = await screen.findByTestId('generated-gallery');
    expect(within(gal).getByRole('heading', { name: 'Veja por dentro' })).toBeInTheDocument();
    const imgs = within(gal).getAllByRole('img');
    expect(imgs.map(i => i.getAttribute('src'))).toEqual(GALLERY.slice(1));
    const opener = within(gal).getByRole('button', { name: /imagem 1 de 3/ });
    opener.focus();
    fireEvent.click(opener);
    const lb = screen.getByTestId('generated-lightbox');
    expect(within(lb).getByRole('img')).toHaveAttribute('src', '/images/bordado/riscos.jpg');
    const close = within(lb).getByRole('button', { name: 'Fechar imagem' });
    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(close).toHaveFocus();
    // clique na imagem não fecha; no fundo fecha
    fireEvent.click(within(lb).getByRole('img'));
    expect(screen.getByTestId('generated-lightbox')).toBeInTheDocument();
    fireEvent.click(lb);
    expect(screen.queryByTestId('generated-lightbox')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(opener).toHaveFocus();
    // Esc também fecha
    fireEvent.click(opener);
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
    // só a primeira oferta tem a âncora #oferta
    expect(document.querySelectorAll('#oferta')).toHaveLength(1);
  });

  it('oferta sem cartão: selos e aviso falam só de Pix; sem galeria quando o produto não tem imagens', async () => {
    const page = bordado({ gallery: [], delivery_pdf: false });
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
    // sem PDF ligado à oferta: nada de "PDF para imprimir"
    expect(screen.queryByText('PDF para imprimir')).toBeNull();
    expect(screen.queryByText('Arquivo em PDF para imprimir')).toBeNull();
    expect(within(screen.getByTestId('generated-offer-items')).getByText('Acesso enviado por e-mail')).toBeInTheDocument();
  });

  it('com PDF e sem itens na oferta: o cartão lista o PDF', async () => {
    open();
    expect(within(await screen.findByTestId('generated-offer-items')).getByText('Arquivo em PDF para imprimir')).toBeInTheDocument();
  });

  it('página que começa pela oferta: abertura com o título e a capa; todas as seções aparecem', async () => {
    const page = bordado();
    const noHero = page.sections.filter((s: any) => s.role !== 'HERO_HOOK').map((s: any) => ({ ...s, image_url: null }));
    page.sections = [...noHero.filter((s: any) => s.role === 'OFFER_PRICE'), ...noHero.filter((s: any) => s.role !== 'OFFER_PRICE')];
    mockFetch(page);
    open('/v/bordado-b4d48e');
    expect(await screen.findByRole('heading', { level: 1, name: 'Bordado' })).toBeInTheDocument();
    expect(screen.getByTestId('generated-hero')).toHaveAttribute('data-hero', 'title');
    expect(screen.getByTestId('generated-hero-image')).toHaveAttribute('src', '/images/bordado/capa.jpg');
    expect(screen.getAllByTestId('generated-section')).toHaveLength(page.sections.length);
    expect(screen.getByTestId('generated-offer')).toBeInTheDocument();
  });

  it('barra fixa do celular: escondida no topo fica fora da leitura e do Tab; aparece ao rolar', async () => {
    open();
    const bar = await screen.findByTestId('generated-sticky-bar');
    expect(bar).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('generated-cta-sticky')).toHaveAttribute('tabindex', '-1');
    Object.defineProperty(window, 'scrollY', { value: 900, configurable: true });
    fireEvent.scroll(window);
    expect(bar).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByTestId('generated-cta-sticky')).not.toHaveAttribute('tabindex');
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    fireEvent.scroll(window);
  });

  it('reduzir movimento: tudo visível na hora, sem esperar a rolagem', async () => {
    (window as any).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    (window.matchMedia as any).mockImplementation((query: string) => ({
      matches: /reduce/.test(query), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn()
    }));
    try {
      open();
      await screen.findByTestId('generated-offer');
      const rv = Array.from(document.querySelectorAll('.gp .rv'));
      expect(rv.length).toBeGreaterThan(3);
      expect(rv.every(e => e.classList.contains('in'))).toBe(true);
    } finally {
      delete (window as any).IntersectionObserver;
      (window.matchMedia as any).mockImplementation((query: string) => ({
        matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn()
      }));
    }
  });

  it('com animação: o que está abaixo da primeira tela aparece no máximo em 1,5 s, mesmo sem o observador disparar', async () => {
    (window as any).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return { top: 5000, bottom: 5100, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} } as DOMRect;
    };
    try {
      open();
      await screen.findByTestId('generated-offer');
      const rv = () => Array.from(document.querySelectorAll('.gp .rv'));
      expect(rv().some(e => !e.classList.contains('in'))).toBe(true);
      await new Promise(r => setTimeout(r, REVEAL_SAFETY_MS + 100));
      expect(rv().every(e => e.classList.contains('in'))).toBe(true);
    } finally {
      Element.prototype.getBoundingClientRect = rect;
      delete (window as any).IntersectionObserver;
    }
  });
});

describe('NORQVA-0129 — prévia do dono', () => {
  it('imagem do produto posta só na tela aparece marcada como tal', async () => {
    const data = {
      page: {
        id: 'g1', human_id: 'GEN-000001', slug: 'bordado-b4d48e', status: 'DRAFT', product_name: 'Bordado', offer_human_id: 'OFF-000015',
        copy_check: { blocked_count: 0, notes: [], fields: {} },
        sections: [
          { order: 1, ref_order: 1, role: 'HERO_HOOK', replaced_from: null, headline: 'Abertura', body: 'Texto', bullets: [], cta_label: 'Quero', image_url: null, image_status: 'NONE', image_preview_url: '/images/bordado/capa.jpg', image_fallback: true, removed_fields: [] },
          { order: 2, ref_order: 2, role: 'FAQ', replaced_from: null, headline: 'Dúvidas', body: 'Texto', bullets: [], cta_label: '', image_url: null, image_status: 'NONE', image_preview_url: null, image_fallback: false, removed_fields: [] }
        ],
        gallery: GALLERY,
        delivery_pdf: true
      },
      reference: null,
      ads: [],
      images: { kie: false, message: null }
    };
    const apiFetch = vi.fn().mockResolvedValue(data);
    render(<GenerationView apiFetch={apiFetch} pageId="g1" isAdmin canEdit showError={vi.fn()} showSuccess={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByTestId('image-fallback-1')).toHaveTextContent('Imagem do produto (só na tela)');
    expect(screen.queryByTestId('image-fallback-2')).toBeNull();
  });
});
