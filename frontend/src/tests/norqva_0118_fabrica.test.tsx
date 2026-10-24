// NORQVA-0118: Fábrica de Criativos — passo a passo da referência à campanha pausada, criar produto e oferta
// no caminho, checklist do que falta para publicar e "Copiar a versão NORQVA" (só texto nosso).
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { FactoryWizard, matchProducts, adLibraryUrl, readiness } from '../features/creative-factory/FactoryWizard';
import { buildNorqvaCopy, adText } from '../features/creative-factory/factoryCopy';
import { GenerationView } from '../features/creative-factory/GenerationView';

const product = { id: '11111111-1111-4111-8111-111111111111', name: 'Trattoria em Casa', human_id: 'PRD-000001' };
const other = { id: '22222222-2222-4222-8222-222222222222', name: 'Desafio Seca Barriga', human_id: 'PRD-000002' };
const offer = { id: '33333333-3333-4333-8333-333333333333', human_id: 'OFF-000001', product_id: product.id, name: 'Trattoria', price: 19.9, status: 'RASCUNHO' };
const refReady = {
  id: '44444444-4444-4444-8444-444444444444',
  human_id: 'REF-0001',
  product_id: product.id,
  product_name: 'Trattoria em Casa',
  reference_type: 'SALES_PAGE',
  source_kind: 'URL',
  source_host: 'exemplo.com',
  status: 'READY',
  structure: {
    kind: 'SALES_PAGE',
    length_class: 'MEDIUM',
    tone: 'acolhedor',
    cta_text_style: 'direto',
    color_mood: 'quente',
    sections: [{ order: 1, role: 'HERO_HOOK', purpose: 'Prender a atenção', headline_style: 'QUESTION', approx_words: 20, has_image: true, has_video: false, cta_count: 1 }]
  }
};
const pageId = '55555555-5555-4555-8555-555555555555';
const pageData = (over: any = {}, ads: any[] = []) => ({
  page: {
    id: pageId,
    human_id: 'GEN-0001',
    slug: 'trattoria-abc',
    status: 'DRAFT',
    product_name: 'Trattoria em Casa',
    offer_id: offer.id,
    offer_human_id: offer.human_id,
    offer_status: 'RASCUNHO',
    reference_id: refReady.id,
    sections: [
      { order: 1, role: 'HERO_HOOK', headline: 'Massa fresca em casa', body: 'Receitas passo a passo.', bullets: ['Massas', 'Molhos'], cta_label: 'Quero o meu' },
      { order: 2, role: 'OFFER_PRICE', headline: 'Leve hoje', body: '', bullets: [], cta_label: '', price: { price_text: 'R$ 19,90', installments_text: null } }
    ],
    copy_check: { fields: {}, blocked_count: 0 },
    ...over
  },
  reference: { id: refReady.id, human_id: 'REF-0001', reference_type: 'SALES_PAGE', structure: refReady.structure },
  ads,
  images: { kie: false, message: null }
});
const adOk = { id: '66666666-6666-4666-8666-666666666666', human_id: 'CRV-0001', hook: 'Massa fresca?', primary_text: 'Aprenda em casa.', headline: 'Trattoria', ad_description: '', cta: 'Saiba mais', script: '', approval_status: 'APPROVED', copy_check: { fields: {} } };

beforeEach(() => {
  window.localStorage.clear();
});

type Handler = (url: string, opts?: RequestInit) => any;
const makeApi = (h: Handler) =>
  vi.fn(async (url: string, opts?: RequestInit) => {
    const r = h(url, opts);
    if (r instanceof Error) throw r;
    return r;
  });

const baseRoutes = (extra: Handler = () => undefined): Handler => (url, opts) => {
  const x = extra(url, opts);
  if (x !== undefined) return x;
  if (url.startsWith('/creative-references/status')) return { enabled: true, kie: false };
  if (url.startsWith('/products')) return { products: [product, other] };
  if (url.startsWith('/offers')) return { offers: [offer] };
  if (url === '/creative-references') return { references: [refReady], trash: [] };
  if (url === '/generated-pages') return { pages: [] };
  return {};
};

