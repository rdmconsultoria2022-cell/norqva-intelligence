// NORQVA-0119: nota de força estimada da referência (passo 2 e detalhe da referência) e resultados reais
// da nossa campanha no passo 6 da Fábrica.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { ReferenceScoreCard } from '../features/creative-factory/ReferenceScoreCard';
import { FactoryResults, planCampaignId } from '../features/creative-factory/FactoryResults';

const score = {
  score: 72,
  max: 100,
  level: 'FORTE',
  level_label: 'Forte',
  estimate: true,
  has_signals: true,
  summary: 'Estimativa forte (72 de 100), pelo tempo no ar, pelas variações e pela estrutura.',
  items: [
    { key: 'time', label: 'Tempo no ar', points: 32, max: 40, reason: '45 dias no ar. Ninguém mantém tanto tempo um anúncio que não vende.' },
    { key: 'variants', label: 'Variações', points: 10, max: 25, reason: '3 anúncios usam esse criativo. Algumas cópias: sinal de que está funcionando.' },
    { key: 's_hook', label: 'Estrutura', points: 5, max: 5, reason: 'Abre com um gancho' },
    { key: 's_guarantee', label: 'Estrutura', points: 0, max: 5, reason: 'Sem garantia' }
  ]
};

describe('NORQVA-0119 — nota estimada', () => {
  it('mostra a nota, o nível, que é estimativa e o motivo de cada ponto', () => {
    render(<ReferenceScoreCard score={score} />);
    expect(screen.getByTestId('reference-score-value')).toHaveTextContent('72');
    const head = screen.getByTestId('reference-score');
    expect(within(head).getByText('Forte')).toBeInTheDocument();
    expect(within(head).getByText('Estimativa')).toBeInTheDocument();
    expect(screen.getByText('Sinais de força (42 de 65)')).toBeInTheDocument();
    expect(screen.getByText('Estrutura (5 de 10)')).toBeInTheDocument();
    expect(screen.getByText('Sem garantia')).toBeInTheDocument();
    expect(screen.getByText(/45 dias no ar/)).toBeInTheDocument();
  });

  it('sem nota (referência que falhou): não mostra nada', () => {
    const { container } = render(<ReferenceScoreCard score={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('NORQVA-0119 — resultados reais no passo 6', () => {
  const pageId = '55555555-5555-4555-8555-555555555555';

  it('campanha ainda não criada: avisa quando os números aparecem', async () => {
    const api = vi.fn(async () => ({ plan: null }));
    render(<FactoryResults apiFetch={api} pageId={pageId} />);
    expect(await screen.findByTestId('factory-results-empty')).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('soma só os anúncios da campanha do plano e compara com o equilíbrio da oferta', async () => {
    const plan = { id: 'plan-1', meta_ids: { campaign: { 'NQ – x': '120000000001' } } };
    const row = (campaign_id: string, spend: number, paid_orders: number, gross_revenue: number) => ({
      ad_id: `${campaign_id}-${spend}`, adset_id: 'a', campaign_id, spend, impressions: 1000, clicks: 10, link_clicks: 10, offer_views: 5, checkout_started: 2, paid_orders, gross_revenue
    });
    const api = vi.fn(async (url: string) => {
      if (url.endsWith('/campaign')) return { plan };
      if (url.startsWith('/intelligence/creative-performance')) return { creatives: [row('120000000001', 30, 2, 39.8), row('120000000001', 10, 0, 0), row('999', 500, 9, 900)] };
      if (url.startsWith('/campaigns/plan-1/economics')) return { economics: { breakeven_cpa: 15 } };
      return {};
    });
    render(<FactoryResults apiFetch={api} pageId={pageId} />);
    const stats = await screen.findByTestId('factory-results-stats');
    expect(stats).toHaveTextContent('R$ 40,00');
    expect(stats).toHaveTextContent('R$ 39,80');
    expect(stats).toHaveTextContent('R$ 20,00');
    expect(stats).toHaveTextContent('Equilíbrio: até R$ 15,00');
    await waitFor(() => expect(api.mock.calls.some(c => String(c[0]).includes('mode=real'))).toBe(true));
  });

  it('falha ao ler os números: avisa em vez de mostrar zeros', async () => {
    const plan = { id: 'plan-1', meta_ids: { campaign: { x: '120000000001' } } };
    const api = vi.fn(async (url: string) => {
      if (url.endsWith('/campaign')) return { plan };
      if (url.startsWith('/intelligence/creative-performance')) throw new Error('Falha de rede');
      return {};
    });
    render(<FactoryResults apiFetch={api} pageId={pageId} />);
    expect(await screen.findByTestId('factory-results-error')).toBeInTheDocument();
    expect(screen.queryByTestId('factory-results-stats')).toBeNull();
  });

  it('recarrega quando a chave muda (depois de criar a campanha)', async () => {
    let plan: any = null;
    const api = vi.fn(async (url: string) => {
      if (url.endsWith('/campaign')) return { plan };
      if (url.startsWith('/intelligence/creative-performance')) return { creatives: [] };
      return {};
    });
    const { rerender } = render(<FactoryResults apiFetch={api} pageId={pageId} refreshKey={0} />);
    await screen.findByTestId('factory-results-empty');
    plan = { id: 'plan-1', meta_ids: { campaign: { x: '120000000001' } } };
    rerender(<FactoryResults apiFetch={api} pageId={pageId} refreshKey={1} />);
    expect(await screen.findByTestId('factory-results-stats')).toBeInTheDocument();
  });

  it('id da campanha do plano', () => {
    expect(planCampaignId({ meta_ids: { campaign: { a: '123' } } })).toBe('123');
    expect(planCampaignId({ meta_ids: { campaign: {} } })).toBeNull();
    expect(planCampaignId(null)).toBeNull();
  });
});
