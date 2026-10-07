import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LaunchSheetCard } from '../features/intelligence/AiTeamView';

// NORQVA-0021 (P3): ficha da campanha na tela do Time de IAs.

const sheet = {
  code: 'OPP-0042-L01', campaign_name: 'NORQVA_TR_OPP42', daily_budget_brl: 30, max_spend_brl: 210,
  destination_url: 'https://norqva-intelligence-frontend.vercel.app/p/OFF-TRATTORIA-2990',
  adsets: [{ name: 'OPP-0042-L01_AS01', daily_budget_brl: 30, targeting: { countries: ['BR'], age_min: 25, age_max: 65 }, targeting_summary: 'Brasil amplo' }],
  ads: [{ name: 'OPP-0042-B01-C01', adset_name: 'OPP-0042-L01_AS01' }, { name: 'OPP-0042-B01-C02', adset_name: 'OPP-0042-L01_AS01' }],
  excluded_creatives: [{ key: 'OPP-0042-B01-C03', format: 'IMAGE' }],
  pause_rules: ['Pausar com 2× o CPA sem venda.'],
  draft: { id: 'x', code: 'OPP-0042-L01', status: 'DRAFT' },
  note: null
};

describe('NORQVA-0021 — ficha da campanha', () => {
  it('shows campaign, budget, ceiling, ad sets, excluded creatives and the DRAFT plan', () => {
    render(<LaunchSheetCard l={sheet} />);
    const c = screen.getByTestId('ai-launch-sheet');
    expect(c).toHaveTextContent('Plano OPP-0042-L01 · rascunho');
    expect(c).toHaveTextContent('NORQVA_TR_OPP42');
    expect(c).toHaveTextContent('Teto do teste: R$ 210,00');
    expect(c).toHaveTextContent('2 anúncio(s)');
    expect(c).toHaveTextContent('OPP-0042-B01-C03');
    expect(c).toHaveTextContent('Nada foi criado na Meta');
  });

  it('demo / not saved shows the note', () => {
    render(<LaunchSheetCard l={{ ...sheet, draft: null, note: 'Modo demonstração: ficha validada, plano de lançamento não gravado.' }} />);
    expect(screen.getByTestId('ai-launch-sheet')).toHaveTextContent('plano de lançamento não gravado');
  });
});