describe('NORQVA-0118 — funções da Fábrica', () => {
  it('acha o nosso produto pelo nome, sem acento e sem maiúscula', () => {
    expect(matchProducts([product, other], 'trattória').map(p => p.id)).toEqual([product.id]);
    expect(matchProducts([product, other], 'barriga')).toEqual([other]);
    expect(matchProducts([product, other], 'ab')).toEqual([]);
  });

  it('busca na Biblioteca de Anúncios: só um link para o dono abrir, com o termo e o Brasil', () => {
    const u = new URL(adLibraryUrl('massa fresca'));
    expect(u.hostname).toBe('www.facebook.com');
    expect(u.pathname).toBe('/ads/library/');
    expect(u.searchParams.get('q')).toBe('massa fresca');
    expect(u.searchParams.get('country')).toBe('BR');
  });

  it('o que falta para publicar', () => {
    expect(readiness(pageData()).all).toBe(false);
    const ok = readiness({ ...pageData({ status: 'PUBLISHED', approved_at: 'x', offer_status: 'TESTE' }, [adOk]), delivery_files: 1 });
    expect(ok).toMatchObject({ approved: true, fileOk: true, offerOk: true, live: true, readyAds: 1, all: true });
    // anúncio aprovado mas com a checagem vencida não conta
    expect(readiness(pageData({ status: 'PUBLISHED', offer_status: 'ATIVA' }, [{ ...adOk, copy_check: { stale: true } }])).readyAds).toBe(0);
  });

  it('sem arquivo entregue ao comprador, nada avança', () => {
    const ok = pageData({ status: 'PUBLISHED', approved_at: 'x', offer_status: 'TESTE' }, [adOk]);
    expect(readiness({ ...ok, delivery_files: 0 }).all).toBe(false);
    expect(readiness({ ...ok, delivery_files: null }).all).toBe(false);
    expect(readiness({ ...ok, delivery_files: 1 }).all).toBe(true);
  });

  it('cópia: página na ordem e anúncios, com o preço só da oferta', () => {
    const d = pageData({}, [adOk]);
    const txt = buildNorqvaCopy({ title: 'Trattoria em Casa (GEN-0001)', sections: d.page.sections, ads: d.ads });
    expect(txt).toContain('Versão NORQVA — Trattoria em Casa (GEN-0001)');
    expect(txt.indexOf('1. Abertura (gancho)')).toBeLessThan(txt.indexOf('2. Oferta e preço'));
    expect(txt).toContain('- Molhos');
    expect(txt).toContain('Preço (vem da oferta): R$ 19,90');
    expect(txt).toContain('ANÚNCIOS (1)');
    expect(adText(adOk)).toContain('Texto principal: Aprenda em casa.');
    expect(adText(adOk)).not.toMatch(/R\$/);
    // nada da estrutura da referência entra na cópia
    expect(txt).not.toContain('Prender a atenção');
  });
});

