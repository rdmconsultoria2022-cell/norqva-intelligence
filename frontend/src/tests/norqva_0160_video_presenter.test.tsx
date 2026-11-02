// NORQVA-0160 (etapa B): painel "Vídeo com apresentadora" na Fábrica. API sempre simulada.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VideoPresenterPanel } from '../features/creative-factory/VideoPresenterPanel';

const pageId = '55555555-5555-4555-8555-555555555555';
const productId = '11111111-1111-4111-8111-111111111111';
const offerId = '33333333-3333-4333-8333-333333333333';
const catalog = {
  personas: [{ id: 1, name: 'Dona Lena', image: 'https://motor.test/a.jpg' }],
  templates: [{ id: 'selfie_caminhando', name: 'Selfie', durations: [{ seconds: 15, scenes: 3 }, { seconds: 30, scenes: 5 }] }],
  budget: { monthly_usd: 150, spent_month_usd: 12.5 }
};
const prod = (over: any = {}, motor: any = {}) => ({
  id: 'v1', status: 'roteiro', duration_s: 30, estimated_cost_usd: 4.5, created_at: '2026-11-01T20:00:00Z', price_issues: [],
  motor: { id: 77, status: 'roteiro', custo_estimado_usd: 4.5, alertas: [], precisa_aprovacao_extra: false,
    cenas: [{ id: 501, ordem: 1, fala: 'Olha só', acao: 'andando', enquadramento: 'medio', tentativas: [], tentativa_em_uso: null }], ...motor },
  ...over
});

function setup(handler: (url: string, o?: RequestInit) => any, props: Partial<React.ComponentProps<typeof VideoPresenterPanel>> = {}) {
  const apiFetch = vi.fn(async (url: string, o?: RequestInit) => handler(url, o));
  const showError = vi.fn();
  const showSuccess = vi.fn();
  render(<VideoPresenterPanel apiFetch={apiFetch} pageId={pageId} productId={productId} offerId={offerId} isAdmin canEdit
    showError={showError} showSuccess={showSuccess} pollMs={10} {...props} />);
  return { apiFetch, showError, showSuccess };
}

describe('NORQVA-0160 — painel de vídeo com apresentadora', () => {
  it('função desligada: não aparece e não mostra erro', async () => {
    const { showError, apiFetch } = setup(() => { throw new Error('O vídeo com apresentadora ainda não está ligado neste ambiente.'); });
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(screen.queryByTestId('video-presenter')).toBeNull();
    expect(showError).not.toHaveBeenCalled();
  });

  it('cria o roteiro com produto, oferta, página e personagem', async () => {
    const { apiFetch } = setup((url, o) => {
      if (url === '/video-factory/catalog') return catalog;
      if (url.startsWith('/video-factory/productions?')) return [];
      if (url === '/video-factory/productions' && o?.method === 'POST') return prod();
      throw new Error('inesperado ' + url);
    });
    await screen.findByTestId('video-create');
    expect(screen.getByTestId('video-budget').textContent).toMatch(/restam US\$ 137,50/);
    fireEvent.change(screen.getByLabelText('Duração'), { target: { value: '15' } });
    fireEvent.click(screen.getByTestId('video-create-btn'));
    await screen.findByTestId('video-production');
    const call = apiFetch.mock.calls.find(c => c[0] === '/video-factory/productions');
    expect(JSON.parse(String(call![1]!.body))).toMatchObject({ product_id: productId, offer_id: offerId, generated_page_id: pageId, persona_id: 1, duration_s: 15 });
  });

  it('aprovar gasto pede confirmação e só administrador vê o botão', async () => {
    const handler = (url: string, o?: RequestInit) => {
      if (url === '/video-factory/catalog') return catalog;
      if (url.startsWith('/video-factory/productions?')) return [{ id: 'v1', status: 'roteiro' }];
      if (url === '/video-factory/productions/v1') return prod();
      if (url.endsWith('/approve') && o?.method === 'POST') return prod({ status: 'gerando' }, { status: 'gerando' });
      throw new Error('inesperado ' + url);
    };
    const { apiFetch } = setup(handler);
    fireEvent.click(await screen.findByTestId('video-approve-btn'));
    expect(apiFetch.mock.calls.some(c => String(c[0]).endsWith('/approve'))).toBe(false);
    fireEvent.click(screen.getByTestId('video-approve-confirm'));
    await waitFor(() => expect(screen.getByTestId('video-status').textContent).toMatch(/Gerando/));
    expect(apiFetch.mock.calls.filter(c => String(c[0]).endsWith('/approve'))).toHaveLength(1);
  });

  it('equipe de criativos não aprova gasto; fala com preço aparece como pendência', async () => {
    setup((url) => {
      if (url === '/video-factory/catalog') return catalog;
      if (url.startsWith('/video-factory/productions?')) return [{ id: 'v1' }];
      if (url === '/video-factory/productions/v1') return prod({ price_issues: [{ scene_id: 501, order: 1, match: 'R$ 19,90' }] });
      throw new Error('inesperado ' + url);
    }, { isAdmin: false });
    await screen.findByTestId('video-production');
    expect(screen.queryByTestId('video-approve-btn')).toBeNull();
    expect(screen.getByTestId('video-alerts').textContent).toMatch(/não fala preço/);
  });

  it('render novo do App (funções novas) não recarrega nem apaga fala não salva', async () => {
    const handler = (url: string) => {
      if (url === '/video-factory/catalog') return catalog;
      if (url.startsWith('/video-factory/productions?')) return [{ id: 'v1' }];
      if (url === '/video-factory/productions/v1') return prod();
      throw new Error('inesperado ' + url);
    };
    const a1 = vi.fn(async (u: string) => handler(u));
    const props = { pageId, productId, offerId, isAdmin: true, canEdit: true, pollMs: 10 };
    const { rerender } = render(<VideoPresenterPanel apiFetch={a1} showError={vi.fn()} showSuccess={vi.fn()} {...props} />);
    const box = await screen.findByLabelText('Fala da cena 1');
    fireEvent.change(box, { target: { value: 'Fala editada' } });
    const a2 = vi.fn(async (u: string) => handler(u));
    rerender(<VideoPresenterPanel apiFetch={a2} showError={vi.fn()} showSuccess={vi.fn()} {...props} />);
    await new Promise(r => setTimeout(r, 30));
    expect(a2).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Fala da cena 1') as HTMLTextAreaElement).value).toBe('Fala editada');
  });

  it('atualização automática continua depois de uma falha', async () => {
    let gets = 0;
    setup((url) => {
      if (url === '/video-factory/catalog') return catalog;
      if (url.startsWith('/video-factory/productions?')) return [{ id: 'v1' }];
      if (url === '/video-factory/productions/v1') {
        gets += 1;
        if (gets === 1) return prod({ status: 'gerando' }, { status: 'gerando' });
        if (gets === 2) throw new Error('rede');
        return prod({ status: 'revisao' }, { status: 'revisao' });
      }
      throw new Error('inesperado ' + url);
    });
    await waitFor(() => expect(screen.getByTestId('video-status').textContent).toMatch(/revisar/));
    expect(gets).toBeGreaterThanOrEqual(3);
  });
});
