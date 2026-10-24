// NORQVA-0121 (contrato NORQVA-0118, etapa C): todos os ajustes de publicação no formulário da campanha pausada.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { GeneratedCampaignPanel } from '../features/creative-factory/GeneratedCampaignPanel';

const states = { MG: 'Minas Gerais', SP: 'São Paulo', RJ: 'Rio de Janeiro' };
const overview = (over: any = {}) => ({
  plan: null,
  rebuildable: false,
  page: { id: 'g1', human_id: 'GEN-000001', status: 'PUBLISHED', url: 'https://acesso.norqva.com.br/v/livro-abc123' },
  mutation_enabled: true,
  images: 2,
  ads: [
    { id: 'c1', human_id: 'GEN-000001-A1', headline: 'Massa fresca', ready: true },
    { id: 'c2', human_id: 'GEN-000001-A2', headline: 'Molhos da nonna', ready: true },
    { id: 'c3', human_id: 'GEN-000001-A3', headline: 'Bloqueado', ready: false, reason: 'ainda não foi aprovado.' }
  ],
  destinations: [
    { value: 'PAGE', label: 'Página gerada', url: 'https://acesso.norqva.com.br/v/livro-abc123', available: true },
    { value: 'OFFER_PAGE', label: 'Página da oferta', url: 'https://norqva-intelligence-frontend.vercel.app/p/OFF-000001', available: true },
    { value: 'WHATSAPP', label: 'WhatsApp', url: null, available: false, reason: 'Fica disponível quando o número oficial estiver ativo.' }
  ],
  states,
  defaults: {
    campaign_name: 'NQ – Trattoria – Ref REF-000001 – Vendas', daily_budget_brl: 30, max_spend_brl: 210, age_min: 45, age_max: 65,
    destination: 'PAGE', regions: [], genders: 'ALL', placements: 'AUTOMATIC', advantage_audience: true, end_date: null, min_daily_budget_brl: 6, max_daily_budget_brl: 100
  },
  ...over
});
const approved = { id: 'c1', approval_status: 'APPROVED', copy_check: { blocked: false } };

const open = async (apiFetch: any) => {
  render(<GeneratedCampaignPanel apiFetch={apiFetch} pageId="g1" pageStatus="PUBLISHED" ads={[approved]} showError={vi.fn()} showSuccess={vi.fn()} />);
  fireEvent.click(await screen.findByTestId('create-paused-campaign'));
  return screen.getByTestId('publish-options');
};

