// NORQVA-0116: página gerada pública (/v/:slug) e tela de geração (esqueleto x nossa página).
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GeneratedPage, checkoutHref } from '../features/public/GeneratedPage';
import { GenerationView } from '../features/creative-factory/GenerationView';
import { CreativeReferences } from '../features/creative-factory/CreativeReferences';
import { isPublicCommercialRoute } from '../services/metaPixel';

const publicPage = {
  slug: 'livro-abc123',
  theme: 'light',
  title: 'Trattoria em Casa',
  offer: { human_id: 'OFF-000001' },
  meta_pixel_id: null,
  sections: [
    { order: 1, role: 'HERO_HOOK', headline: 'Massa fresca na sua cozinha', body: 'Receitas italianas passo a passo.\n\nPara fazer em casa.', bullets: [], cta_label: 'Quero o meu', image_url: '/images/kit/capa_trat.jpg' },
    { order: 2, role: 'CONTENTS', headline: 'O que vem dentro', body: '', bullets: ['Massas', 'Molhos'], cta_label: '', image_url: null },
    {
      order: 3, role: 'OFFER_PRICE', headline: 'Leve hoje', body: '', bullets: [], cta_label: '', image_url: null,
      price: { price_text: 'R$ 19,90', installments_text: 'ou 3x de R$ 6,63 sem juros no cartão' }, note: null
    },
    { order: 4, role: 'GUARANTEE', headline: 'Compra segura', body: '', bullets: [], cta_label: '', image_url: null, note: 'Pela lei, você pode desistir em até 7 dias.' }
  ]
};

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  (window.matchMedia as any).mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn()
  }));
});

const mockFetch = (status: number, body: any) => {
  const fn = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  global.fetch = fn as any;
  return fn;
};

