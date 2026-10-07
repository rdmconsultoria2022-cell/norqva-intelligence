import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ShortlistPanel, criteriaQuery, DEFAULT_SHORTLIST_CRITERIA } from '../features/intelligence/ShortlistPanel';

// NORQVA-0021 (P1): seleção automática (até 30) para o Time de IAs.

const cand = (over: any) => ({
  rank: 1, level: 'campaign', key: 'c1', name: 'TR_V2_FOOD', status: 'ACTIVE', campaign_name: null, product_name: 'Trattoria em Casa',
  classification: 'PROMISSOR', score: 55, confidence: 0.6, days_active: 7, spend: 38.86, sales: 2, revenue: 39.8, cpa: 19.43, breakeven_cpa: 26,
  roas: 1.02, ctr_link: 1.8, hook_rate: 25, landing_page_views: 80, reason: 'CPA dentro do equilíbrio', why: ['2 venda(s), receita R$ 39,80', '7 dia(s) no ar, R$ 38,86 investidos'],
  flags: [], opportunity: null, ...over
});

const payload = {
  criteria: DEFAULT_SHORTLIST_CRITERIA,
  candidates: [
    cand({}),
    cand({ rank: 2, level: 'ad', key: 'a1', name: 'TRATTORIA_V1_AD_C', campaign_name: 'NORQVA_TRATTORIA_REVENUE_V1', flags: ['CPA acima do equilíbrio'] }),
    cand({ rank: 3, key: 'c2', name: 'JA_ENVIADA', opportunity: { id: 'o1', human_id: 'OPP-0007', status: 'CAPTADA' } })
  ],
  pool: { campaign: 5, ad: 17 },
  excluded: { total: 4, by_reason: { CLASS: 3, MIN_SPEND: 1 } },
  note: 'Só 3 de 30 candidatos passaram nos critérios. A base tem 5 campanha(s) e 17 anúncio(s) no período; afrouxe os critérios ou amplie o período para ver mais.'
};

function setup(canSend = true) {
  const showSuccess = vi.fn();
  const apiFetch = vi.fn(async (url: string, _opts?: RequestInit) => {
    if (url.startsWith('/intelligence/shortlist')) return payload;
    if (url.startsWith('/ai-team/shortlist/send')) return { created: [{ human_id: 'OPP-0008' }], skipped: [] };
    return {};
  });
  render(<ShortlistPanel mode="real" periodQs="period=7d" canSend={canSend} apiFetch={apiFetch} showError={vi.fn()} showSuccess={showSuccess} />);
  return { apiFetch, showSuccess };
}

describe('NORQVA-0021 — Seleção para o Time de IAs', () => {
  it('serializes criteria (30 by default)', () => {
    const q = criteriaQuery(DEFAULT_SHORTLIST_CRITERIA);
    expect(q).toContain('limit=30');
    expect(q).toContain('levels=campaign%2Cad');
    expect(criteriaQuery({ ...DEFAULT_SHORTLIST_CRITERIA, max_cpa_ratio: null })).toContain('max_cpa_ratio=none');
  });

  it('shows candidates, criteria, exclusions and the honest note', async () => {
    const { apiFetch } = setup();
    await waitFor(() => expect(screen.getAllByTestId('shortlist-row')).toHaveLength(3));
    expect(apiFetch.mock.calls[0][0]).toContain('limit=30');
    expect(apiFetch.mock.calls[0][0]).toContain('period=7d');
    expect(screen.getByTestId('shortlist-criteria-summary')).toHaveTextContent('Dias no ar ≥ 2');
    expect(screen.getByTestId('shortlist-note')).toHaveTextContent('Só 3 de 30');
    expect(screen.getByTestId('shortlist-excluded')).toHaveTextContent('3 classe fora dos critérios');
    expect(screen.getByTestId('shortlist-sent')).toHaveTextContent('OPP-0007');
    expect(screen.getByText(/CPA acima do equilíbrio/)).toBeInTheDocument();
  });

  it('sends only the selected, not-yet-sent candidates', async () => {
    const { apiFetch, showSuccess } = setup();
    await waitFor(() => expect(screen.getAllByTestId('shortlist-row')).toHaveLength(3));
    expect(screen.getByRole('button', { name: /Enviar 2 ao Time de IAs/ })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Selecionar TRATTORIA_V1_AD_C'));
    fireEvent.click(screen.getByRole('button', { name: /Enviar 1 ao Time de IAs/ }));
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    const call = apiFetch.mock.calls.find(c => String(c[0]).startsWith('/ai-team/shortlist/send'));
    const body = JSON.parse(String((call as any)[1].body));
    expect(body.items).toEqual([{ level: 'campaign', key: 'c1' }]);
    expect(body.criteria.limit).toBe(30);
  });

  it('applies edited criteria', async () => {
    const { apiFetch } = setup();
    await waitFor(() => expect(screen.getAllByTestId('shortlist-row')).toHaveLength(3));
    fireEvent.click(screen.getByRole('button', { name: /Critérios/ }));
    fireEvent.change(screen.getByLabelText('Quantidade máxima'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar critérios' }));
    await waitFor(() => expect(apiFetch.mock.calls.some(c => String(c[0]).includes('limit=10'))).toBe(true));
  });

  it('read-only roles see the list but cannot send', async () => {
    setup(false);
    await waitFor(() => expect(screen.getAllByTestId('shortlist-row')).toHaveLength(3));
    expect(screen.queryByRole('button', { name: /ao Time de IAs/ })).toBeNull();
  });
});