describe('NORQVA-0121 — ajustes de publicação', () => {
  it('padrões aprovados já preenchidos; idade 45–65 com Advantage aparece como sugestão; WhatsApp ainda travado', async () => {
    const apiFetch = vi.fn().mockResolvedValue(overview());
    const box = await open(apiFetch);
    expect(screen.getByLabelText('Idade de')).toHaveValue(45);
    expect(screen.getByTestId('cmp-advantage')).toBeChecked();
    expect(screen.getByTestId('cmp-age-hint')).toHaveTextContent('vira sugestão');
    const radios = within(box).getAllByRole('radio');
    expect(radios[0]).toBeChecked();
    expect(radios[2]).toBeDisabled();
    expect(box).toHaveTextContent('Fica disponível quando o número oficial estiver ativo.');
    // só os anúncios prontos aparecem para escolher
    expect(screen.getByTestId('cmp-ad-GEN-000001-A1')).toBeChecked();
    expect(screen.queryByTestId('cmp-ad-GEN-000001-A3')).toBeNull();
    expect(screen.getByTestId('cmp-age-hint')).toHaveTextContent('de 25 a 65 anos');
    // faixa jovem: o controle é a idade escolhida, não 25
    fireEvent.change(screen.getByLabelText('Idade de'), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('até'), { target: { value: '40' } });
    expect(screen.getByTestId('cmp-age-hint')).toHaveTextContent('de 18 a 65 anos');
    // sexo também vira sugestão com o Advantage
    fireEvent.change(screen.getByLabelText('Idade de'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('até'), { target: { value: '65' } });
    expect(screen.queryByTestId('cmp-age-hint')).toBeNull();
    fireEvent.change(screen.getByLabelText('Sexo'), { target: { value: 'FEMALE' } });
    expect(screen.getByTestId('cmp-age-hint')).toHaveTextContent('o sexo vira sugestão');
    fireEvent.change(screen.getByLabelText('Sexo'), { target: { value: 'ALL' } });
    fireEvent.change(screen.getByLabelText('Idade de'), { target: { value: '45' } });
    // término: de amanhã até 1 ano
    const end = screen.getByLabelText('Término (opcional)');
    expect(end.getAttribute('min')! > new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)).toBe(true);
    expect(end).toHaveAttribute('max');
    // desligar o Advantage trava a idade (sem aviso de sugestão)
    fireEvent.click(screen.getByTestId('cmp-advantage'));
    expect(screen.queryByTestId('cmp-age-hint')).toBeNull();
  });

  it('manda todos os ajustes escolhidos', async () => {
    const apiFetch = vi.fn().mockImplementation((url: string, opts?: any) =>
      Promise.resolve(opts?.method === 'POST' ? { plan: { id: 'p1', code: 'CMP-GEN-000001', status: 'AWAITING_OPERATOR', spec: { campaign: { name: 'NQ' } } }, created: true } : overview())
    );
    const box = await open(apiFetch);
    fireEvent.click(within(box).getAllByRole('radio')[1]);
    fireEvent.click(screen.getByTestId('cmp-pick-states'));
    fireEvent.click(within(screen.getByTestId('cmp-states')).getByText('SP'));
    fireEvent.click(within(screen.getByTestId('cmp-states')).getByText('MG'));
    fireEvent.change(screen.getByLabelText('Sexo'), { target: { value: 'FEMALE' } });
    fireEvent.change(screen.getByLabelText('Onde aparece'), { target: { value: 'FACEBOOK_INSTAGRAM' } });
    fireEvent.change(screen.getByLabelText('Término (opcional)'), { target: { value: '2027-01-31' } });
    fireEvent.click(screen.getByTestId('cmp-ad-GEN-000001-A1'));
    fireEvent.click(screen.getByTestId('campaign-submit'));
    await waitFor(() => expect(apiFetch.mock.calls.some((c: any[]) => c[1]?.method === 'POST')).toBe(true));
    const body = JSON.parse(apiFetch.mock.calls.find((c: any[]) => c[1]?.method === 'POST')![1].body);
    expect(body).toMatchObject({
      destination: 'OFFER_PAGE', regions: ['MG', 'SP'], genders: 'FEMALE', placements: 'FACEBOOK_INSTAGRAM', advantage_audience: true,
      end_date: '2027-01-31', age_min: 45, age_max: 65, creative_ids: ['c2']
    });
  });

  it('"Brasil inteiro" limpa os estados; sem anúncio escolhido não deixa criar', async () => {
    const apiFetch = vi.fn().mockResolvedValue(overview());
    await open(apiFetch);
    expect(screen.queryByTestId('cmp-states')).toBeNull();
    fireEvent.click(screen.getByTestId('cmp-pick-states'));
    const sp = within(screen.getByTestId('cmp-states')).getByText('SP');
    fireEvent.click(sp);
    expect(sp).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('cmp-pick-states')).toHaveTextContent('Escolher estados (1)');
    fireEvent.click(screen.getByTestId('cmp-all-brazil'));
    expect(screen.queryByTestId('cmp-states')).toBeNull();
    expect(screen.getByTestId('cmp-pick-states')).toHaveTextContent(/^Escolher estados$/);
    fireEvent.click(screen.getByTestId('cmp-ad-GEN-000001-A1'));
    fireEvent.click(screen.getByTestId('cmp-ad-GEN-000001-A2'));
    expect(screen.getByTestId('campaign-submit')).toBeDisabled();
    // marcar os dois de novo volta para "todos" (nada de lista explícita)
    fireEvent.click(screen.getByTestId('cmp-ad-GEN-000001-A1'));
    fireEvent.click(screen.getByTestId('cmp-ad-GEN-000001-A2'));
    expect(screen.getByTestId('campaign-submit')).not.toBeDisabled();
  });
});