describe('NORQVA-0116 — página pública /v/:slug', () => {
  it('é rota pública do comprador (PageView da Meta como /p e /kit)', () => {
    expect(isPublicCommercialRoute('/v/livro-abc123')).toBe(true);
  });

  it('link do pagamento: ?checkout=1 e mantém UTMs e fbclid', () => {
    expect(checkoutHref('OFF-000001', '?utm_source=meta&utm_campaign=x&fbclid=abc&checkout=0')).toBe(
      '/p/OFF-000001?checkout=1&utm_source=meta&utm_campaign=x&fbclid=abc'
    );
    expect(checkoutHref('OFF-000001', '')).toBe('/p/OFF-000001?checkout=1');
    // nunca nome, e-mail ou telefone (nem outros parâmetros)
    expect(checkoutHref('OFF-000001', '?name=Ana&email=a%40b.com&phone=31999&nome=Ana&utm_term=x&gclid=g&ref=r&src=s&foo=1&ad_id=9')).toBe(
      '/p/OFF-000001?checkout=1&utm_term=x&gclid=g&ref=r&src=s&ad_id=9'
    );
  });

  it('mostra as seções e os botões levam ao pagamento com os parâmetros de origem', async () => {
    const f = mockFetch(200, publicPage);
    render(
      <MemoryRouter initialEntries={['/v/livro-abc123?utm_source=meta&fbclid=abc&email=a%40b.com&name=Ana&phone=31999']}>
        <GeneratedPage />
      </MemoryRouter>
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Massa fresca na sua cozinha' })).toBeInTheDocument();
    expect(String(f.mock.calls[0][0])).toContain('/public/generated-pages/livro-abc123');
    expect(screen.getByText('Para fazer em casa.')).toBeInTheDocument();
    expect(screen.getByText('Molhos')).toBeInTheDocument();
    expect(screen.getAllByTestId('generated-section')).toHaveLength(4);
    // NORQVA-0129: botão na abertura, no cartão da oferta e no fim; todos com o mesmo link
    const ctas = screen.getAllByTestId('generated-cta');
    expect(ctas.length).toBeGreaterThanOrEqual(2);
    for (const c of ctas) expect(c).toHaveAttribute('href', '/p/OFF-000001?checkout=1&utm_source=meta&fbclid=abc');
    expect(screen.getByTestId('generated-cta-sticky')).toHaveTextContent('Quero o meu');
    expect(screen.getByTestId('generated-page')).toHaveAttribute('data-look', 'light');
    await waitFor(() => expect(document.title).toBe('Trattoria em Casa'));
    // preço e parcelas vêm da oferta (campo price da seção), e a frase fixa da garantia aparece
    expect(screen.getByTestId('generated-price')).toHaveTextContent('R$ 19,90');
    expect(screen.getByTestId('generated-price')).toHaveTextContent('ou 3x de R$ 6,63 sem juros no cartão');
    expect(screen.getByText('Pela lei, você pode desistir em até 7 dias.')).toBeInTheDocument();
  });

  it('página fora do ar ou inexistente: aviso simples', async () => {
    mockFetch(404, { error: 'Página não encontrada.' });
    render(
      <MemoryRouter initialEntries={['/v/nao-existe']}>
        <GeneratedPage />
      </MemoryRouter>
    );
    expect(await screen.findByText('Esta página não está disponível.')).toBeInTheDocument();
  });
});

const genData = (over: any = {}) => ({
  page: {
    id: 'g1',
    human_id: 'GEN-000001',
    slug: 'livro-abc123',
    status: 'DRAFT',
    product_name: 'Trattoria em Casa',
    offer_human_id: 'OFF-000001',
    copy_check: {
      blocked_count: 1,
      notes: ['Seção de depoimentos/provas virou uma prévia do conteúdo: não há depoimentos ou resultados aprovados.'],
      fields: {
        '1.headline': { ok: true, issues: [] },
        '1.body': { ok: true, issues: [] },
        '2.headline': { ok: false, issues: [{ code: 'COPY', detail: 'Texto removido: continuou parecido com a referência. Escreva de novo ou gere de novo.' }] },
        '2.body': { ok: true, issues: [] }
      }
    },
    sections: [
      { order: 1, ref_order: 1, role: 'HERO_HOOK', replaced_from: null, headline: 'Massa fresca na sua cozinha', body: 'Texto', bullets: [], cta_label: 'Quero o meu', image_status: 'PRODUCT', image_preview_url: '/images/kit/capa_trat.jpg', removed_fields: [] },
      { order: 2, ref_order: 3, role: 'CONTENTS', replaced_from: 'TESTIMONIALS', headline: '', body: 'Prévia', bullets: [], cta_label: '', image_status: 'NONE', removed_fields: ['headline'] }
    ],
    ...over
  },
  reference: {
    id: 'r1',
    human_id: 'REF-000001',
    reference_type: 'SALES_PAGE',
    structure: {
      kind: 'SALES_PAGE',
      sections: [
        { order: 1, role: 'HERO_HOOK', purpose: 'Abertura com pergunta sobre a dor do leitor', approx_words: 120, has_image: true, cta_count: 1 },
        { order: 3, role: 'TESTIMONIALS', purpose: 'Depoimentos de clientes', approx_words: 80, has_image: false, cta_count: 0 }
      ]
    }
  },
  ads: [
    {
      id: 'c1', human_id: 'GEN-000001-A1', hook: 'Gancho original', primary_text: 'Receitas', headline: 'Cozinha italiana', ad_description: 'Livro digital', cta: 'Saiba mais',
      script: 'Gancho: Abertura', approval_status: 'DRAFT', claims: [{ text: 'Receitas com passo a passo' }],
      copy_check: { blocked: true, fields: { hook: { ok: true, issues: [] }, primary_text: { ok: false, issues: [{ code: 'PRICE', detail: 'Preço no anúncio: "R$ 19,90" (valor em reais (R$))' }] } } }
    }
  ],
  images: { kie: false, message: 'Imagens novas desligadas (falta KIE_API_KEY)' }
});

describe('NORQVA-0116 — tela de geração', () => {
  const setup = (opts: { isAdmin: boolean; data?: any }) => {
    const apiFetch = vi.fn().mockImplementation((url: string) => Promise.resolve(opts.data || genData()));
    render(<GenerationView apiFetch={apiFetch} pageId="g1" isAdmin={opts.isAdmin} canEdit showError={vi.fn()} showSuccess={vi.fn()} onBack={vi.fn()} />);
    return apiFetch;
  };

  it('computador: esqueleto da referência à esquerda e a nossa seção à direita, com os selos da checagem', async () => {
    setup({ isAdmin: true });
    const rows = await screen.findAllByTestId('generation-section');
    expect(rows).toHaveLength(2);
    expect(rows[0].className).toContain('grid-cols-2');
    expect(rows[0]).toHaveTextContent('Referência · parte 1');
    expect(rows[0]).toHaveTextContent('Abertura com pergunta sobre a dor do leitor');
    expect(within(rows[0]).getByDisplayValue('Massa fresca na sua cozinha')).toBeInTheDocument();
    expect(screen.getByTestId('check-1-headline')).toHaveTextContent('Original');
    expect(screen.getByTestId('check-2-headline')).toHaveTextContent('Texto removido');
    expect(rows[1]).toHaveTextContent('No lugar de "Depoimentos"');
    expect(screen.getByTestId('images-note')).toHaveTextContent('Imagens novas desligadas (falta KIE_API_KEY)');
    expect(screen.getByTestId('blocked-note')).toHaveTextContent('1 campo bloqueado');
    expect(screen.getByTestId('generation-status')).toHaveTextContent('Rascunho');
    // anúncio: na fábrica, bloqueado por preço, com Aprovar/Rejeitar para o ADMIN
    const ad = screen.getByTestId('generation-ad');
    expect(ad).toHaveTextContent('Bloqueado pela checagem');
    expect(screen.getByTestId('ad-check-GEN-000001-A1-primary_text')).toHaveTextContent('Preço no anúncio');
    expect(within(ad).getByText('Aprovar')).toBeInTheDocument();
    expect(within(ad).getByText('Rejeitar')).toBeInTheDocument();
  });

  it('celular: as duas colunas ficam uma embaixo da outra', async () => {
    (window.matchMedia as any).mockImplementation((query: string) => ({
      matches: true, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn()
    }));
    setup({ isAdmin: true });
    const rows = await screen.findAllByTestId('generation-section');
    expect(rows[0].className).not.toContain('grid-cols-2');
    expect(rows[0].className).toContain('space-y-2');
  });

  it('ADMIN aprova a página e o anúncio pelo fluxo da fábrica; CREATIVE não vê aprovar nem publicar', async () => {
    const apiFetch = setup({ isAdmin: true });
    fireEvent.click(await screen.findByText('Aprovar página'));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/generated-pages/g1/approve', expect.objectContaining({ method: 'POST' })));
    fireEvent.click(within(screen.getByTestId('generation-ad')).getByText('Aprovar'));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/creative-factory/creatives/c1/review?mode=real', expect.objectContaining({ body: JSON.stringify({ decision: 'APPROVED' }) }))
    );
  });

  it('CREATIVE: edita e gera de novo, mas não aprova nem publica', async () => {
    const apiFetch = setup({ isAdmin: false });
    await screen.findAllByTestId('generation-section');
    expect(screen.queryByText('Aprovar página')).toBeNull();
    expect(screen.queryByText('Publicar')).toBeNull();
    expect(within(screen.getByTestId('generation-ad')).queryByText('Aprovar')).toBeNull();
    const input = screen.getByDisplayValue('Massa fresca na sua cozinha');
    fireEvent.change(input, { target: { value: 'Massa fresca feita por você' } });
    fireEvent.click(screen.getByTestId('save-section-1'));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/generated-pages/g1/sections/1', expect.objectContaining({ method: 'PATCH' }))
    );
    const call = apiFetch.mock.calls.find((c: any[]) => c[0] === '/generated-pages/g1/sections/1');
    expect(JSON.parse(call![1].body).headline).toBe('Massa fresca feita por você');
  });

  it('publicada: mostra o link /v/ e o botão Tirar do ar', async () => {
    setup({ isAdmin: true, data: genData({ status: 'PUBLISHED' }) });
    expect(await screen.findByTestId('public-link')).toHaveTextContent('/v/livro-abc123');
    expect(screen.getByText('Tirar do ar')).toBeInTheDocument();
    expect(screen.queryByText('Aprovar página')).toBeNull();
  });
});