describe('NORQVA-0118 — tela da Fábrica', () => {
  it('início: nada em andamento e botão de começar; passo 1 acha o produto e só libera a referência depois dele', async () => {
    const api = makeApi(baseRoutes((url) => (url === '/creative-references' ? { references: [], trash: [] } : undefined)));
    render(<FactoryWizard apiFetch={api} isAdmin canCreate showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByTestId('factory-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('factory-start'));
    expect(screen.getByTestId('factory-stepper')).toBeInTheDocument();
    expect(screen.getByTestId('fab-pick-product-first')).toBeInTheDocument();
    expect(screen.getByTestId('factory-step-3')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nome do produto'), { target: { value: 'trattoria' } });
    expect(screen.getByTestId('fab-ad-library')).toHaveAttribute('href', expect.stringContaining('q=trattoria'));
    fireEvent.click(within(screen.getByTestId('fab-matches')).getByText('Trattoria em Casa'));
    expect(await screen.findByTestId('reference-form')).toBeInTheDocument();
    // produto já escolhido: o formulário não pede de novo
    expect(screen.queryByLabelText('Produto nosso', { selector: '#ref-product' })).toBeNull();
    expect(screen.getByTestId('factory-next')).toBeDisabled();
  });

  it('cria o produto no caminho (só ADMIN) e envia a referência com ele', async () => {
    const created = { id: '77777777-7777-4777-8777-777777777777', human_id: 'PRD-000009', name: 'Pães Caseiros' };
    let productsNow: any[] = [product, other];
    const api = makeApi(
      baseRoutes((url, opts) => {
        if (url.startsWith('/products') && opts?.method === 'POST') {
          productsNow = [...productsNow, created];
          return { product: created };
        }
        if (url.startsWith('/products')) return { products: productsNow };
        if (url === '/creative-references' && opts?.method === 'POST') return { reference: { ...refReady, id: '88888888-8888-4888-8888-888888888888', product_id: created.id } };
        if (url === '/creative-references') return { references: [refReady], trash: [] };
        return undefined;
      })
    );
    render(<FactoryWizard apiFetch={api} isAdmin canCreate showError={vi.fn()} showSuccess={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('factory-start'));
    fireEvent.change(screen.getByLabelText('Nome do produto'), { target: { value: 'Pães Caseiros' } });
    fireEvent.click(screen.getByTestId('fab-create-product'));
    fireEvent.change(screen.getByLabelText('Descrição curta (o que o comprador recebe)'), { target: { value: 'Livro de pães.' } });
    fireEvent.click(screen.getByTestId('fab-product-submit'));
    await waitFor(() => expect(api.mock.calls.some(c => c[0] === '/products?mode=real' && c[1]?.method === 'POST')).toBe(true));
    const body = JSON.parse(String(api.mock.calls.find(c => c[0] === '/products?mode=real' && c[1]?.method === 'POST')![1]!.body));
    expect(body).toEqual({ name: 'Pães Caseiros', category: 'Infoproduto digital', description: 'Livro de pães.' });
    // com o produto novo escolhido, manda o link da referência
    fireEvent.change(await screen.findByLabelText('Link da página ou do anúncio'), { target: { value: 'https://exemplo.com/pagina' } });
    fireEvent.click(screen.getByTestId('reference-submit'));
    await waitFor(() => expect(api.mock.calls.some(c => c[0] === '/creative-references' && c[1]?.method === 'POST')).toBe(true));
    const refBody = JSON.parse(String(api.mock.calls.find(c => c[0] === '/creative-references' && c[1]?.method === 'POST')![1]!.body));
    expect(refBody.product_id).toBe(created.id);
  });

  it('quem não é ADMIN não vê "criar produto"', async () => {
    const api = makeApi(baseRoutes());
    render(<FactoryWizard apiFetch={api} isAdmin={false} canCreate showError={vi.fn()} showSuccess={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('factory-start'));
    fireEvent.change(screen.getByLabelText('Nome do produto'), { target: { value: 'Pães' } });
    expect(screen.queryByTestId('fab-create-product')).toBeNull();
  });

  it('passos 2 e 3: mostra a estrutura, cria oferta em rascunho e gera página e anúncios', async () => {
    const newOffer = { ...offer, id: '99999999-9999-4999-8999-999999999999', human_id: 'OFF-000009', status: 'RASCUNHO' };
    let offersNow: any[] = [];
    const api = makeApi(
      baseRoutes((url, opts) => {
        if (url.startsWith('/offers') && opts?.method === 'POST') {
          offersNow = [newOffer];
          return { offer: newOffer };
        }
        if (url.startsWith('/offers')) return { offers: offersNow };
        if (url.endsWith('/generate')) return { page: { id: pageId, human_id: 'GEN-0001', product_id: product.id } };
        if (url === `/generated-pages/${pageId}`) return pageData();
        return undefined;
      })
    );
    window.localStorage.setItem('norqva.fabrica.run', JSON.stringify({ refId: refReady.id, productId: product.id }));
    render(<FactoryWizard apiFetch={api} isAdmin canCreate showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByTestId('factory-analysis')).toBeInTheDocument();
    expect(screen.getByText('Prender a atenção')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('factory-next'));
    expect(await screen.findByTestId('fab-no-offer')).toBeInTheDocument();
    expect(screen.getByTestId('fab-generate')).toBeDisabled();
    fireEvent.click(screen.getByTestId('fab-create-offer'));
    fireEvent.change(screen.getByLabelText('Preço (R$)'), { target: { value: '19,90' } });
    fireEvent.click(screen.getByTestId('fab-offer-submit'));
    await waitFor(() => expect(screen.getByTestId('fab-generate')).not.toBeDisabled());
    const offerBody = JSON.parse(String(api.mock.calls.find(c => String(c[0]).startsWith('/offers') && c[1]?.method === 'POST')![1]!.body));
    expect(offerBody).toMatchObject({ product_id: product.id, name: 'Trattoria em Casa', price: 19.9 });
    fireEvent.click(screen.getByTestId('fab-generate'));
    await waitFor(() => expect(screen.getByTestId('factory-generation')).toBeInTheDocument());
    const gen = api.mock.calls.find(c => String(c[0]).endsWith('/generate'))!;
    expect(gen[0]).toBe(`/creative-references/${refReady.id}/generate`);
    expect(JSON.parse(String(gen[1]!.body))).toMatchObject({ product_id: product.id, offer_id: newOffer.id, ad_count: 3, new_images: false });
    // passo 4: aprovar/publicar a página ficam no passo 5
    expect(await screen.findByTestId('generation-view')).toBeInTheDocument();
    expect(screen.queryByText('Aprovar página')).toBeNull();
  });

  it('passo 5: checklist com os botões para resolver e trava do "Continuar"', async () => {
    let state = pageData({}, [adOk]);
    const api = makeApi(
      baseRoutes((url, opts) => {
        if (url === `/generated-pages/${pageId}/approve`) {
          state = pageData({ status: 'APPROVED', approved_at: 'x' }, [adOk]);
          return {};
        }
        if (url === `/offers/${offer.id}?mode=real` && opts?.method === 'PUT') {
          state = pageData({ status: 'APPROVED', approved_at: 'x', offer_status: 'TESTE' }, [adOk]);
          return {};
        }
        if (url === `/generated-pages/${pageId}/publish`) {
          state = pageData({ status: 'PUBLISHED', approved_at: 'x', offer_status: 'TESTE' }, [adOk]);
          return {};
        }
        if (url === `/generated-pages/${pageId}`) return state;
        if (url === `/offers/${offer.id}/digital-assets?mode=real`) return [{ id: 'a1', name: 'TRATTORIA.pdf' }];
        if (url === `/generated-pages/${pageId}/campaign`) return { plan: null, ads: [], defaults: null, mutation_enabled: false };
        return undefined;
      })
    );
    window.localStorage.setItem('norqva.fabrica.run', JSON.stringify({ refId: refReady.id, pageId, productId: product.id }));
    render(<FactoryWizard apiFetch={api} isAdmin canCreate showError={vi.fn()} showSuccess={vi.fn()} />);
    await screen.findByTestId('factory-generation');
    fireEvent.click(screen.getByTestId('factory-step-5'));
    const approval = await screen.findByTestId('factory-approval');
    expect(within(approval).getByTestId('factory-next')).toBeDisabled();
    fireEvent.click(within(screen.getByTestId('check-approved')).getByText('Aprovar página'));
    await waitFor(() => expect(within(screen.getByTestId('check-offer')).getByTestId('offer-to-test')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('offer-to-test'));
    await waitFor(() => expect(within(screen.getByTestId('check-live')).getByText('Publicar página')).not.toBeDisabled());
    const put = api.mock.calls.find(c => c[0] === `/offers/${offer.id}?mode=real`)!;
    expect(JSON.parse(String(put[1]!.body))).toEqual({ status: 'TESTE' });
    fireEvent.click(within(screen.getByTestId('check-live')).getByText('Publicar página'));
    await waitFor(() => expect(screen.getByTestId('factory-next')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('factory-next'));
    expect(await screen.findByTestId('factory-publish')).toBeInTheDocument();
  });
});

describe('NORQVA-0118 — Copiar a versão NORQVA na tela de geração', () => {
  it('copia página e anúncios (com o que está digitado) para a área de transferência', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const api = makeApi(url => (url === `/generated-pages/${pageId}` ? pageData({}, [adOk]) : {}));
    const ok = vi.fn();
    render(<GenerationView apiFetch={api} pageId={pageId} isAdmin canEdit showError={vi.fn()} showSuccess={ok} onBack={vi.fn()} />);
    await screen.findByTestId('generation-view');
    const titles = screen.getAllByDisplayValue('Massa fresca em casa');
    fireEvent.change(titles[0], { target: { value: 'Massa fresca na sua cozinha' } });
    fireEvent.click(screen.getByTestId('copy-norqva'));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const txt = String(writeText.mock.calls[0][0]);
    expect(txt).toContain('Título: Massa fresca na sua cozinha');
    expect(txt).toContain('CRV-0001');
    expect(ok).toHaveBeenCalledWith('Versão NORQVA copiada: página e anúncios.');
    fireEvent.click(screen.getByTestId('copy-ad-CRV-0001'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(String(writeText.mock.calls[1][0])).toContain('Gancho: Massa fresca?');
  });
});

describe('NORQVA-0118 — revisão: travas e retomada', () => {
  it('oferta sem PDF: "Pôr em teste" e "Publicar" ficam travados e o item explica', async () => {
    const state = pageData({ status: 'APPROVED', approved_at: 'x' }, [adOk]);
    const api = makeApi(
      baseRoutes(url => {
        if (url === `/generated-pages/${pageId}`) return state;
        if (url === `/offers/${offer.id}/digital-assets?mode=real`) return [];
        return undefined;
      })
    );
    window.localStorage.setItem('norqva.fabrica.run', JSON.stringify({ refId: refReady.id, pageId, productId: product.id }));
    render(<FactoryWizard apiFetch={api} isAdmin canCreate showError={vi.fn()} showSuccess={vi.fn()} />);
    await screen.findByTestId('factory-generation');
    fireEvent.click(screen.getByTestId('factory-step-5'));
    expect(await screen.findByTestId('check-file')).toHaveTextContent('PDF entregue ao comprador');
    expect(screen.getByTestId('offer-to-test')).toBeDisabled();
    expect(within(screen.getByTestId('check-live')).getByText('Publicar página')).toBeDisabled();
    expect(screen.getByTestId('factory-step-6')).toBeDisabled();
  });

  it('falha de rede ao retomar não apaga a fábrica salva; página que não existe mais, apaga', async () => {
    const saved = JSON.stringify({ refId: refReady.id, pageId, productId: product.id });
    window.localStorage.setItem('norqva.fabrica.run', saved);
    const err = vi.fn();
    const api = makeApi(baseRoutes(url => (url === `/generated-pages/${pageId}` ? new Error('Failed to fetch') : undefined)));
    const { unmount } = render(<FactoryWizard apiFetch={api} isAdmin canCreate showError={err} showSuccess={vi.fn()} />);
    await waitFor(() => expect(err).toHaveBeenCalled());
    expect(window.localStorage.getItem('norqva.fabrica.run')).toBe(saved);
    unmount();
    const api2 = makeApi(baseRoutes(url => (url === `/generated-pages/${pageId}` ? new Error('Página gerada não encontrada.') : undefined)));
    render(<FactoryWizard apiFetch={api2} isAdmin canCreate showError={vi.fn()} showSuccess={vi.fn()} />);
    await screen.findByTestId('factory-home');
    expect(JSON.parse(window.localStorage.getItem('norqva.fabrica.run') || '{}')).toEqual({});
  });

  it('passo 3 sem a referência (lixeira): aviso e botão de voltar, nunca tela em branco', async () => {
    const api = makeApi(
      baseRoutes(url => {
        if (url === '/creative-references') return { references: [], trash: [] };
        if (url === `/generated-pages/${pageId}`) return pageData();
        if (url.endsWith('/digital-assets?mode=real')) return [];
        return undefined;
      })
    );
    window.localStorage.setItem('norqva.fabrica.run', JSON.stringify({ refId: refReady.id, pageId, productId: product.id }));
    render(<FactoryWizard apiFetch={api} isAdmin canCreate showError={vi.fn()} showSuccess={vi.fn()} />);
    await screen.findByTestId('factory-generation');
    fireEvent.click(screen.getByTestId('factory-step-3'));
    expect(await screen.findByTestId('factory-no-ref')).toBeInTheDocument();
    expect(screen.getByText('Voltar')).toBeInTheDocument();
  });

  it('referência que falhou: o motivo fica no passo 1', async () => {
    const api = makeApi(
      baseRoutes((url, opts) => {
        if (url === '/creative-references' && opts?.method === 'POST') return { reference: { ...refReady, status: 'FAILED', failure_reason: 'HTTP 500 na página' } };
        return undefined;
      })
    );
    render(<FactoryWizard apiFetch={api} isAdmin canCreate showError={vi.fn()} showSuccess={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('factory-start'));
    fireEvent.change(screen.getByLabelText('Produto nosso'), { target: { value: product.id } });
    fireEvent.change(await screen.findByLabelText('Link da página ou do anúncio'), { target: { value: 'https://exemplo.com/x' } });
    fireEvent.click(screen.getByTestId('reference-submit'));
    expect(await screen.findByTestId('fab-ref-failure')).toHaveTextContent('HTTP 500 na página');
  });
});

describe('NORQVA-0118 — aba Fábrica em Criativos', () => {
  const factory = { availableBatches: [], importedBatches: [], rejectionReasons: ['OTHER'], producedAssets: {}, claims: [], creatives: [], campaigns: [] };
  const route = (url: string) => {
    if (url.startsWith('/creative-factory/creatives?')) return Promise.resolve(factory);
    if (url.startsWith('/creative-factory/adjustments')) return Promise.resolve({ items: [] });
    if (url === '/creative-references/status') return Promise.resolve({ enabled: true, kie: false });
    if (url === '/creative-references') return Promise.resolve({ references: [], trash: [] });
    if (url === '/generated-pages') return Promise.resolve({ pages: [] });
    return Promise.resolve({});
  };

  it('com a trava ligada, a Fábrica abre primeiro para ADMIN e CREATIVE', async () => {
    const { CreativeFactoryView } = await import('../features/creative-factory/CreativeFactoryView');
    const apiFetch = vi.fn().mockImplementation(route);
    render(<CreativeFactoryView currentUser={{ id: 'u', name: 'C', role: 'CREATIVE', email: 'c@x.test' } as any} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByTestId('factory-home')).toBeInTheDocument();
    expect(screen.getByTestId('factory-section-factory')).toHaveAttribute('aria-selected', 'true');
  });

  it('outros perfis seguem caindo em Criativos (sem a aba)', async () => {
    const { CreativeFactoryView } = await import('../features/creative-factory/CreativeFactoryView');
    const apiFetch = vi.fn().mockImplementation(route);
    render(<CreativeFactoryView currentUser={{ id: 'u', name: 'P', role: 'PERFORMANCE', email: 'p@x.test' } as any} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(screen.queryByTestId('factory-sections')).toBeNull();
    expect(screen.queryByTestId('factory-home')).toBeNull();
  });
});
