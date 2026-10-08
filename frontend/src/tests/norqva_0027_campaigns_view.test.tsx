// NORQVA-0027: tela Campanhas — modo manual, zerar, preencher e criar pausada com confirmação.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { CampaignsView, fieldsOf } from '../features/campaigns/CampaignsView';

const admin = { id: 'u1', name: 'Admin', email: 'a@norqva.test', role: 'ADMIN' } as any;
const viewer = { id: 'u2', name: 'Perf', email: 'p@norqva.test', role: 'PERFORMANCE' } as any;

const campaign = (over: any = {}) => ({
  id: 'p1',
  code: 'TR-EXP03',
  status: 'DRAFT',
  offer_human_id: 'OFF-000001',
  daily_budget_brl: 20,
  max_spend_brl: 140,
  editable: true,
  manual_fields: { 'ads.0.headline': true },
  ad_creatives: {},
  spec: {
    campaign: { name: 'NORQVA_TR_EXP03' },
    hypothesis: 'Gancho de massa caseira vende mais',
    adsets: [{ name: 'TR_AS01', daily_budget_brl: 20 }],
    ads: [{ name: 'TR-A', adset_name: 'TR_AS01', video_url: 'https://cdn.test/a.mp4', primary_text: 'Texto A', headline: 'Meu título', cta: 'SEE_DETAILS', destination_url: 'https://app.test/p/OFF-000001' }]
  },
  ...over
});

const setup = (opts: { user?: any; camp?: any } = {}) => {
  const camp = opts.camp || campaign();
  const apiFetch = vi.fn().mockImplementation((url: string) => {
    if (url === '/campaigns?mode=real') return Promise.resolve({ campaigns: [camp] });
    if (url === '/campaigns/p1?mode=real') return Promise.resolve(camp);
    if (url.includes('/creative-options')) return Promise.resolve({ options: [{ id: 'c1', human_id: 'TR-A', ok: true }] });
    if (url.startsWith('/launch-plans?') || url === '/launch-plans') return Promise.resolve({ plans: [] });
    if (url.includes('/fields')) return Promise.resolve(campaign({ manual_fields: { 'ads.0.headline': true, 'ads.0.primary_text': true } }));
    if (url.includes('/fill')) return Promise.resolve({ campaign: camp, results: [{ index: 0, ad: 'TR-A', status: 'SKIPPED', reason: 'O criativo ainda não foi aprovado.' }] });
    if (url.includes('/create')) return Promise.resolve({ plan: { ...camp, status: 'AWAITING_OPERATOR' } });
    return Promise.resolve({});
  });
  render(<CampaignsView currentUser={opts.user || admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} offers={[]} />);
  return apiFetch;
};

const open = async () => {
  fireEvent.click(await screen.findByText('NORQVA_TR_EXP03'));
  await screen.findByTestId('campaign-detail');
};

describe('NORQVA-0027 — tela Campanhas', () => {
  it('fieldsOf monta os caminhos editáveis', () => {
    const f = fieldsOf(campaign());
    expect(f['ads.0.headline']).toBe('Meu título');
    expect(f['adsets.0.daily_budget_brl']).toBe('20');
    expect(f.max_spend_brl).toBe('140');
  });

  it('mostra o selo manual e salva só o que mudou', async () => {
    const apiFetch = setup();
    await open();
    expect(screen.getByTestId('manual-ads.0.headline')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Texto do anúncio 1'), { target: { value: 'Texto novo' } });
    fireEvent.click(screen.getByTestId('save-fields'));
    await waitFor(() => {
      const call = apiFetch.mock.calls.find(c => String(c[0]).includes('/fields'));
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as any).body)).toEqual({ fields: { 'ads.0.primary_text': 'Texto novo' } });
    });
  });

  it('Zerar limpa os campos editáveis sem salvar', async () => {
    const apiFetch = setup();
    await open();
    fireEvent.click(screen.getByTestId('blank-fields'));
    expect((screen.getByLabelText('Título do anúncio 1') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Teto de gasto') as HTMLInputElement).value).toBe('');
    expect(apiFetch.mock.calls.some(c => String(c[0]).includes('/fields'))).toBe(false);
    expect(screen.getByTestId('create-on-meta')).toBeDisabled();
  });

  it('preencher mostra por que um anúncio ficou de fora', async () => {
    setup();
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Preencher com os criativos aprovados/ }));
    expect(await screen.findByTestId('fill-results')).toHaveTextContent('ainda não foi aprovado');
  });

  it('criar na Meta pede confirmação e chama a criação pausada', async () => {
    const apiFetch = setup();
    await open();
    fireEvent.click(screen.getByTestId('create-on-meta'));
    expect(screen.getByTestId('confirm-create')).toHaveTextContent('tudo pausado');
    expect(apiFetch.mock.calls.some(c => String(c[0]).includes('/create'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Criar pausada' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/launch-plans/p1/create', expect.objectContaining({ method: 'POST' })));
  });

  it('campanha já na Meta fica só leitura; vídeo a preencher bloqueia criar', async () => {
    setup({ camp: campaign({ editable: false, status: 'AWAITING_OPERATOR' }) });
    await open();
    expect(screen.getByTestId('campaign-readonly')).toBeInTheDocument();
    expect(screen.queryByTestId('create-on-meta')).not.toBeInTheDocument();
  });

  // NORQVA-0028: perfis de análise veem a tela só para leitura
  it('perfil sem ADMIN vê a campanha sem os botões de ação', async () => {
    const apiFetch = setup({ user: viewer });
    await open();
    expect(screen.getByTestId('campaign-readonly')).toHaveTextContent('Só leitura');
    expect(screen.queryByTestId('new-campaign')).not.toBeInTheDocument();
    expect(screen.queryByTestId('save-fields')).not.toBeInTheDocument();
    expect(screen.queryByTestId('create-on-meta')).not.toBeInTheDocument();
    expect((screen.getByLabelText('Título do anúncio 1') as HTMLInputElement).disabled).toBe(true);
    expect(apiFetch.mock.calls.some(c => String(c[0]).includes('/creative-options'))).toBe(false);
  });
});
