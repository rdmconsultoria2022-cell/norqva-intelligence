// NORQVA-0056: campanha que já está na Meta: "Editar anúncio na Meta" troca link, texto, título e botão.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { CampaignsView } from '../features/campaigns/CampaignsView';

const admin = { id: 'u1', name: 'Admin', email: 'a@norqva.test', role: 'ADMIN' } as any;
const viewer = { id: 'u2', name: 'Perf', email: 'p@norqva.test', role: 'PERFORMANCE' } as any;
const KIT = 'https://norqva-intelligence-frontend.vercel.app/kit/OFF-000006';

const campaign = (over: any = {}) => ({
  id: 'p1',
  code: 'TR-EXP02',
  status: 'ACTIVE',
  offer_human_id: 'OFF-000001',
  daily_budget_brl: 20,
  max_spend_brl: 140,
  editable: false,
  manual_fields: {},
  ad_creatives: {},
  meta_ids: { ads: { TR_V1_EMO: '120200000000001' } },
  spec: {
    campaign: { name: 'NORQVA_TRATTORIA_EXP02_CREATIVE' },
    adsets: [{ name: 'TR_AS01', daily_budget_brl: 20 }],
    ads: [
      { name: 'TR_V1_EMO', adset_name: 'TR_AS01', video_url: 'https://cdn.test/a.mp4', primary_text: 'Antigo', headline: 'Antigo', cta: 'LEARN_MORE', destination_url: 'https://norqva-intelligence-frontend.vercel.app/p/OFF-000001' },
      { name: 'TR_V9_NOVO', adset_name: 'TR_AS01', video_url: 'https://cdn.test/b.mp4', primary_text: 'x', headline: 'y', cta: 'LEARN_MORE', destination_url: 'https://norqva-intelligence-frontend.vercel.app/p/OFF-000001' }
    ]
  },
  ...over
});

const setup = (user = admin) => {
  const camp = campaign();
  const success = vi.fn();
  const apiFetch = vi.fn().mockImplementation((url: string) => {
    if (url === '/campaigns?mode=real') return Promise.resolve({ campaigns: [camp] });
    if (url === '/campaigns/p1?mode=real') return Promise.resolve(camp);
    if (url.includes('/creative-options')) return Promise.resolve({ options: [] });
    if (url.startsWith('/launch-plans')) return Promise.resolve({ plans: [] });
    if (url.includes('/replace-on-meta')) {
      const next = campaign();
      next.spec.ads[0] = { ...next.spec.ads[0], destination_url: KIT, primary_text: 'Texto novo', cta: 'SEE_DETAILS' };
      return Promise.resolve({ creative_id: '888', campaign: next });
    }
    return Promise.resolve({});
  });
  render(<CampaignsView currentUser={user} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={success} offers={[]} />);
  return { apiFetch, success };
};

const open = async () => {
  fireEvent.click(await screen.findByText('NORQVA_TRATTORIA_EXP02_CREATIVE'));
  // NORQVA-0096: os anúncios ficam na aba Criativos
  fireEvent.click(within(await screen.findByTestId('campaign-tabs')).getByText('Criativos'));
  await screen.findByTestId('creatives-tab');
};

describe('NORQVA-0056 — editar anúncio que já está na Meta', () => {
  it('botão só nos anúncios que existem na Meta; troca pede o código e envia os campos', async () => {
    const { apiFetch, success } = setup();
    await open();
    expect(screen.getByTestId('ad-meta-edit-0')).toBeInTheDocument();
    expect(screen.queryByTestId('ad-meta-edit-1')).toBeNull();
    fireEvent.click(screen.getByTestId('ad-meta-edit-0'));
    fireEvent.change(screen.getByLabelText('Novo link do anúncio 1'), { target: { value: KIT } });
    fireEvent.change(screen.getByLabelText('Novo texto do anúncio 1'), { target: { value: 'Texto novo' } });
    fireEvent.change(screen.getByLabelText('Novo botão do anúncio 1'), { target: { value: 'SEE_DETAILS' } });
    expect(screen.getByTestId('ad-meta-submit-0')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Código para trocar o anúncio 1'), { target: { value: 'tr-exp02' } });
    expect(screen.getByTestId('ad-meta-submit-0')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('ad-meta-submit-0'));
    await waitFor(() => expect(success).toHaveBeenCalled());
    const call = apiFetch.mock.calls.find(c => String(c[0]).includes('/replace-on-meta'))!;
    expect(call[0]).toBe('/campaigns/p1/ads/0/replace-on-meta?mode=real');
    expect(JSON.parse((call[1] as any).body)).toEqual({
      destination_url: KIT,
      primary_text: 'Texto novo',
      headline: 'Antigo',
      cta: 'SEE_DETAILS',
      confirm_code: 'tr-exp02'
    });
    // a tela passa a mostrar o anúncio atualizado
    await waitFor(() => expect((screen.getByLabelText('Link do anúncio 1') as HTMLInputElement).value).toBe(KIT));
    expect(screen.queryByTestId('ad-meta-form-0')).toBeNull();
  });

  it('perfil sem ADMIN não vê o botão', async () => {
    setup(viewer);
    await open();
    expect(screen.queryByTestId('ad-meta-edit-0')).toBeNull();
  });
});
