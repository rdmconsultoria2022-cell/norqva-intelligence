// NORQVA-0115: aba Referências na tela Criativos (só a estrutura da referência).
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreativeFactoryView } from '../features/creative-factory/CreativeFactoryView';

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }));

const admin = { id: 'u1', name: 'Admin', role: 'ADMIN', email: 'a@norqva.test' } as any;
const products = [{ id: 'p1', human_id: 'PRD-1', name: 'Trattoria em Casa' }];

const factory = { availableBatches: [], importedBatches: [], rejectionReasons: ['OTHER'], producedAssets: {}, claims: [], creatives: [], campaigns: [] };

const ready = {
  id: 'r1',
  human_id: 'REF-000001',
  product_id: 'p1',
  product_name: 'Trattoria em Casa',
  source_kind: 'PAGE_URL',
  source_host: 'concorrente.test',
  reference_type: 'SALES_PAGE',
  status: 'READY',
  extraction_method: 'AI',
  created_at: '2026-10-23T10:00:00Z',
  structure: {
    kind: 'SALES_PAGE',
    tone: 'Acolhedor',
    length_class: 'MEDIUM',
    cta_text_style: 'Imperativo curto',
    color_mood: 'Quente',
    sections: [
      { order: 1, role: 'HERO_HOOK', purpose: 'Abertura com pergunta sobre a dor do leitor', headline_style: 'QUESTION', approx_words: 120, has_image: true, has_video: true, cta_count: 1 },
      { order: 2, role: 'GUARANTEE', purpose: 'Garantia que tira o risco da compra', headline_style: 'STATEMENT', approx_words: 40, has_image: false, has_video: false, cta_count: 2 }
    ]
  }
};
const failed = { ...ready, id: 'r2', human_id: 'REF-000002', status: 'FAILED', structure: null, failure_reason: 'IA não configurada', source_kind: 'SCREENSHOTS' };

const setup = (enabled: boolean) => {
  const apiFetch = vi.fn().mockImplementation((url: string) => {
    if (url.startsWith('/creative-factory/creatives?')) return Promise.resolve(factory);
    if (url === '/creative-references/status') return Promise.resolve({ enabled });
    if (url === '/creative-references') return Promise.resolve({ references: [ready, failed], trash: [] });
    return Promise.resolve({});
  });
  render(
    <CreativeFactoryView currentUser={admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} products={products} />
  );
  return apiFetch;
};

describe('NORQVA-0115 — aba Referências', () => {
  it('trava desligada: a aba não aparece', async () => {
    const apiFetch = setup(false);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/creative-references/status'));
    expect(screen.queryByTestId('factory-section-references')).toBeNull();
  });

  it('mostra a lista e o esqueleto em cartões, com o aviso de privacidade', async () => {
    setup(true);
    fireEvent.click(await screen.findByTestId('factory-section-references'));
    expect(await screen.findByTestId('references-privacy-note')).toHaveTextContent('O NORQVA guarda só a estrutura. Textos, imagens e nomes da referência não são salvos.');
    const rows = await screen.findAllByTestId('reference-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Pronta');
    expect(rows[1]).toHaveTextContent('Falhou');
    fireEvent.click(rows[0]);
    const cards = await screen.findAllByTestId('reference-section');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('Abertura (gancho)');
    expect(cards[0]).toHaveTextContent('Abertura com pergunta sobre a dor do leitor');
    expect(cards[0]).toHaveTextContent('Título em pergunta');
    expect(cards[0]).toHaveTextContent('~120 palavras');
    expect(cards[0]).toHaveTextContent('vídeo');
    expect(cards[0]).toHaveTextContent('1 botão');
    expect(cards[1]).toHaveTextContent('Garantia');
    expect(cards[1]).toHaveTextContent('2 botões');
    fireEvent.click(screen.getByText('Voltar'));
    fireEvent.click((await screen.findAllByTestId('reference-row'))[1]);
    expect(await screen.findByTestId('reference-failure')).toHaveTextContent('IA não configurada');
  });

  it('lista que não carrega mostra erro (não "nenhuma"); trava desligada no meio volta para Criativos', async () => {
    const apiFetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/creative-factory/creatives?')) return Promise.resolve(factory);
      if (url === '/creative-references/status') return Promise.resolve({ enabled: true });
      if (url === '/creative-references') return Promise.reject(new Error('Falha de rede'));
      return Promise.resolve({});
    });
    const { unmount } = render(
      <CreativeFactoryView currentUser={admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} products={products} />
    );
    fireEvent.click(await screen.findByTestId('factory-section-references'));
    expect(await screen.findByTestId('references-error')).toHaveTextContent('Falha de rede');
    expect(screen.queryByTestId('references-empty')).toBeNull();
    unmount();

    const off = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/creative-factory/creatives?')) return Promise.resolve(factory);
      if (url === '/creative-references/status') return Promise.resolve({ enabled: true });
      if (url === '/creative-references') return Promise.reject(new Error('Referências estão desligadas neste ambiente (CREATIVE_REFERENCES_ENABLED).'));
      return Promise.resolve({});
    });
    render(<CreativeFactoryView currentUser={admin} isDemoView={false} apiFetch={off} showError={vi.fn()} showSuccess={vi.fn()} products={products} />);
    fireEvent.click(await screen.findByTestId('factory-section-references'));
    await waitFor(() => expect(screen.queryByTestId('factory-section-references')).toBeNull());
    expect(screen.queryByTestId('creative-references')).toBeNull();
  });

  it('envia o link com produto e tipo', async () => {
    const apiFetch = setup(true);
    fireEvent.click(await screen.findByTestId('factory-section-references'));
    fireEvent.change(await screen.findByLabelText('Link da página ou do anúncio'), { target: { value: 'https://concorrente.test/pagina' } });
    fireEvent.change(screen.getByLabelText('Produto nosso'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'AD' } });
    fireEvent.click(screen.getByTestId('reference-submit'));
    await waitFor(() => {
      const call = apiFetch.mock.calls.find(c => c[0] === '/creative-references' && (c[1] as any)?.method === 'POST');
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as any).body)).toEqual({ url: 'https://concorrente.test/pagina', product_id: 'p1', reference_type: 'AD' });
    });
  });
});