describe('NORQVA-0116 — revisão: preço da oferta, seção fixa, roteiro e checagem vencida', () => {
  it('mostra o preço vindo da oferta, a seção de promessas sem edição, o roteiro editável e o aviso de checagem vencida', async () => {
    const base = genData();
    const data = {
      ...base,
      page: {
        ...base.page,
        sections: [
          ...base.page.sections,
          { order: 3, ref_order: null, role: 'TESTIMONIALS', fixed: true, headline: 'O que dizem de nós', body: '', bullets: ['Aprovado pela leitora Carla'], cta_label: '', image_status: 'NONE', removed_fields: [] },
          { order: 4, ref_order: null, role: 'OFFER_PRICE', headline: 'Leve hoje', body: 'Chamada', bullets: [], cta_label: 'Quero', image_status: 'NONE', removed_fields: [], price: { price_text: 'R$ 19,90', installments_text: 'ou 3x de R$ 6,63 sem juros no cartão' } }
        ]
      },
      ads: [{ ...base.ads[0], copy_check: { stale: true } }]
    };
    const apiFetch = vi.fn().mockResolvedValue(data);
    render(<GenerationView apiFetch={apiFetch} pageId="g1" isAdmin canEdit showError={vi.fn()} showSuccess={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByTestId('section-price-4')).toHaveTextContent('R$ 19,90');
    expect(screen.getByTestId('section-price-4')).toHaveTextContent('a IA não escreve preço');
    expect(screen.getByTestId('fixed-section-3')).toHaveTextContent('Aprovado pela leitora Carla');
    expect(screen.queryByDisplayValue('O que dizem de nós')).toBeNull(); // sem campo de edição
    expect(screen.getByTestId('ad-check-stale')).toHaveTextContent('roda de novo na hora de aprovar');
    const script = screen.getByDisplayValue('Gancho: Abertura');
    fireEvent.change(script, { target: { value: 'Gancho: Abertura nova' } });
    fireEvent.click(within(screen.getByTestId('generation-ad')).getByText('Salvar'));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/generated-pages/g1/ads/c1', expect.objectContaining({ method: 'PATCH' })));
    const call = apiFetch.mock.calls.find((c: any[]) => c[0] === '/generated-pages/g1/ads/c1');
    expect(JSON.parse(call![1].body).script).toBe('Gancho: Abertura nova');
  });

  it('link com endereço inválido (%) mostra "não disponível" sem quebrar', async () => {
    render(
      <MemoryRouter initialEntries={['/v/%E0%A4%A']}>
        <GeneratedPage />
      </MemoryRouter>
    );
    expect(await screen.findByText('Esta página não está disponível.')).toBeInTheDocument();
  });
});

describe('NORQVA-0116 — gerar a partir da referência', () => {
  it('referência pronta: escolhe produto e oferta, gera e abre a tela de geração', async () => {
    const ready = {
      id: 'r1', human_id: 'REF-000001', product_id: 'p1', product_name: 'Trattoria em Casa', source_kind: 'PAGE_URL', source_host: 'x.test',
      reference_type: 'SALES_PAGE', status: 'READY', created_at: '2026-10-23T10:00:00Z',
      structure: { kind: 'SALES_PAGE', tone: '', length_class: 'SHORT', cta_text_style: '', color_mood: '', sections: [{ order: 1, role: 'HERO_HOOK', purpose: 'Abertura', headline_style: 'QUESTION', approx_words: 50, has_image: false, has_video: false, cta_count: 1 }] }
    };
    const apiFetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (url === '/creative-references/status') return Promise.resolve({ enabled: true, kie: false });
      if (url === '/creative-references') return Promise.resolve({ references: [ready], trash: [] });
      if (url.startsWith('/generated-pages?')) return Promise.resolve({ pages: [], trash: [] });
      if (url === '/creative-references/r1/generate') return Promise.resolve(genData());
      if (url === '/generated-pages/g1') return Promise.resolve(genData());
      return Promise.resolve({});
    });
    render(
      <CreativeReferences
        apiFetch={apiFetch}
        showError={vi.fn()}
        showSuccess={vi.fn()}
        products={[{ id: 'p1', name: 'Trattoria em Casa' }]}
        offers={[
          { id: 'o0', human_id: 'OFF-000009', name: 'Rascunho', product_id: 'p1', status: 'RASCUNHO' },
          { id: 'o1', human_id: 'OFF-000001', name: 'Trattoria', product_id: 'p1', status: 'ATIVA' },
          { id: 'o2', human_id: 'OFF-000002', name: 'Outro produto', product_id: 'p2', status: 'ATIVA' }
        ]}
        isAdmin
        canCreate
      />
    );
    fireEvent.click(await screen.findByTestId('reference-row'));
    fireEvent.click(await screen.findByTestId('open-generate'));
    expect(screen.getByTestId('kie-off')).toHaveTextContent('falta KIE_API_KEY');
    const offerSelect = screen.getByLabelText('Oferta (preço e pagamento da página)') as HTMLSelectElement;
    await waitFor(() => expect(offerSelect.value).toBe('o1')); // a oferta ativa do produto vem marcada
    expect(within(offerSelect).queryByText(/Outro produto/)).toBeNull();
    fireEvent.click(screen.getByTestId('generate-submit'));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/creative-references/r1/generate', expect.objectContaining({ method: 'POST' })));
    const call = apiFetch.mock.calls.find((c: any[]) => c[0] === '/creative-references/r1/generate');
    expect(JSON.parse(call![1].body)).toEqual({ product_id: 'p1', offer_id: 'o1', ad_count: 3, new_images: false });
    expect(await screen.findByTestId('generation-view')).toBeInTheDocument();
  });
});
